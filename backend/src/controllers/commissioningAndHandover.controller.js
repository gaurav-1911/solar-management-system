import mongoose from "mongoose";
import CommissioningAndHandover from "../models/commissioningAndHandover.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import Quotation from "../models/quotation.model.js";
import SiteSurvey from "../models/siteSurvey.model.js";
import Installation from "../models/installation.model.js";
import Testing from "../models/testing.model.js";
import ProjectApproval from "../models/projectApproval.model.js";

const getTechnicianCustomerNames = async (techName) => {
    if (!techName) return [];
    return Installation.find({ technicianName: techName }).distinct("customerName");
};
import Invoice from "../models/invoice.model.js";
import Lead from "../models/lead.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { generateProjectId } from "./projectProgress.controller.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";
import { sendNotification, getAdminUserIds } from "../utils/notify.js";

const generateRecordId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every record ID in the collection.
    const lastDoc = await CommissioningAndHandover.findOne({ recordId: /^CH-/ })
        .sort({ _id: -1 })
        .select("recordId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.recordId) {
        const m = lastDoc.recordId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `CH-${String(max + 1).padStart(3, "0")}`;
};

// Commissioning is complete when the grid is connected, the net meter is
// installed and the DISCOM has approved. Handover is complete when the
// customer has signed, documents are delivered and warranty is registered.
const isCommissioned = (r) =>
    r?.gridConnected === "Connected" &&
    r?.netMeterInstalled === "Installed" &&
    r?.discomApproval === "Approved";

const isHandedOver = (r) =>
    isCommissioned(r) &&
    r?.customerSigned === "Signed" &&
    r?.documentsDelivered === "Delivered" &&
    r?.warrantyRegistered === true;

// Derive the milestone states for a handed-over lead from the real backend
// records (survey → design → quotation → installation → testing → handover).
const deriveMilestones = async (record) => {
    const leadId = record?.leadId;
    const base = {
        leadCreated: "Completed",
        surveyCompleted: "Not Started",
        quotationApproved: "Not Started",
        paymentReceived: "Not Started",
        materialProcured: "Not Started",
        installationStarted: "Not Started",
        testingCompleted: "Not Started",
        commissioningCompleted: "Completed",
        handoverCompleted: "Completed"
    };
    if (!leadId) return base;

    const [survey, quotation, approval, installation, test] = await Promise.all([
        SiteSurvey.findOne({ leadId }).sort({ createdAt: -1 }).lean(),
        Quotation.findOne({ leadId }).sort({ createdAt: -1 }).lean(),
        ProjectApproval.findOne({ leadId }).sort({ createdAt: -1 }).lean(),
        Installation.findOne({ leadId }).sort({ createdAt: -1 }).lean(),
        Testing.findOne({ leadId }).sort({ createdAt: -1 }).lean()
    ]);

    if (survey) base.surveyCompleted = "Completed";
    if (quotation?.status === "Approved" || approval?.status === "Approved") {
        base.quotationApproved = "Completed";
    }
    // Payment is received once any customer invoice for this customer is paid.
    // Invoices link by customerId, so resolve the lead's customer first.
    const lead = await Lead.findOne({ leadId }).select("customerId").lean();
    if (lead?.customerId) {
        const paidInvoice = await Invoice.findOne({ customerId: lead.customerId, paymentStatus: "Paid" }).lean();
        if (paidInvoice) base.paymentReceived = "Completed";
    }
    if (installation) {
        base.installationStarted =
            installation.installationStatus === "Completed" ? "Completed" : "In Progress";
        // The installation's material checklist is the source of truth for
        // procurement: a populated materials list (or a completed
        // installation, which requires materials) means the materials were
        // procured for the project.
        const hasMaterials =
            Array.isArray(installation.materials) && installation.materials.length > 0;
        if (hasMaterials || installation.installationStatus === "Completed") {
            base.materialProcured = "Completed";
        }
    }
    if (test?.testResult === "Pass") base.testingCompleted = "Completed";
    return base;
};

// Compute the completion percentage from the milestone states (9 milestones).
const calcCompletion = (milestones) => {
    const total = Object.keys(milestones).length;
    const completed = Object.values(milestones).filter((s) => s === "Completed").length;
    return total ? Math.round((completed / total) * 100) : 0;
};

