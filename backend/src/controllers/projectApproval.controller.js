import mongoose from "mongoose";
import ProjectApproval from "../models/projectApproval.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import Quotation from "../models/quotation.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { getSalesScope, isDocOwnedBySales, mergeSalesOwnershipFilter } from "../utils/ownershipScope.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Workflow transitions for project approvals.
const APPROVAL_TRANSITIONS = {
    Pending: ["Under Review", "Approved", "Rejected"],
    "Under Review": ["Approved", "Rejected", "Pending"],
    Approved: [],
    Rejected: ["Pending"]
};

// Roles allowed to make an Approve/Reject decision.
const APPROVER_ROLES = ["super_admin", "company_admin", "sales_manager", "customer"];

// When an approval is Approved, reflect it on an EXISTING Project Progress
// record only (budget + quotation-approval milestone). A lead no longer
// enters Project Progress at approval time — it only enters once the full
// Commissioning & Handover is completed (see
// commissioningAndHandover.controller.js), which auto-creates the record.
const syncProjectProgress = async (approval) => {
    // Prefer matching by lead (one Project Progress entry per lead); fall back
    // to the legacy projectName + customerName match for records/approvals
    // that carry no lead id.
    let existing = approval.leadId
        ? await ProjectProgress.findOne({ leadId: approval.leadId }).lean()
        : null;
    if (!existing) {
        existing = await ProjectProgress.findOne({
            projectName: approval.projectName,
            customerName: approval.customerName
        }).lean();
    }

    // No entry yet (project not handed over) → nothing to sync. This is the
    // expected state until Commissioning & Handover completes.
    if (!existing) return;

    // Approved Budget comes from the quotation's total WITHOUT GST; the GST
    // applied on that total is stored alongside it. Falls back to the
    // approval's Est. Cost when no quotation is linked.
    const quotation = approval.leadId
        ? await Quotation.findOne({ leadId: approval.leadId }).lean()
        : null;
    const approvedBudget = quotation?.total ?? (approval.estimatedCost || 0);
    const gstAmount = quotation?.gst || 0;

    const setFields = {
        approvedBudget,
        "milestones.quotationApproved": "Completed"
    };
    // Actual Project Cost / GST Amount default to the values derived from the
    // approved budget only when the record still has no value. Once the user
    // edits them in Project Progress, later approval updates must NOT
    // overwrite their manually entered figures.
    if (!existing.actualProjectCost) {
        setFields.actualProjectCost = approvedBudget;
    }
    if (!existing.gstAmount) {
        setFields.gstAmount = gstAmount;
    }
    await ProjectProgress.updateOne({ _id: existing._id }, { $set: setFields });
};

