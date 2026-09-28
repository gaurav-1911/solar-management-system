import mongoose from "mongoose";
import Quotation from "../models/quotation.model.js";
import StockRequest from "../models/stockRequest.model.js";
import SolarDesign from "../models/solarDesign.model.js";
import Lead from "../models/lead.model.js";
import Customer from "../models/customer.model.js";
import SiteSurvey from "../models/siteSurvey.model.js";
import ProjectApproval from "../models/projectApproval.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { formatQuotation, computeQuotationTotals, getQuotationId } from "../utils/quotationHelpers.js";
import { generateApprovalId } from "./projectApproval.controller.js";
import { getSalesScope, isDocOwnedBySales, mergeSalesOwnershipFilter } from "../utils/ownershipScope.js";
import { validateStatusTransition } from "../utils/statusTransitions.js";
import { ensureCustomerForLead } from "./lead.controller.js";
import {
    resolveProductRef,
    adjustQuotationItemStocks,
    adjustProductStockWithInventory,
    restoreApprovedRequestStock,
    getLeadAllowance
} from "../utils/stockAllocation.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";
import { sendNotification, findUserIdByEmail } from "../utils/notify.js";
import { checkDependencies } from "../utils/dependencies.js";

// Status changes are fully open — any quotation status can be changed to any
// other status (Draft, Pending Approval, Sent, Negotiating, Approved, Rejected)
// directly from the list or the edit form. No workflow/approver restrictions.

// Resolve the lead behind a quotation by explicit leadId first, then by the
// client name so legacy records (no leadId) still link up correctly.
const resolveLeadForQuotation = async (data) => {
    if (data.leadId) {
        const lead = await Lead.findOne({ leadId: data.leadId }).sort({ createdAt: -1 }).lean();
        if (lead) return lead;
    }
    if (data.client) {
        return Lead.findOne({ name: data.client }).sort({ createdAt: -1 }).lean();
    }
    return null;
};