// Best-effort sync into the linked ProjectProgress record. A lead enters
// Project Progress ONLY once the full handover is complete (grid connected,
// DISCOM approved, customer signed, documents delivered, warranty
// registered) — this auto-creates the record with milestones derived from
// the real pipeline data. A missing project must never break the
// commissioning create/update response.
const syncMilestones = async (record) => {
    try {
        if (!record?.leadId) return;
        const existing = await ProjectProgress.findOne({ leadId: record.leadId }).lean();

        // Handover completed + no Project Progress entry yet → auto-create one.
        if (!existing && isHandedOver(record)) {
            const milestones = await deriveMilestones(record);
            const quotation = await Quotation.findOne({ leadId: record.leadId })
                .sort({ createdAt: -1 })
                .lean();
            // customerName is required on the Project Progress schema — never
            // pass an empty string or the create silently fails validation.
            const customerName = record.customerName || record.leadId;
            await ProjectProgress.create({
                projectId: await generateProjectId(),
                projectName: record.projectName || `${customerName} Project`,
                customerName,
                leadId: record.leadId,
                startDate: record.handoverDate || record.commissioningDate || new Date(),
                milestones,
                completionPercentage: calcCompletion(milestones),
                approvedBudget: quotation?.total || 0,
                actualProjectCost: quotation?.total || 0,
                gstAmount: quotation?.gst || 0,
                projectStatus: "Completed"
            });
            return;
        }

        // Existing entry → sync only the commissioning/handover milestones.
        const set = {};
        if (isCommissioned(record)) set["milestones.commissioningCompleted"] = "Completed";
        if (isHandedOver(record)) set["milestones.handoverCompleted"] = "Completed";
        if (existing && Object.keys(set).length > 0) {
            await ProjectProgress.updateOne({ leadId: record.leadId }, { $set: set });
        }
    } catch (error) {
        console.warn("Sync commissioning milestones error:", error?.message);
    }
};

