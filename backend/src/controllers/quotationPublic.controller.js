import Quotation from "../models/quotation.model.js";
import ProjectApproval from "../models/projectApproval.model.js";
import Installation from "../models/installation.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import { formatQuotation } from "../utils/quotationHelpers.js";
import { createApprovalFromQuotation } from "./quotation.controller.js";
import { resolveProductRefs, adjustProductStockWithInventory } from "../utils/stockAllocation.js";

/**
 * GET /api/public/quotations/:quotationId
 * Public endpoint — returns quotation details for the customer response page.
 * No auth required; accessed via the unique link sent in the email.
 */
export const getPublicQuotation = async (req, res) => {
    try {
        const { quotationId } = req.params;

        const quotation = await Quotation.findOne({ quotationId }).lean();
        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Quotation not found."
            });
        }

        // Return a limited subset — enough for the customer to review
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                quotationId: quotation.quotationId,
                client: quotation.client,
                projectName: quotation.projectName,
                items: quotation.items,
                total: quotation.total,
                gst: quotation.gst,
                grandTotal: quotation.grandTotal,
                validUntil: quotation.validUntil,
                version: quotation.version,
                status: quotation.status,
                customerResponse: quotation.customerResponse || {},
                emailSentAt: quotation.emailSentAt,
                requestedItems: quotation.requestedItems || []
            }
        });
    } catch (error) {
        console.error("Get Public Quotation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to load quotation."
        });
    }
};

/**
 * POST /api/public/quotations/:quotationId/respond
 * Public endpoint — customer submits their response (approve/reject/negotiate).
 * Body: { action: "Approved"|"Rejected"|"Negotiating", signature?: string, reason?: string }
 */
