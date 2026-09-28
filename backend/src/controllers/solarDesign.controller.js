import mongoose from "mongoose";
import SolarDesign from "../models/solarDesign.model.js";
import Lead from "../models/lead.model.js";
import SiteSurvey from "../models/siteSurvey.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { getSalesScope, isDocOwnedBySales, mergeSalesOwnershipFilter } from "../utils/ownershipScope.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Generate the next sequential human-friendly ID like SD-001, SD-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number
// and the sequence is safe beyond 999 (lexicographic string sort is not reliable here).
const generateDesignId = async () => {
    const lastDoc = await SolarDesign.findOne({ designId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("designId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.designId) {
        const m = lastDoc.designId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `SD-${String(max + 1).padStart(3, "0")}`;
};

// Derive the customer name from the selected lead and the project name from
// that lead's most recent site survey, so the stored values always match the
// source modules even if the client only sends the leadId. The project name is
// non-editable — it always comes from the site survey.
const resolveCustomerFromLead = async (data) => {
    if (!data.leadId) return;
    const lead = await Lead.findOne({ leadId: data.leadId }).lean();
    if (lead && lead.name) data.customerName = lead.name;
    const survey = await SiteSurvey.findOne({ leadId: data.leadId }).sort({ createdAt: -1 }).lean();
    if (survey) data.projectName = survey.projectName || "";
};

// Roof dimensions are always sourced from the completed site survey so the
// design matches the physically measured roof — never typed in again by hand.
const ROOF_FIELDS = ["roofType", "roofLength", "roofWidth", "roofAngle", "shadowAnalysis", "shadowNotes"];

const applyRoofFromSurvey = (data, survey) => {
    if (!survey) return;
    ROOF_FIELDS.forEach((field) => {
        if (survey[field] !== undefined && survey[field] !== null && survey[field] !== "") {
            data[field] = survey[field];
        }
    });
    if (data.roofLength && data.roofWidth) {
        data.roofArea = data.roofLength * data.roofWidth;
    }
};

export const createSolarDesign = async (req, res) => {
    try {
        const data = { ...req.body };
        // designId and roofArea are system-derived; never accept client values
        delete data.designId;
        delete data.roofArea;
        await resolveCustomerFromLead(data);
        // Workflow enforcement + roof data source: the design can only be created
        // once the lead has a completed site survey, and its roof fields are
        // copied from that survey (they cannot be typed differently).
        if (data.leadId) {
            const survey = await SiteSurvey.findOne({ leadId: data.leadId, visitStatus: "Completed" }).sort({ createdAt: -1 }).lean();
            if (!survey) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "A completed site survey is required before creating a solar design for this lead."
                });
            }
            applyRoofFromSurvey(data, survey);
        }
        // Retry on duplicate-key so two simultaneous creates don't collide on the same SD-XXX
        let design;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.designId = await generateDesignId();
                design = await SolarDesign.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        const initialChanges = Object.entries(design.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "solar-design", action: "created", recordId: design.designId || String(design._id), recordLabel: design.designId, summary: `Solar design ${design.designId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Solar design created successfully",
            data: design
        });
    } catch (error) {
        console.error("Create Solar Design Error:", error);

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

export const getAllSolarDesigns = async (req, res) => {
    try {
        const { search, leadId, sortField, sortDir, page = 1, limit = 10, capacity, minConsumption, maxConsumption } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (leadId) filter.leadId = leadId;
        // Capacity filter (e.g. 3, 5, 7, 10, 15, 20, 25)
        if (capacity) {
            const cap = parseInt(capacity, 10);
            if (!isNaN(cap)) filter.recommendedCapacity = cap;
        }
        // Min / Max monthly consumption range filter
        const minC = parseFloat(minConsumption);
        const maxC = parseFloat(maxConsumption);
        if (!isNaN(minC) || !isNaN(maxC)) {
            filter.monthlyConsumption = {};
            if (!isNaN(minC)) filter.monthlyConsumption.$gte = minC;
            if (!isNaN(maxC)) filter.monthlyConsumption.$lte = maxC;
        }
        // Sales people only ever see designs for their OWN leads.
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }
        if (search) {
            filter.$or = [
                { designId: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { leadId: { $regex: search, $options: "i" } }
            ];
        }
        const sortableFields = ["createdAt", "designId", "customerName", "recommendedCapacity"];
        const sortObj = {};
        // Default to createdAt descending so the newest designs appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await SolarDesign.countDocuments(filter);
        const designs = await SolarDesign.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).lean();
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: designs,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Solar Designs Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getSolarDesignById = async (req, res) => {
    try {
        const design = await SolarDesign.findById(req.params.id).lean();
        if (!design) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Solar design not found" });
        // Sales people may only view designs for their own leads.
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (!isDocOwnedBySales(design, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this solar design does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: design });
    } catch (error) {
        console.error("Get Solar Design By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateSolarDesign = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid solar design id"
            });
        }
        const data = { ...req.body };
        // designId and roofArea are system-derived; never allow clients to overwrite them
        delete data.designId;
        delete data.roofArea;
        // Resolve the customer/project names in parallel with the existence
        // check — neither depends on the other, so this saves a round-trip.
        const [existing] = await Promise.all([
            SolarDesign.findById(req.params.id),
            resolveCustomerFromLead(data),
        ]);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Solar design not found" });
        const updateChanges = computeChanges(existing, data);
        // Workflow enforcement only when the lead actually changes; when it does,
        // the roof fields are re-sourced from the new lead's completed survey.
        if (data.leadId && existing.leadId !== data.leadId) {
            const survey = await SiteSurvey.findOne({ leadId: data.leadId, visitStatus: "Completed" }).sort({ createdAt: -1 }).lean();
            if (!survey) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "A completed site survey is required before linking this design to a new lead."
                });
            }
            applyRoofFromSurvey(data, survey);
        }
        // roofArea is always derived from length × width — recompute whenever a
        // dimension changes so it can never go stale (the UI never edits it).
        if (data.roofLength !== undefined || data.roofWidth !== undefined) {
            const len = data.roofLength !== undefined ? data.roofLength : existing.roofLength;
            const wid = data.roofWidth !== undefined ? data.roofWidth : existing.roofWidth;
            if (len && wid) data.roofArea = len * wid;
        }
        const design = await SolarDesign.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        await logActivity({ req, module: "solar-design", action: "updated", recordId: design._id, recordLabel: design.designId, summary: "Solar design updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;
        res.locals.changes = updateChanges;
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Solar design updated successfully", data: design });
    } catch (error) {
        console.error("Update Solar Design Error:", error);

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

export const deleteSolarDesign = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid solar design id"
            });
        }
        const design = await SolarDesign.findByIdAndDelete(req.params.id);
        if (!design) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Solar design not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Solar design deleted successfully" });
    } catch (error) {
        console.error("Delete Solar Design Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Aggregate stats for the dashboard cards: total designs, average capacity /
// payback / savings, and the lead IDs that already have a design (so the form
// dropdown excludes them).
export const getSolarDesignStats = async (req, res) => {
    try {
        const filter = {};
        applyCustomerScope(filter, req);
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }
        const designs = await SolarDesign.find(filter)
            .select("leadId recommendedCapacity paybackPeriod monthlySavings annualSavings panelCount")
            .lean();
        const total = designs.length;
        const sum = (key) => designs.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);
        const avg = (key) => (total ? Math.round((sum(key) / total) * 10) / 10 : 0);
        const designedLeadIds = [...new Set(designs.map((d) => d.leadId).filter(Boolean))];
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total,
                avgCapacity: avg("recommendedCapacity"),
                avgPayback: avg("paybackPeriod"),
                avgSavings: avg("monthlySavings"),
                designedLeadIds
            }
        });
    } catch (error) {
        console.error("Get Solar Design Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