export const createCommissioning = async (req, res) => {
    try {
        // Workflow enforcement: commissioning & handover can only be created
        // once the lead's test record passed. Mirrors the survey→design→
        // quotation→approval→installation→testing chain — no pass, no handover.
        const test = req.body.leadId
            ? await Testing.findOne({ leadId: req.body.leadId }).sort({ createdAt: -1 }).lean()
            : null;
        if (!test || test.testResult !== "Pass") {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "A passed test record is required before creating commissioning & handover for this lead."
            });
        }
        // One record per lead: the form already excludes recorded leads from
        // its dropdown, so this only guards direct API calls that would
        // otherwise double-count stats and duplicate milestone syncs.
        const existing = await CommissioningAndHandover.findOne({ leadId: req.body.leadId }).lean();
        if (existing) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `A commissioning & handover record (${existing.recordId}) already exists for this lead.`
            });
        }

        const body = { ...req.body, recordId: await generateRecordId() };
        const record = await CommissioningAndHandover.create(body);
        await syncMilestones(record);
        const initialChanges = Object.entries(record.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "commissioning", action: "created", recordId: record._id, recordLabel: record.recordId, summary: `Commissioning & handover ${record.recordId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        res.locals.changes = initialChanges;
        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Commissioning & handover record created successfully",
            data: record
        });
    } catch (error) {
        console.error("Create Commissioning Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllCommissioning = async (req, res) => {
    try {
        const { search, gridConnected, discomApproval, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (gridConnected && gridConnected !== "All") filter.gridConnected = gridConnected;
        if (discomApproval && discomApproval !== "All") filter.discomApproval = discomApproval;
        if (search) {
            filter.$or = [
                { recordId: { $regex: search, $options: "i" } },
                { leadId: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { projectName: { $regex: search, $options: "i" } }
            ];
        }

        if (req.user?.role === "technician") {
            const customers = await getTechnicianCustomerNames(req.user?.name);
            if (customers.length) {
                if (filter.$or) {
                    filter.$and = [{ customerName: { $in: customers } }, { $or: filter.$or }];
                    delete filter.$or;
                } else {
                    filter.customerName = { $in: customers };
                }
            } else {
                filter._id = { $exists: false };
            }
        }
        const sortableFields = ["createdAt", "recordId", "leadId", "customerName", "projectName", "commissioningDate", "handoverDate", "gridConnected", "discomApproval"];
        const sortObj = {};
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await CommissioningAndHandover.countDocuments(filter);
        const records = await CommissioningAndHandover.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum);
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: records,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Commissioning Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getCommissioningById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid commissioning record id"
            });
        }
        const record = await CommissioningAndHandover.findById(req.params.id);
        if (!record) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Commissioning record not found" });
        // Technicians may only view commissioning for their assigned customers.
        if (req.user?.role === "technician") {
            const customers = await getTechnicianCustomerNames(req.user?.name);
            if (!customers.includes(record.customerName)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this commissioning record does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: record });
    } catch (error) {
        console.error("Get Commissioning By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateCommissioning = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid commissioning record id"
            });
        }
        const existing = await CommissioningAndHandover.findById(req.params.id);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Commissioning record not found" });
        const updateChanges = computeChanges(existing, req.body);
        const record = await CommissioningAndHandover.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!record) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Commissioning record not found" });
        await syncMilestones(record);
        await logActivity({ req, module: "commissioning", action: "updated", recordId: record._id, recordLabel: record.recordId, summary: "Commissioning & handover record updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;

        // [FLOW-04] Notify admins when commissioning is fully completed
        const wasCompleted = isCommissioned(existing);
        const nowCompleted = isCommissioned(record);
        if (!wasCompleted && nowCompleted) {
            const adminIds = await getAdminUserIds();
            for (const adminId of adminIds) {
                sendNotification({
                    recipientId: adminId,
                    recipientRole: "super_admin",
                    type: "commissioning_completed",
                    title: `Commissioning Completed: ${record.recordId}`,
                    message: `Commissioning for ${record.customerName || "customer"}${record.projectName ? ` (${record.projectName})` : ""} has been completed. Grid connected, net meter installed, and DISCOM approved on ${record.commissioningDate ? new Date(record.commissioningDate).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}.`,
                    link: `/admin/commissioning`,
                    sourceModule: "commissioning",
                    sourceId: String(record._id),
                    triggeredBy: req.user?.name || "System",
                }).catch(() => {});
            }
        }

        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Commissioning & handover record updated successfully", data: record });
    } catch (error) {
        console.error("Update Commissioning Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteCommissioning = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid commissioning record id"
            });
        }
        const record = await CommissioningAndHandover.findByIdAndDelete(req.params.id);
        if (!record) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Commissioning record not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Commissioning & handover record deleted successfully" });
    } catch (error) {
        console.error("Delete Commissioning Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Aggregate stats for the dashboard cards: total records split into
// commissioned / handed-over / pending, plus the lead IDs already recorded.
export const getCommissioningStats = async (req, res) => {
    try {
        const filter = {};
        applyCustomerScope(filter, req);
        if (req.user?.role === "technician") {
            const customers = await getTechnicianCustomerNames(req.user?.name);
            if (customers.length) {
                filter.customerName = { $in: customers };
            } else {
                filter._id = { $exists: false };
            }
        }
        const records = await CommissioningAndHandover.find(filter).lean();
        const isCommissioned = (r) =>
            r.gridConnected === "Connected" &&
            r.netMeterInstalled === "Installed" &&
            r.discomApproval === "Approved";
        const isHandedOver = (r) =>
            isCommissioned(r) &&
            r.customerSigned === "Signed" &&
            r.documentsDelivered === "Delivered" &&
            r.warrantyRegistered === true;
        let commissioned = 0;
        let handedOver = 0;
        for (const r of records) {
            if (isCommissioned(r)) commissioned++;
            if (isHandedOver(r)) handedOver++;
        }
        const recordedLeadIds = [...new Set(records.map((r) => r.leadId).filter(Boolean))];
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: records.length,
                commissioned,
                handedOver,
                pending: Math.max(0, records.length - commissioned),
                recordedLeadIds
            }
        });
    } catch (error) {
        console.error("Get Commissioning Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