export const respondToQuotation = async (req, res) => {
    try {
        const { quotationId } = req.params;
        const { action, signature, reason } = req.body;

        if (!action || !["Approved", "Rejected", "Negotiating"].includes(action)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid action. Must be Approved, Rejected, or Negotiating."
            });
        }

        const quotation = await Quotation.findOne({ quotationId });
        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Quotation not found."
            });
        }

        const isMaterialRequest = quotation.type === "Material Request" || quotation.type === "Remaining Products";
        const hasPendingRequested = (quotation.requestedItems || []).some(r => r.status === "Pending");
        const onlyMaterialItems = hasPendingRequested && (!quotation.items || (quotation.items instanceof Map ? quotation.items.size : Object.keys(quotation.items || {}).length) === 0);

        // Signature required unless this quotation only has material request items
        if (action === "Approved" && !onlyMaterialItems && !isMaterialRequest && !signature) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Digital signature is required for approval."
            });
        }

        if ((action === "Rejected" || action === "Negotiating") && (!reason || !reason.trim())) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `A reason is required for ${action.toLowerCase()}.`
            });
        }

        if (quotation.status !== "Sent" && quotation.status !== "Negotiating" && quotation.status !== "Draft" && quotation.status !== "Pending Approval") {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `This quotation is in "${quotation.status}" status and cannot be responded to.`
            });
        }

        quotation.customerResponse = {
            action,
            signature: signature || "",
            reason: reason || "",
            respondedAt: new Date()
        };

        if (action === "Approved") {
            quotation.status = "Approved";
            quotation.approvedBy = quotation.client || "Customer";
        } else if (action === "Rejected") {
            quotation.status = "Rejected";
        } else if (action === "Negotiating") {
            quotation.status = "Negotiating";
        }

        // Sync response and status onto version history snapshot
        if (!quotation.versions || quotation.versions.length === 0) {
            quotation.versions = [{
                version: quotation.version || 1,
                items: quotation.items,
                total: quotation.total || 0,
                gst: quotation.gst || 0,
                grandTotal: quotation.grandTotal || 0,
                status: quotation.status,
                validUntil: quotation.validUntil,
                customerResponse: quotation.customerResponse,
                createdAt: quotation.createdAt || new Date(),
                notes: action === "Negotiating" ? `Customer requested negotiation: ${reason || ''}` : `Customer ${action}`
            }];
        } else {
            const lastIdx = quotation.versions.length - 1;
            quotation.versions[lastIdx].customerResponse = quotation.customerResponse;
            quotation.versions[lastIdx].status = quotation.status;
            if (action === "Negotiating") {
                quotation.versions[lastIdx].notes = `Customer requested negotiation: ${reason || ''}`;
            }
        }

        await quotation.save();

        // Approve/Reject requestedItems in existing quotation
        if (action === "Approved" && hasPendingRequested && quotation.installationId) {
            try {
                const installation = await Installation.findById(quotation.installationId);
                if (installation) {
                    const pendingItems = quotation.requestedItems.filter(r => r.status === "Pending");

                    for (const reqItem of pendingItems) {
                        // Add material to installation materials list
                        const newMaterial = {
                            productName: reqItem.productName || "",
                            category: reqItem.category || "",
                            brand: reqItem.brand || "",
                            vendorName: "",
                            price: reqItem.price || 0,
                            stock: 0,
                            quantity: reqItem.qty || 1,
                            quotedQty: reqItem.qty || 1,
                            status: "Available",
                            requested: true
                        };
                        installation.materials = [...(installation.materials || []), newMaterial];

                        // Deduct stock
                        if (reqItem.productName && (reqItem.qty || 1) > 0) {
                            const product = await resolveProductRefs([reqItem.productName]).then((map) => {
                                for (const [, p] of map) { if (p) return p; }
                                return null;
                            });
                            if (product) {
                                await adjustProductStockWithInventory(product, reqItem.qty || 1, -1);
                            }
                        }
                    }

                    // Mark requestedItems as Approved in quotation
                    quotation.requestedItems = quotation.requestedItems.map(r =>
                        r.status === "Pending" ? { ...r, status: "Approved" } : r
                    );

                    // Add approved items into the quotation's main items map so
                    // they appear in the Quotation page as a new version.
                    const approvedItems = pendingItems.filter(r => r.status === "Pending" || r.status === "Approved");
                    if (!quotation.items || typeof quotation.items !== "object") {
                        quotation.items = {};
                    }
                    let addedTotal = 0;
                    let addedGst = 0;
                    for (const ai of approvedItems) {
                        const itemKey = ai.productName || `item-${Date.now()}`;
                        const qty = ai.qty || 1;
                        const price = ai.price || 0;
                        const itemTotal = Math.round(price * qty);
                        const itemGst = Math.round(itemTotal * 0.18);
                        quotation.items[itemKey] = {
                            qty,
                            price,
                            label: ai.productName || itemKey,
                        };
                        addedTotal += itemTotal;
                        addedGst += itemGst;
                    }

                    // Recalculate totals with the newly added items
                    quotation.total = (quotation.total || 0) + addedTotal;
                    quotation.gst = (quotation.gst || 0) + addedGst;
                    quotation.grandTotal = quotation.total + quotation.gst;
                    quotation.version = (quotation.version || 1) + 1;

                    // Build a new version snapshot
                    if (!quotation.versions) quotation.versions = [];
                    quotation.versions.push({
                        version: quotation.version,
                        items: quotation.items,
                        total: quotation.total,
                        gst: quotation.gst,
                        grandTotal: quotation.grandTotal,
                        status: quotation.status,
                        validUntil: quotation.validUntil,
                        customerResponse: quotation.customerResponse || {},
                        createdAt: new Date(),
                        notes: `Material request approved — ${approvedItems.length} item(s) added by customer`,
                    });

                    await quotation.save();

                    // Also update material requests in installation
                    const requests = installation.materialRequests || [];
                    for (let i = 0; i < requests.length; i++) {
                        if (requests[i].status === "Pending" || requests[i].status === "Sent") {
                            requests[i].status = "Approved";
                        }
                    }
                    installation.materialRequests = requests;
                    await installation.save();
                }
            } catch (approvalError) {
                console.error("Requested items approval error:", approvalError);
            }
        } else if (action === "Rejected" && hasPendingRequested) {
            // Mark requestedItems as Rejected
            quotation.requestedItems = quotation.requestedItems.map(r =>
                r.status === "Pending" ? { ...r, status: "Rejected" } : r
            );
            await quotation.save();

            // Update installation material requests too
            if (quotation.installationId) {
                try {
                    const installation = await Installation.findById(quotation.installationId);
                    if (installation) {
                        const requests = installation.materialRequests || [];
                        for (let i = 0; i < requests.length; i++) {
                            if (requests[i].status === "Pending" || requests[i].status === "Sent") {
                                requests[i].status = "Rejected";
                            }
                        }
                        installation.materialRequests = requests;
                        await installation.save();
                    }
                } catch (e) { console.error(e); }
            }
        }

        // When approved (non-material-request), also create/sync the Project Approval record.
        if (action === "Approved" && !isMaterialRequest) {
            try {
                await createApprovalFromQuotation(
                    quotation.toObject(),
                    quotation.client || "Customer"
                );
                // The approval is created as "Pending" by default; set it to
                // "Approved" since the customer already signed off via email.
                const quotationId = quotation.quotationId;
                const approval = await ProjectApproval.findOne({
                    quotationId,
                    customerName: quotation.client
                });
                if (approval && approval.status !== "Approved") {
                    approval.status = "Approved";
                    approval.reviewedBy = quotation.client || "Customer";
                    approval.reviewedDate = new Date();
                    approval.comments = "Approved by customer via email.";
                    await approval.save();
                }
            } catch (approvalError) {
                console.error("Auto-create Project Approval from email approve error:", approvalError);
            }
        } else if (action === "Rejected" && !isMaterialRequest) {
            // If a ProjectApproval exists for this quotation, mark it as Rejected
            try {
                const quotationId = quotation.quotationId;
                const approval = await ProjectApproval.findOne({
                    quotationId,
                    customerName: quotation.client
                });
                if (approval && approval.status !== "Rejected") {
                    approval.status = "Rejected";
                    approval.reviewedBy = quotation.client || "Customer";
                    approval.reviewedDate = new Date();
                    approval.comments = reason || "Rejected by customer via email.";
                    await approval.save();
                }
            } catch (approvalError) {
                console.error("Auto-reject Project Approval from email reject error:", approvalError);
            }
        }

        const actionMessages = {
            Approved: hasPendingRequested
                ? "Quotation approved. Additional material requests have been approved and added to the installation."
                : "Quotation approved successfully. Thank you!",
            Rejected: hasPendingRequested
                ? "Quotation rejected. Material requests have been rejected."
                : "Quotation rejected. The team has been notified.",
            Negotiating: "Negotiation feedback submitted. The team will review and respond."
        };

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: actionMessages[action],
            data: {
                quotationId: quotation.quotationId,
                status: quotation.status,
                customerResponse: quotation.customerResponse
            }
        });
    } catch (error) {
        console.error("Respond To Quotation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to process your response."
        });
    }
};