// Generate the next sequential human-friendly ID like Q-001, Q-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number
// and the sequence is safe beyond 999 (lexicographic string sort is not reliable here).
const generateQuotationId = async () => {
    const lastDoc = await Quotation.findOne({ quotationId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("quotationId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.quotationId) {
        const m = lastDoc.quotationId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `Q-${String(max + 1).padStart(3, "0")}`;
};

// Generate the next sequential human-friendly ID like SR-001, SR-002, ...
const generateStockRequestId = async () => {
    const lastDoc = await StockRequest.findOne({ requestId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("requestId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.requestId) {
        const m = lastDoc.requestId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `SR-${String(max + 1).padStart(3, "0")}`;
};

// Auto-create a Project Approval when a quotation is approved.
// Uses the exact leadId/designId/siteSurveyId/customerId stored on the quotation
// first; falls back to name-based matching only for legacy records.
export const createApprovalFromQuotation = async (quotation, submittedBy) => {
    const quotationId = getQuotationId(quotation);

    let design = null;
    if (quotation.designId) {
        design = await SolarDesign.findOne({ designId: quotation.designId }).sort({ createdAt: -1 }).lean();
    }
    if (!design && quotation.leadId) {
        design = await SolarDesign.findOne({ leadId: quotation.leadId }).sort({ createdAt: -1 }).lean();
    }
    if (!design) {
        const matchingProject = quotation.projectName
            ? await SolarDesign.findOne({
                  customerName: quotation.client,
                  projectName: quotation.projectName
              }).sort({ createdAt: -1 }).lean()
            : null;
        design = matchingProject || await SolarDesign.findOne({ customerName: quotation.client })
            .sort({ createdAt: -1 })
            .lean();
    }

    let lead = null;
    if (quotation.leadId) {
        lead = await Lead.findOne({ leadId: quotation.leadId }).sort({ createdAt: -1 }).lean();
    }
    if (!lead) {
        lead = await Lead.findOne({ name: quotation.client }).sort({ createdAt: -1 }).lean();
    }

    let customerId = quotation.customerId || lead?.customerId || "";
    if (!customerId) {
        const customer = await Customer.findOne({ name: quotation.client }).sort({ createdAt: -1 }).lean();
        customerId = customer?.customerId || "";
    }

    let survey = null;
    if (quotation.siteSurveyId) {
        survey = await SiteSurvey.findOne({ surveyId: quotation.siteSurveyId }).sort({ createdAt: -1 }).lean();
    }
    if (!survey && lead?.leadId) {
        survey = await SiteSurvey.findOne({ leadId: lead.leadId }).sort({ createdAt: -1 }).lean();
    }

    // Match on quotationId AND customerName: quotation IDs get reused after
    // deletions, so a stale approval from an older quotation with the same
    // number must not block the new one for a different customer.
    const existing = await ProjectApproval.findOne({ quotationId, customerName: quotation.client }).lean();
    if (existing) {
        // The quotation was approved again with new project details (e.g. a
        // changed lead or project name) while an approval already exists for
        // this customer. Refresh the approval's identity fields so the Project
        // Approval module always shows the current project; the decision
        // (status / reviewedBy / reviewedDate) is preserved.
        await ProjectApproval.updateOne(
            { _id: existing._id },
            {
                $set: {
                    designId: design?.designId || quotation.designId || "",
                    projectName: quotation.projectName || design?.projectName || `${quotation.client} Project`,
                    customerId,
                    siteSurveyId: survey?.surveyId || quotation.siteSurveyId || "",
                    leadId: lead?.leadId || quotation.leadId || design?.leadId || "",
                    capacity: design?.recommendedCapacity ?? 0,
                    estimatedCost: quotation.grandTotal || design?.estimatedSystemCost || 0
                }
            }
        );
        return null;
    }

    const payload = {
        designId: design?.designId || quotation.designId || "",
        projectName: quotation.projectName || design?.projectName || `${quotation.client} Project`,
        customerName: quotation.client,
        customerId,
        quotationId,
        siteSurveyId: survey?.surveyId || quotation.siteSurveyId || "",
        leadId: lead?.leadId || quotation.leadId || design?.leadId || "",
        capacity: design?.recommendedCapacity ?? 0,
        estimatedCost: quotation.grandTotal || design?.estimatedSystemCost || 0,
        submittedDate: new Date(),
        status: "Pending",
        sourceModule: "quotation",
        submittedBy: submittedBy || "System"
    };

    payload.approvalId = await generateApprovalId();
    return ProjectApproval.create(payload);
};

// When a quotation leaves the Approved status, remove the auto-created project
// approval while it is still untouched (Pending) so no orphan approval record
// stays linked to an un-approved quotation. Approvals that have already been
// progressed (Approved/Rejected) are left alone.
const cleanupApprovalOnUnapprove = async (quotationId, customerName) => {
    if (!quotationId) return;
    const filter = { quotationId, status: "Pending" };
    // Only touch the approval belonging to THIS customer — a reused quotation
    // ID from another customer must never be deleted.
    if (customerName) filter.customerName = customerName;
    await ProjectApproval.deleteMany(filter);
};

//#region Get All Quotations
export const getAllQuotations = async (req, res) => {
    try {
        const {
            search,
            status,
            sortField,
            sortDir,
            page = 1,
            limit = 10,
            startDate,
            endDate
        } = req.query;

        // Build filter query
        const filter = {};

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        if (status && status !== "All") {
            filter.status = status;
        }

        // Search across client name / lead
        if (search) {
            const searchRegex = new RegExp(search, "i");
            filter.$or = [
                { client: searchRegex },
                { leadId: searchRegex }
            ];
        }

        // Customers only ever see their OWN quotations — matched through the
        // linked Customer/Lead email (same email as their login account).
        if (req.user?.role === "customer") {
            const owned = await getOwnedQuotationFilter(
                String(req.user.email || "").trim().toLowerCase()
            );
            if (owned) {
                if (filter.$or) {
                    filter.$and = [owned, { $or: filter.$or }];
                    delete filter.$or;
                } else {
                    Object.assign(filter, owned);
                }
            } else {
                // No customer/lead identity resolved for this account → nothing
                // can be shown without leaking other customers' data.
                filter._id = { $exists: false };
            }
        } else if (req.user?.role === "sales_manager") {
            // Sales people only ever see quotations for their OWN leads/customers.
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }

        // Build sort object — newest first so freshly created quotations
        // appear at the top. createdAt desc, then _id desc so records created
        // in the same second still order newest → oldest.
        // Only whitelisted fields may be sorted (never user-provided keys).
        let sort = { createdAt: -1, _id: -1 };
        const sortableFields = ["createdAt", "quotationId", "client", "status", "total", "grandTotal", "version", "validUntil"];
        if (sortField && sortableFields.includes(sortField)) {
            const dir = sortDir === "desc" ? -1 : 1;
            sort = { [sortField]: dir };
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;

        // Execute query
        const [quotations, total] = await Promise.all([
            Quotation.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Quotation.countDocuments(filter)
        ]);

        // Transform quotations to include formatted quotationId
        const formattedQuotations = quotations.map((q) => formatQuotation(q));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formattedQuotations,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All Quotations Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Quotation By ID
export const getQuotationById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid quotation id"
            });
        }

        const quotation = await Quotation.findById(id).lean();

        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // Customers may only view their own quotation.
        if (req.user?.role === "customer") {
            const owned = await quotationBelongsToUser(
                quotation,
                String(req.user.email || "").trim().toLowerCase()
            );
            if (!owned) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this quotation does not belong to your account"
                });
            }
        } else if (req.user?.role === "sales_manager") {
            // Sales people may only view quotations for their own leads/customers.
            const scope = await getSalesScope(req.user.name);
            if (!isDocOwnedBySales(quotation, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this quotation does not belong to your account"
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formatQuotation(quotation)
        });
    } catch (error) {
        console.error("Get Quotation By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Create Quotation
export const createQuotation = async (req, res) => {
    try {
        const quotationData = { ...req.body };

        // quotationId is system-generated; never allow clients to overwrite it
        delete quotationData.quotationId;

        // A quotation must be tied to a real lead — resolve it by leadId (or
        // legacy by client name) and normalize the stored client value.
        const lead = await resolveLeadForQuotation(quotationData);
        if (!lead) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Please select a valid lead for the quotation."
            });
        }
        quotationData.leadId = lead.leadId;
        quotationData.client = lead.name;
        quotationData.customerId = lead.customerId || "";

        // Auto-convert the lead if it is not already linked to a customer so
        // downstream records (approval, progress) always resolve a customer.
        if (!quotationData.customerId) {
            const conversion = await ensureCustomerForLead(lead);
            quotationData.customerId = conversion.customerId || "";
        }

        // Only one quotation per lead — editing the existing one is required
        const existingForLead = await Quotation.findOne({ leadId: quotationData.leadId }).lean();
        if (existingForLead) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: `A quotation (${getQuotationId(existingForLead)}) already exists for this lead. Edit it instead of creating a new one.`
            });
        }

        // Workflow enforcement: a quotation can only be created once the lead
        // has a solar design. The design is the source of truth for the system
        // spec, so no design → no quotation (mirrors the survey→design rule).
        let design = null;
        if (quotationData.designId) {
            design = await SolarDesign.findOne({ designId: quotationData.designId }).lean();
        }
        if (!design) {
            design = await SolarDesign.findOne({ leadId: quotationData.leadId }).sort({ createdAt: -1 }).lean();
        }
        if (!design) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "A solar design is required before creating a quotation for this lead. Create the design first."
            });
        }
        quotationData.designId = design.designId;

        // Pull capacity from the solar design — this is the source of truth
        // for the system size and is displayed as read-only in the form.
        quotationData.capacity = design.recommendedCapacity ?? null;

        // Compute the estimated subsidy information based on the design's
        // capacity. This is purely informational and does NOT affect the
        // grand total. Same slab calculation is used for all schemes.
        if (quotationData.capacity && quotationData.capacity > 0) {
            const cap = Math.max(0, parseFloat(quotationData.capacity) || 0);
            const selectedScheme = (quotationData.subsidyInfo && quotationData.subsidyInfo.schemeName)
                || "PM Surya Ghar Yojana";

            const SLAB_RATE_1 = 30000; // ₹30,000/kW for first 2 kW
            const SLAB_RATE_2 = 18000; // ₹18,000/kW for next 3 kW
            const SLAB_CAP = 78000;
            const first = Math.min(cap, 2);
            const second = Math.max(0, Math.min(cap - 2, 3));
            const raw = first * SLAB_RATE_1 + second * SLAB_RATE_2;
            const subsidyAmount = Math.min(raw, SLAB_CAP);
            const capApplied = raw > SLAB_CAP;
            const slabs = [];
            if (first > 0) {
                slabs.push({
                    label: "First 2 kW",
                    range: `0 – ${first.toFixed(1)} kW`,
                    rate: SLAB_RATE_1,
                    amount: Math.round(first * SLAB_RATE_1)
                });
            }
            if (second > 0) {
                slabs.push({
                    label: "Next 3 kW",
                    range: `${Math.min(cap, 2).toFixed(1)} – ${Math.min(cap, 5).toFixed(1)} kW`,
                    rate: SLAB_RATE_2,
                    amount: Math.round(second * SLAB_RATE_2)
                });
            }
            quotationData.subsidyInfo = {
                schemeName: selectedScheme,
                eligibleCapacity: cap,
                subsidyAmount: Math.round(subsidyAmount),
                calculationMethod: "slab",
                slabs,
                capApplied,
                maxCap: SLAB_CAP,
                note: capApplied
                    ? `Subsidy capped at ₹${SLAB_CAP.toLocaleString("en-IN")} as per ${selectedScheme} guidelines.`
                    : `Estimated subsidy under ${selectedScheme}. Actual amount subject to government verification.`
            };
        }

        // Link the latest site survey for the lead
        const survey = await SiteSurvey.findOne({ leadId: quotationData.leadId }).sort({ createdAt: -1 }).lean();
        if (survey) quotationData.siteSurveyId = survey.surveyId;

        // projectName comes from the design first, then the survey
        if (!quotationData.projectName) {
            if (design?.projectName) quotationData.projectName = design.projectName;
            else if (survey?.projectName) quotationData.projectName = survey.projectName;
        }

        // Compute totals server-side so stored values always match the items
        const totals = computeQuotationTotals(quotationData.items);
        quotationData.total = totals.total;
        quotationData.gst = totals.gst;
        quotationData.grandTotal = totals.grandTotal;

        if (quotationData.validUntil === "") {
            quotationData.validUntil = null;
        }

        // Initialize version history with Version 1 snapshot
        const v1Snapshot = {
            version: 1,
            items: quotationData.items || {},
            total: quotationData.total || 0,
            gst: quotationData.gst || 0,
            grandTotal: quotationData.grandTotal || 0,
            status: quotationData.status || "Draft",
            validUntil: quotationData.validUntil || null,
            customerResponse: quotationData.customerResponse || { action: null, signature: "", reason: "", respondedAt: null },
            createdAt: new Date(),
            notes: "Initial Quotation"
        };
        quotationData.versions = [v1Snapshot];

        // Retry on duplicate-key so two simultaneous creates don't collide on the same Q-XXX
        let quotation;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                quotationData.quotationId = await generateQuotationId();
                quotation = await Quotation.create(quotationData);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        // Reserve the quoted quantities from the Product Catalog stock.
        await adjustQuotationItemStocks(quotationData.items, -1);

        // Creating directly in an approved state also triggers the approval
        if (quotation.status === "Approved") {
            try {
                await createApprovalFromQuotation(quotation.toObject(), req.user?.name || "System");
            } catch (approvalError) {
                console.error("Auto-create Project Approval Error:", approvalError);
            }
        }

        const initialChanges = Object.entries(quotation.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "quotations", action: "created", recordId: quotation._id, recordLabel: quotation.quotationId, summary: `Quotation ${quotation.quotationId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        res.locals.changes = initialChanges;

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: MESSAGE.QUOTATION_CREATED_SUCCESS,
            data: formatQuotation(quotation.toObject())
        });
    } catch (error) {
        console.error("Create Quotation Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map(
                (e) => e.message
            );
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Update Quotation
export const updateQuotation = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid quotation id"
            });
        }

        // quotationId is system-generated; never allow clients to overwrite it
        delete updateData.quotationId;

        const existing = await Quotation.findById(id);
        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        const updateChanges = computeChanges(existing, updateData);

        // Final statuses are locked: once Approved/Rejected, the status cannot
        // be changed even through a full document update.
        if (updateData.status && updateData.status !== existing.status &&
            (existing.status === "Approved" || existing.status === "Rejected")) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `This quotation is already ${existing.status} and its status cannot be changed.`
            });
        }

        // Resolve the lead when provided so stored fields stay consistent and
        // enforce the one-quotation-per-lead rule on the new lead too.
        if (updateData.leadId || updateData.client) {
            const lead = await resolveLeadForQuotation(updateData);
            if (lead) {
                updateData.leadId = lead.leadId;
                updateData.client = lead.name;
                updateData.customerId = lead.customerId || "";
                const dup = await Quotation.findOne({
                    leadId: updateData.leadId,
                    _id: { $ne: id }
                }).lean();
                if (dup) {
                    return res.status(HTTP_STATUS.CONFLICT).json({
                        success: false,
                        message: `Lead ${lead.leadId} already has quotation ${getQuotationId(dup)}.`
                    });
                }
                // Workflow enforcement on lead change: only enforce the design
                // requirement when the quotation actually moves to a different
                // lead. Editing an existing quotation for the same lead (e.g. a
                // legacy record) must not break just because the design was
                // removed later.
                const leadChanged = updateData.leadId !== (existing.leadId || "");
                if (leadChanged) {
                    const designForLead = await SolarDesign.findOne({ leadId: lead.leadId }).sort({ createdAt: -1 }).lean();
                    if (!designForLead) {
                        return res.status(HTTP_STATUS.BAD_REQUEST).json({
                            success: false,
                            message: "A solar design is required before creating a quotation for this lead. Create the design first."
                        });
                    }
                    updateData.designId = designForLead.designId;
                }
            }
        }

        // Recompute totals server-side so stored values always match the items:
        // when items change, derive from the new items; when the client tried
        // to set totals directly without items, derive from the existing items
        // so inconsistent totals can never be stored.
        if (updateData.items) {
            const totals = computeQuotationTotals(updateData.items);
            updateData.total = totals.total;
            updateData.gst = totals.gst;
            updateData.grandTotal = totals.grandTotal;
        } else if (updateData.total !== undefined || updateData.gst !== undefined || updateData.grandTotal !== undefined) {
            const totals = computeQuotationTotals(existing.items);
            updateData.total = totals.total;
            updateData.gst = totals.gst;
            updateData.grandTotal = totals.grandTotal;
        }

        if (updateData.validUntil === "") {
            updateData.validUntil = null;
        }

        // Build version history snapshots when price, items, or totals change
        let versionsList = existing.versions && existing.versions.length > 0
            ? existing.versions.map(v => v.toObject ? v.toObject() : v)
            : [{
                version: existing.version || 1,
                items: existing.items,
                total: existing.total || 0,
                gst: existing.gst || 0,
                grandTotal: existing.grandTotal || 0,
                status: existing.status || "Draft",
                validUntil: existing.validUntil,
                customerResponse: existing.customerResponse || {},
                createdAt: existing.createdAt || new Date(),
                notes: "Initial Version"
            }];

        if (updateData.items || updateData.total !== undefined || updateData.gst !== undefined || updateData.grandTotal !== undefined) {
            updateData.version = (existing.version || 1) + 1;

            const newSnapshot = {
                version: updateData.version,
                items: updateData.items || existing.items,
                total: updateData.total !== undefined ? updateData.total : existing.total,
                gst: updateData.gst !== undefined ? updateData.gst : existing.gst,
                grandTotal: updateData.grandTotal !== undefined ? updateData.grandTotal : existing.grandTotal,
                status: updateData.status || existing.status,
                validUntil: updateData.validUntil !== undefined ? updateData.validUntil : existing.validUntil,
                customerResponse: { action: null, signature: "", reason: "", respondedAt: null },
                createdAt: new Date(),
                notes: existing.status === "Negotiating"
                    ? `Price updated after negotiation (from ₹${(existing.grandTotal || 0).toLocaleString("en-IN")} to ₹${(updateData.grandTotal || 0).toLocaleString("en-IN")})`
                    : `Updated to version ${updateData.version}`
            };

            versionsList.push(newSnapshot);
            updateData.versions = versionsList;
        } else if (updateData.status && updateData.status !== existing.status) {
            // Update status on the latest version snapshot if only status changed
            if (versionsList.length > 0) {
                versionsList[versionsList.length - 1].status = updateData.status;
                updateData.versions = versionsList;
            }
        }

        const quotation = await Quotation.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // Keep the Product Catalog stock in sync (only after the update
        // succeeded): give back what the previous items reserved, then reserve
        // the new quantities so repeated edits never double-deduct.
        if (updateData.items) {
            await adjustQuotationItemStocks(existing.items, 1);
            await adjustQuotationItemStocks(updateData.items, -1);
        }

        // Auto-create a Project Approval when the quotation is approved
        if (quotation.status === "Approved" && existing.status !== "Approved") {
            try {
                const approval = await createApprovalFromQuotation(quotation.toObject(), req.user?.name || "System");
                if (approval) {
                    console.log(`Auto-created project approval ${approval.approvalId} from quotation ${quotation.quotationId}`);
                }
            } catch (approvalError) {
                console.error("Auto-create Project Approval Error:", approvalError);
            }
        }

        // Leaving Approved cleans up the auto-created pending approval
        if (existing.status === "Approved" && quotation.status !== "Approved") {
            try {
                await cleanupApprovalOnUnapprove(getQuotationId(quotation), quotation.client);
            } catch (approvalError) {
                console.error("Cleanup Project Approval Error:", approvalError);
            }
        }
     // [FLOW-04] Notify the customer when quotation is approved
        if (quotation.status === "Approved" && existing.status !== "Approved") {
            if (quotation.email) {
                const custUserId = await findUserIdByEmail(quotation.email);
                if (custUserId) {
                    sendNotification({
                        recipientId: custUserId,
                        recipientRole: "customer",
                        type: "quotation_approved",
                        title: `Quotation Approved: ${quotation.quotationId}`,
                        message: `Your quotation ${quotation.quotationId} for ${quotation.client}${quotation.projectName ? ` (${quotation.projectName})` : ""} has been approved. Amount: ₹${(quotation.grandTotal || 0).toLocaleString("en-IN")}.`,
                        link: `/admin/quotations`,
                        sourceModule: "quotations",
                        sourceId: String(quotation._id),
                        triggeredBy: req.user?.name || "System",
                    }).catch(() => {});
                }
            }
        }

        await logActivity({ req, module: "projects", action: "updated", recordId: quotation._id, recordLabel: quotation.quotationId, summary: "Quotation updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;
        res.locals.changes = updateChanges;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.QUOTATION_UPDATED_SUCCESS,
            data: formatQuotation(quotation.toObject())
        });
    } catch (error) {
        console.error("Update Quotation Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map(
                (e) => e.message
            );
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Update Quotation Status
export const updateQuotationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid quotation id"
            });
        }

        if (!status) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Status is required"
            });
        }

        const validStatuses = [
            "Draft",
            "Pending Approval",
            "Sent",
            "Negotiating",
            "Approved",
            "Rejected"
        ];
        if (!validStatuses.includes(status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
            });
        }

        const quotation = await Quotation.findById(id);

        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // No-op when the status did not actually change
        if (status === quotation.status) {
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: `Quotation is already in "${status}" status.`,
                data: formatQuotation(quotation.toObject())
            });
        }

        // Validate status transition
        const transitionError = validateStatusTransition("quotations", quotation.status, status);
        if (transitionError) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: transitionError
            });
        }

        const updateFields = { status };

        // Approving is fully open — no design requirement. If a design exists
        // for the lead, auto-link it so the quotation stays enriched; otherwise
        // approval still proceeds without any error.
        if (status === "Approved" && !quotation.designId) {
            const design = await SolarDesign.findOne({ leadId: quotation.leadId }).sort({ createdAt: -1 }).lean();
            if (design) updateFields.designId = design.designId;
        }

        // Auto-set approvedBy when status changes to Approved
        if (status === "Approved") {
            updateFields.approvedBy = req.user?.name || "Super Admin";
        }

        const updated = await Quotation.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // Auto-create a Project Approval when the quotation is approved
        if (status === "Approved") {
            try {
                const approval = await createApprovalFromQuotation(updated.toObject(), req.user?.name || "System");
                if (approval) {
                    console.log(`Auto-created project approval ${approval.approvalId} from quotation ${updated.quotationId}`);
                }
            } catch (approvalError) {
                console.error("Auto-create Project Approval Error:", approvalError);
            }
        }

        // Leaving Approved cleans up the auto-created pending approval
        if (quotation.status === "Approved" && status !== "Approved") {
            try {
                await cleanupApprovalOnUnapprove(getQuotationId(updated), updated.client);
            } catch (approvalError) {
                console.error("Cleanup Project Approval Error:", approvalError);
            }
        }

        let message;
        switch (status) {
            case "Sent":
                message = "Quotation sent to the client successfully.";
                break;
            case "Approved":
                message = "Quotation approved successfully.";
                break;
            case "Rejected":
                message = "Quotation rejected successfully.";
                break;
            default:
                message = `Quotation status changed to "${status}".`;
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message,
            data: formatQuotation(updated.toObject())
        });
    } catch (error) {
        console.error("Update Quotation Status Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

const getOwnedQuotationFilter = async (userEmail) => {
    if (!userEmail) return null;
    const [customers, leads] = await Promise.all([
        Customer.find({ email: userEmail }).select("customerId name").lean(),
        Lead.find({ email: userEmail }).select("leadId name").lean()
    ]);
    const customerIds = customers.map((c) => c.customerId).filter(Boolean);
    const leadIds = leads.map((l) => l.leadId).filter(Boolean);
    // Collect customer names so material-request / remaining-products quotations
    // (which have no leadId or customerId but do have a client name) are visible.
    const customerNames = [
        ...customers.map((c) => c.name).filter(Boolean),
        ...leads.map((l) => l.name).filter(Boolean)
    ];
    if (!customerIds.length && !leadIds.length && !customerNames.length) return null;
    const or = [];
    if (customerIds.length) or.push({ customerId: { $in: customerIds } });
    if (leadIds.length) or.push({ leadId: { $in: leadIds } });
    if (customerNames.length) or.push({ client: { $in: customerNames } });
    return or.length ? { $or: or } : null;
};

// Does this quotation belong to the given customer account email?
const quotationBelongsToUser = async (quotation, userEmail) => {
    if (!userEmail) return false;
    const [customers, leads] = await Promise.all([
        Customer.find({ email: userEmail }).select("customerId name").lean(),
        Lead.find({ email: userEmail }).select("leadId name").lean()
    ]);
    const customerIds = customers.map((c) => c.customerId).filter(Boolean);
    const leadIds = leads.map((l) => l.leadId).filter(Boolean);
    const customerNames = [
        ...customers.map((c) => c.name).filter(Boolean),
        ...leads.map((l) => l.name).filter(Boolean)
    ];
    return (
        (quotation.customerId && customerIds.includes(quotation.customerId)) ||
        (quotation.leadId && leadIds.includes(quotation.leadId)) ||
        (quotation.client && customerNames.includes(quotation.client))
    );
};

export const approveQuotation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid quotation id"
            });
        }

        const quotation = await Quotation.findById(id);
        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // Customers may only approve their own quotation
        if (req.user?.role === "customer") {
            const owned = await quotationBelongsToUser(
                quotation,
                String(req.user.email || "").trim().toLowerCase()
            );
            if (!owned) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "You can only approve your own quotations."
                });
            }
        }

        // Final statuses are locked: once Approved/Rejected, never change
        if (quotation.status === "Approved" || quotation.status === "Rejected") {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `This quotation is already ${quotation.status} and its status cannot be changed.`
            });
        }

        const updateFields = { status: "Approved" };

        // Auto-link the lead's design if one exists (same enrichment as the
        // admin status change flow — approval proceeds even without one).
        if (!quotation.designId) {
            const design = await SolarDesign.findOne({ leadId: quotation.leadId })
                .sort({ createdAt: -1 })
                .lean();
            if (design) updateFields.designId = design.designId;
        }

        updateFields.approvedBy = req.user?.name || req.user?.email || "Customer";

        const updated = await Quotation.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // Auto-create the Project Approval record (same as the admin flow)
        try {
            const approval = await createApprovalFromQuotation(
                updated.toObject(),
                req.user?.name || "Customer"
            );
            if (approval) {
                console.log(`Auto-created project approval ${approval.approvalId} from customer-approved quotation ${updated.quotationId}`);
            }
        } catch (approvalError) {
            console.error("Auto-create Project Approval Error:", approvalError);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Quotation approved successfully.",
            data: formatQuotation(updated.toObject())
        });
    } catch (error) {
        console.error("Approve Quotation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Delete Quotation
export const deleteQuotation = async (req, res) => {
    try {
        const { id } = req.params;
        const force = req.query.force === "true";

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid quotation id"
            });
        }

        const quotation = await Quotation.findById(id);
        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // [FLOW-06] Check for linked installations/commissioning before deletion
        if (!force) {
            const check = await checkDependencies("quotation", {
                quotationId: quotation.quotationId,
                leadId: quotation.leadId,
            });
            if (!check.canDelete) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: check.message,
                    dependencies: check.dependencies,
                });
            }
        }

        await Quotation.findByIdAndDelete(id);

        // Give the reserved quantities back to the Product Catalog stock and
        // reverse any approved-request deductions, then clear the lead's
        // requests so no orphan records stay linked to a deleted quotation.
        await adjustQuotationItemStocks(quotation.items, 1);
        const approvedRequests = await StockRequest.find({ leadId: quotation.leadId, status: "Approved" }).lean();
        for (const request of approvedRequests) {
            await restoreApprovedRequestStock(request);
        }
        await StockRequest.deleteMany({ leadId: quotation.leadId });

        // Remove any untouched (Pending) approval auto-created from this
        // quotation. Otherwise the orphaned approval keeps blocking the next
        // quotation that reuses this quotationId number.
        await cleanupApprovalOnUnapprove(getQuotationId(quotation), quotation.client);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.QUOTATION_DELETED_SUCCESS
        });
    } catch (error) {
        console.error("Delete Quotation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Quotation Analytics
export const getQuotationAnalytics = async (req, res) => {
    try {
        // Customers/sales people only see analytics for their OWN quotations.
        let quotations;
        if (req.user?.role === "customer") {
            const owned = await getOwnedQuotationFilter(
                String(req.user.email || "").trim().toLowerCase()
            );
            quotations = owned ? await Quotation.find(owned).lean() : [];
        } else if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            const salesFilter = {};
            mergeSalesOwnershipFilter(salesFilter, scope);
            quotations = await Quotation.find(salesFilter).lean();
        } else {
            quotations = await Quotation.find({}).lean();
        }
        const total = quotations.length;

        // Status counts
        const statusCounts = {};
        const validStatuses = [
            "Draft",
            "Pending Approval",
            "Sent",
            "Negotiating",
            "Approved",
            "Rejected"
        ];
        validStatuses.forEach((s) => {
            statusCounts[s] = quotations.filter((q) => q.status === s).length;
        });

        // Computed metrics matching frontend StatCards
        const approvedCount = statusCounts["Approved"] || 0;
        const pendingCount =
            (statusCounts["Draft"] || 0) +
            (statusCounts["Pending Approval"] || 0) +
            (statusCounts["Sent"] || 0) +
            (statusCounts["Negotiating"] || 0);

        const totalRevenue = quotations.reduce(
            (sum, q) => sum + (q.grandTotal || 0),
            0
        );

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                totalQuotes: total,
                approvedCount,
                pendingCount,
                totalRevenue,
                statusCounts
            }
        });
    } catch (error) {
        console.error("Get Quotation Analytics Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Stock Requests (installation → quotation approval flow)
//#region Get All Stock Requests
export const getAllStockRequests = async (req, res) => {
    try {
        const { status, search, leadId, page = 1, limit = 100 } = req.query;
        const filter = {};
        if (status && status !== "All") filter.status = status;
        if (leadId) filter.leadId = leadId;
        if (search) {
            const searchRegex = new RegExp(search, "i");
            filter.$or = [
                { requestId: searchRegex },
                { leadId: searchRegex },
                { productName: searchRegex },
                { quotationId: searchRegex }
            ];
        }
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));
        const skip = (pageNum - 1) * limitNum;
        const [requests, total] = await Promise.all([
            StockRequest.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limitNum).lean(),
            StockRequest.countDocuments(filter)
        ]);
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: requests.map((r) => ({ ...r, id: r._id })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All Stock Requests Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Create Stock Request
// Raised from the Installation module when a technician needs more of a
// product than the lead's quotation reserved. Stores the extra quantity, the
// current allowance at request time, and links to the lead's quotation. Only
// one Pending request per lead + product is allowed.
export const createStockRequest = async (req, res) => {
    try {
        const { leadId, productId, productName, category, brand, vendorName, requestedQty, reason } = req.body;

        if (!leadId || !productId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "leadId and productId are required."
            });
        }
        const qty = Number(requestedQty);
        if (!Number.isFinite(qty) || qty < 1) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "requestedQty must be at least 1."
            });
        }
        if (qty > 1000000) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "requestedQty cannot exceed 1,000,000."
            });
        }

        // The request lives under the lead's quotation — one quotation per lead.
        const quotation = await Quotation.findOne({ leadId }).sort({ createdAt: -1 }).lean();
        if (!quotation) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "No quotation found for this lead."
            });
        }

        // Normalize the product reference to the canonical _id.
        const product = await resolveProductRef(productId);
        if (!product) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Product not found in the Product Catalog."
            });
        }

        const pending = await StockRequest.findOne({ leadId, productId: String(product._id), status: "Pending" }).lean();
        if (pending) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: `A pending stock request (${pending.requestId}) already exists for ${product.name}.`
            });
        }

        const { allowance } = await getLeadAllowance(leadId);
        const pid = String(product._id);
        const alloc = allowance.get(pid) || { quoted: 0, used: 0 };

        const request = await StockRequest.create({
            requestId: await generateStockRequestId(),
            quotationId: getQuotationId(quotation),
            leadId,
            productId: pid,
            productName: productName || product.name,
            category: category || product.category || "",
            brand: brand || product.brand || "",
            vendorName: vendorName || "",
            currentQuoted: alloc.quoted,
            usedQty: alloc.used,
            requestedQty: qty,
            reason: reason || "",
            status: "Pending",
            requestedBy: req.user?.name || "System"
        });

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: `Stock request for ${request.productName} submitted for approval.`,
            data: { ...request.toObject(), id: request._id }
        });
    } catch (error) {
        console.error("Create Stock Request Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Approve Stock Request
// Approving adds the requested extra qty to the lead's allowance AND deducts
// it from the Product Catalog stock immediately.
export const approveStockRequest = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid stock request id"
            });
        }
        const request = await StockRequest.findById(req.params.id);
        if (!request) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Stock request not found."
            });
        }
        if (request.status !== "Pending") {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `This request is already ${request.status}.`
            });
        }
        const product = await resolveProductRef(request.productId);
        if (!product) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Linked product no longer exists in the Product Catalog."
            });
        }
        // Deduct the extra qty from stock (floored at 0) — both the Product
        // Catalog and the backing Inventory quantity stay in sync.
        await adjustProductStockWithInventory(product, Number(request.requestedQty), -1);

        const updated = await StockRequest.findByIdAndUpdate(
            req.params.id,
            { status: "Approved", approvedBy: req.user?.name || "System", resolvedAt: new Date() },
            { new: true, runValidators: true }
        );
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Request approved — ${request.requestedQty} extra ${request.productName} unit(s) reserved.`,
            data: { ...updated.toObject(), id: updated._id }
        });
    } catch (error) {
        console.error("Approve Stock Request Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Reject Stock Request
export const rejectStockRequest = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid stock request id"
            });
        }
        const request = await StockRequest.findById(req.params.id);
        if (!request) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Stock request not found."
            });
        }
        if (request.status !== "Pending") {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `This request is already ${request.status}.`
            });
        }
        const updated = await StockRequest.findByIdAndUpdate(
            req.params.id,
            { status: "Rejected", approvedBy: req.user?.name || "System", resolvedAt: new Date() },
            { new: true, runValidators: true }
        );
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Stock request rejected — no stock was reserved.",
            data: { ...updated.toObject(), id: updated._id }
        });
    } catch (error) {
        console.error("Reject Stock Request Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Send Quotation Email
export const sendQuotationEmail = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid quotation id"
            });
        }

        const quotation = await Quotation.findById(id).lean();
        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        // Resolve the customer email from linked lead/customer
        let customerEmail = req.body.email || "";
        if (!customerEmail && quotation.leadId) {
            const lead = await Lead.findOne({ leadId: quotation.leadId }).select("email").lean();
            customerEmail = lead?.email || "";
        }
        if (!customerEmail && quotation.customerId) {
            const customer = await Customer.findOne({ customerId: quotation.customerId }).select("email").lean();
            customerEmail = customer?.email || "";
        }
        if (!customerEmail && quotation.client) {
            const leadByName = await Lead.findOne({ name: quotation.client }).select("email").lean();
            customerEmail = leadByName?.email || "";
        }

        if (!customerEmail) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "No email address found for this customer. Please provide one."
            });
        }

        // Build the frontend base URL for action links
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || "http://localhost:3000";

        // Import email template and send
        const { quotationEmailTemplate } = await import("../templates/quotationEmail.template.js");
        const html = quotationEmailTemplate(quotation, baseUrl);

        const sendEmail = (await import("../services/mail.service.js")).default;
        const hasPending = (quotation.requestedItems || []).some(r => r.status === "Pending");
        const subjectSuffix = hasPending ? ` (v${quotation.version || 1} — Updated)` : "";
        await sendEmail(
            customerEmail,
            `Quotation ${quotation.quotationId}${subjectSuffix} — Action Required`,
            { html }
        );

        // Update quotation status to Sent, clear any previous customer response,
        // record email timestamp and the version that was emailed.
        await Quotation.findByIdAndUpdate(id, {
            $set: {
                status: "Sent",
                emailSentAt: new Date(),
                emailSentVersion: quotation.version || 1,
                "customerResponse.action": null,
                "customerResponse.signature": "",
                "customerResponse.reason": "",
                "customerResponse.respondedAt": null
            }
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Quotation emailed to ${customerEmail} successfully.`,
            data: { emailSentTo: customerEmail }
        });
    } catch (error) {
        console.error("Send Quotation Email Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Reset Customer Response (after sales team edits and resends)
export const resetCustomerResponse = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid quotation id"
            });
        }

        const quotation = await Quotation.findByIdAndUpdate(
            id,
            {
                $set: {
                    "customerResponse.action": null,
                    "customerResponse.signature": "",
                    "customerResponse.reason": "",
                    "customerResponse.respondedAt": null
                }
            },
            { new: true }
        );

        if (!quotation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.QUOTATION_NOT_FOUND
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Customer response reset. Quotation is ready to resend.",
            data: formatQuotation(quotation.toObject())
        });
    } catch (error) {
        console.error("Reset Customer Response Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