// Generate the next sequential human-friendly ID like PA-001, PA-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
export const generateApprovalId = async () => {
    const lastDoc = await ProjectApproval.findOne({ approvalId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("approvalId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.approvalId) {
        const m = lastDoc.approvalId.match(/^PA-(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `PA-${String(max + 1).padStart(3, "0")}`;
};

export const createProjectApproval = async (req, res) => {
    try {
        const payload = {
            ...req.body,
            submittedDate: req.body.submittedDate || new Date(),
            status: req.body.status || "Pending"
        };
        // approvalId is system-generated; never allow clients to set it
        delete payload.approvalId;
        payload.approvalId = await generateApprovalId();

        // Approve/Reject decisions require approver rights even on manual create
        if (["Approved", "Rejected"].includes(payload.status) && !APPROVER_ROLES.includes(req.user?.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: "Only sales managers or company admins can approve or reject project approvals."
            });
        }

        // Approve/Reject decisions always need a written reason
        if (["Approved", "Rejected"].includes(payload.status) && !String(payload.comments || "").trim()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `A comment/reason is required when ${payload.status.toLowerCase()} a project approval.`
            });
        }

        const approval = await ProjectApproval.create(payload);

        if (approval.status === "Approved") {
            try {
                await syncProjectProgress(approval);
            } catch (progressError) {
                console.error("Project Progress sync error:", progressError);
            }
        }

        const initialChanges = Object.entries(approval.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "project-approval", action: "created", recordId: approval._id, recordLabel: approval.approvalId, summary: `Project approval ${approval.approvalId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        res.locals.changes = initialChanges;

        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Project approval created successfully", data: approval });
    } catch (error) {
        console.error("Create Project Approval Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map(
                (e) => e.message
            );
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllProjectApprovals = async (req, res) => {
    try {
        const { search, status, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (status && status !== "All") filter.status = status;
        // Sales people only ever see approvals for their OWN leads/customers.
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }
        if (search) {
            filter.$or = [
                { projectName: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { leadId: { $regex: search, $options: "i" } },
                { designId: { $regex: search, $options: "i" } }
            ];
        }
        const sortObj = {};
        // Default to createdAt descending so the newest approvals appear on top.
        // Only whitelisted fields may be sorted (never user-provided keys).
        const sortableFields = ["createdAt", "approvalId", "projectName", "customerName", "status", "capacity", "estimatedCost", "submittedDate"];
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await ProjectApproval.countDocuments(filter);
        const approvals = await ProjectApproval.find(filter).sort(sortObj).skip(skip).limit(limitNum);
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: approvals,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Project Approvals Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getProjectApprovalById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid project approval id"
            });
        }
        const approval = await ProjectApproval.findById(req.params.id);
        if (!approval) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project approval not found" });
        // Sales people may only view approvals for their own leads/customers.
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (!isDocOwnedBySales(approval, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this project approval does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: approval });
    } catch (error) {
        console.error("Get Project Approval By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateProjectApproval = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid project approval id"
            });
        }
        const data = { ...req.body };

        const existing = await ProjectApproval.findById(req.params.id);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project approval not found" });

        const updateChanges = computeChanges(existing, data);

        // Workflow + role enforcement on status changes
        if (data.status && data.status !== existing.status) {
            const allowed = APPROVAL_TRANSITIONS[existing.status] || [];
            if (!allowed.includes(data.status)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: `Cannot move approval from "${existing.status}" to "${data.status}".`
                });
            }
            if (["Approved", "Rejected"].includes(data.status) && !APPROVER_ROLES.includes(req.user?.role)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Only sales managers or company admins can approve or reject project approvals."
                });
            }
            if (["Approved", "Rejected"].includes(data.status) && !String(data.comments || "").trim()) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: `A comment/reason is required when ${data.status.toLowerCase()} a project approval.`
                });
            }
        }

        if (data.status === "Approved" || data.status === "Rejected") {
            data.reviewedBy = req.user?.email || req.user?.name || "System";
            data.reviewedDate = new Date();
        }

        const approval = await ProjectApproval.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!approval) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project approval not found" });

        // Auto-create/update Project Progress when the approval is granted
        if (approval.status === "Approved") {
            try {
                await syncProjectProgress(approval);
            } catch (progressError) {
                console.error("Project Progress sync error:", progressError);
            }
        }

        await logActivity({ req, module: "project-approval", action: "updated", recordId: approval._id, recordLabel: approval.approvalId, summary: "Project approval updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;
        res.locals.changes = updateChanges;

        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Project approval updated successfully", data: approval });
    } catch (error) {
        console.error("Update Project Approval Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteProjectApproval = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid project approval id"
            });
        }
        const approval = await ProjectApproval.findByIdAndDelete(req.params.id);
        if (!approval) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project approval not found" });

        await logActivity({ req, module: "project-approval", action: "deleted", recordId: approval._id, recordLabel: approval.approvalId, summary: `Project approval ${approval.approvalId} deleted` });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Project approval deleted successfully" });
    } catch (error) {
        console.error("Delete Project Approval Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Aggregate stats for the dashboard cards: total approvals split by status.
export const getProjectApprovalStats = async (req, res) => {
    try {
        const filter = {};
        applyCustomerScope(filter, req);
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }
        const agg = await ProjectApproval.aggregate([
            { $match: filter },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        const map = Object.fromEntries(agg.map((a) => [a._id, a.count]));
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: agg.reduce((acc, a) => acc + a.count, 0),
                pending: map["Pending"] || 0,
                underReview: map["Under Review"] || 0,
                approved: map["Approved"] || 0,
                rejected: map["Rejected"] || 0
            }
        });
    } catch (error) {
        console.error("Get Project Approval Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};


