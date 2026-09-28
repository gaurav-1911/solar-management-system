import mongoose from "mongoose";
import SiteSurvey from "../models/siteSurvey.model.js";
import Lead from "../models/lead.model.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer, isDocOwnedByTechnician, getSalesScope, isDocOwnedBySales, mergeSalesOwnershipFilter } from "../utils/ownershipScope.js";
import Technician from "../models/technician.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { storedFileLength, sendStoredFile, stripFileData } from "../utils/storedFile.js";
import { uploadFileToCloudinary, deleteCloudinaryFile, deleteCloudinaryFiles } from "../utils/cloudinaryStorage.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Generate the next sequential human-friendly ID like SVY-001, SVY-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number
// and the sequence is safe beyond 999 (lexicographic string sort is not reliable here).
const generateSurveyId = async () => {
    const lastDoc = await SiteSurvey.findOne({ surveyId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("surveyId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.surveyId) {
        const m = lastDoc.surveyId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `SVY-${String(max + 1).padStart(3, "0")}`;
};

// Surveys are always tied to a lead; derive the linked customer ID from the
// lead (every customer has an auto-created lead) so records stay consistent
// even though the customer dropdown was removed from the form.
// Returns false when the referenced lead does not exist (create-time guard).
const resolveCustomerFromLead = async (data) => {
    if (!data.leadId) return true;
    const lead = await Lead.findOne({ leadId: data.leadId }).lean();
    if (!lead) return false;
    data.customerId = lead.customerId || "";
    // The survey model requires a customerName; the lead is the single source
    // of truth for it, so derive it whenever the client did not send one.
    if (lead.name && !data.customerName) data.customerName = lead.name;
    return true;
};

// Derive the technician name from the selected technician ID so the stored
// technicianName always matches the Technician module even if the client
// only sends the technicianId.
// Returns false when the referenced technician does not exist (create-time guard).
const resolveTechnician = async (data) => {
    if (!data.technicianId) return true;
    const tech = await Technician.findOne({ technicianId: data.technicianId }).lean();
    if (!tech) return false;
    data.technicianName = tech.name;
    return true;
};

const buildFileMeta = (file) => uploadFileToCloudinary(file, "site-surveys");

const SURVEY_FILE_BUDGET = 14 * 1024 * 1024; // 14MB


const fileEntryBytes = (entry) => {
    if (!entry) return 0;
    if (typeof entry.size === "number" && entry.size > 0) return entry.size;
    return storedFileLength(entry?.fileData);
};

// Sum the stored byte length of a bill file + a list of photo files.
const countSurveyFileBytes = (billFile, photoFiles) => {
    let total = fileEntryBytes(billFile);
    (photoFiles || []).forEach((p) => {
        total += fileEntryBytes(p);
    });
    return total;
};

const serveSurveyFile = async (file, res, notFoundMessage) => {
    res.set("Cache-Control", "private, max-age=300");
    return await sendStoredFile(file, res, notFoundMessage);
};

export const createSiteSurvey = async (req, res) => {
    let billFile = null;
    let photoFiles = [];
    try {
        const data = { ...req.body };
        // Upload the actual files (multipart/form-data via multer) to Cloudinary.
        billFile = req.files?.electricityBill?.[0] ? await buildFileMeta(req.files.electricityBill[0]) : null;
        photoFiles = await Promise.all((req.files?.sitePhotos || []).map(buildFileMeta));
        if (billFile) data.electricityBill = billFile;
        if (photoFiles.length > 0) data.sitePhotos = photoFiles;
        if (countSurveyFileBytes(billFile, photoFiles) > SURVEY_FILE_BUDGET) {
            // Files were already uploaded — remove them before rejecting.
            await deleteCloudinaryFile(billFile);
            await deleteCloudinaryFiles(photoFiles);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Total file size for a site survey must stay under 14MB"
            });
        }
        // Both resolvers only write separate derived fields — run them in parallel.
        // Reject surveys whose referenced lead/technician no longer exists so
        // records never silently link to missing entries.
        const [leadOk, techOk] = await Promise.all([
            resolveCustomerFromLead(data),
            resolveTechnician(data)
        ]);
        if (!leadOk) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Selected lead not found"
            });
        }
        if (!techOk) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Selected technician not found"
            });
        }
        // Prevent duplicate surveys for the same lead
        if (data.leadId) {
            const existingSurvey = await SiteSurvey.findOne({ leadId: data.leadId });
            if (existingSurvey) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    message: "A site survey already exists for this customer"
                });
            }
        }
        if (data.roofLength && data.roofWidth) {
            data.roofArea = data.roofLength * data.roofWidth;
        }
        // Retry on duplicate-key so two simultaneous creates don't collide on the same SVY-XXX
        let survey;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.surveyId = await generateSurveyId();
                survey = await SiteSurvey.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        const initialChanges = Object.entries(survey.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "site-survey", action: "created", recordId: survey.surveyId || String(survey._id), recordLabel: survey.surveyId, summary: `Site survey ${survey.surveyId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Site survey created successfully",
            data: stripFileData(survey)
        });
    } catch (error) {
        console.error("Create Site Survey Error:", error);
        // Save failed — remove any files already uploaded to Cloudinary.
        await deleteCloudinaryFile(billFile);
        await deleteCloudinaryFiles(photoFiles);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllSiteSurveys = async (req, res) => {
    try {
        const { search, status, leadId, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (status && status !== "All") filter.visitStatus = status;
        if (leadId) filter.leadId = leadId;
        // Technicians only see site surveys assigned to them; customers only
        // their own surveys; sales people only their own leads' surveys.
        if (req.user?.role === "technician") {
            if (req.user?.name) filter.technicianName = req.user.name;
            else filter._id = { $exists: false };
        } else if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                mergeOwnershipFilter(filter, [{ customerName: { $in: scope.names } }]);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        } else if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }
        if (search) {
            filter.$or = [
                { surveyId: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { leadId: { $regex: search, $options: "i" } },
                { customerId: { $regex: search, $options: "i" } },
                { technicianName: { $regex: search, $options: "i" } }
            ];
        }
        const sortableFields = ["createdAt", "surveyId", "customerName", "visitDate", "visitStatus", "roofArea"];
        const sortObj = {};
        // Default to createdAt descending so the newest surveys appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await SiteSurvey.countDocuments(filter);
        const surveys = await SiteSurvey.find(filter)
            .select("-electricityBill.fileData -sitePhotos.fileData")
            .sort(sortObj).skip(skip).limit(limitNum).lean();
        surveys.forEach(stripFileData);
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: surveys,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Site Surveys Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getSiteSurveyById = async (req, res) => {
    try {
        const survey = await SiteSurvey.findById(req.params.id)
            .select("-electricityBill.fileData -sitePhotos.fileData")
            .lean();
        if (!survey) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site survey not found" });
        // Customers may only view their own surveys; technicians only the
        // surveys assigned to them; sales people only their own leads' surveys.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(survey, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this site survey does not belong to your account" });
            }
        } else if (req.user?.role === "technician") {
            if (!isDocOwnedByTechnician(survey, req.user?.name)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this site survey is not assigned to you" });
            }
        } else if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (!isDocOwnedBySales(survey, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this site survey does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: stripFileData(survey) });
    } catch (error) {
        console.error("Get Site Survey By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateSiteSurvey = async (req, res) => {
    let newPhotos = [];
    let newBillFile = null;
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid site survey id"
            });
        }
        const data = { ...req.body };
        // surveyId and roofArea are system-derived; never allow clients to overwrite them
        delete data.surveyId;
        const [existing] = await Promise.all([
            SiteSurvey.findById(req.params.id).select("-electricityBill.fileData -sitePhotos.fileData"),
            resolveCustomerFromLead(data),
            resolveTechnician(data),
        ]);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site survey not found" });
        // roofArea is always derived from length × width — recompute whenever a
        // dimension changes so it can never go stale (the UI never edits it).
        if (data.roofLength !== undefined || data.roofWidth !== undefined) {
            const len = data.roofLength !== undefined ? data.roofLength : existing.roofLength;
            const wid = data.roofWidth !== undefined ? data.roofWidth : existing.roofWidth;
            if (len && wid) data.roofArea = len * wid;
        }

        let oldBillToRemove = null;
        if (req.files?.electricityBill?.[0]) {
            oldBillToRemove = existing.electricityBill || null;
            newBillFile = await buildFileMeta(req.files.electricityBill[0]);
            data.electricityBill = newBillFile;
        } else if (req.body.billKeep === "false") {
            oldBillToRemove = existing.electricityBill || null;
            data.electricityBill = null;
        } else {
            delete data.electricityBill;
        }

        let keptPhotos = [];
        let keepIndices = [];
        let photosProvided = false;
        let photosUnchanged = false;
        let removedPhotos = [];
        if (req.body.sitePhotosKeep !== undefined) {
            photosProvided = true;
            try {
                const parsed = JSON.parse(req.body.sitePhotosKeep);
                if (Array.isArray(parsed)) {
                    keepIndices = parsed
                        .map((i) => parseInt(i, 10))
                        .filter((i) => Number.isInteger(i) && i >= 0);
                }
            } catch {
                // malformed keep-list -> treat as "keep nothing"
            }
            const storedPhotos = Array.isArray(existing.sitePhotos) ? existing.sitePhotos : [];
            keptPhotos = keepIndices
                .map((i) => storedPhotos[i])
                .filter(Boolean);
            photosUnchanged =
                (req.files?.sitePhotos || []).length === 0 &&
                keepIndices.length === storedPhotos.length &&
                keepIndices.every((idx, i) => idx === i);
        }
        newPhotos = await Promise.all((req.files?.sitePhotos || []).map(buildFileMeta));
        if (photosUnchanged) {
            delete data.sitePhotos;
        } else if (photosProvided || newPhotos.length > 0) {
            if (keptPhotos.length > 0) {
                const withBytes = await SiteSurvey.findById(req.params.id)
                    .select("sitePhotos.fileData")
                    .lean();
                const storedPhotos = Array.isArray(withBytes?.sitePhotos) ? withBytes.sitePhotos : [];
                keptPhotos = keepIndices.map((i) => storedPhotos[i]).filter(Boolean);
            }
            data.sitePhotos = [...keptPhotos, ...newPhotos];
            removedPhotos = (Array.isArray(existing.sitePhotos) ? existing.sitePhotos : [])
                .filter((p, i) => p && !keepIndices.includes(i));
        } else {
            delete data.sitePhotos;
        }

        const finalBill = data.electricityBill !== undefined ? data.electricityBill : existing.electricityBill;
        const finalPhotos = data.sitePhotos !== undefined ? data.sitePhotos : existing.sitePhotos;
        if (countSurveyFileBytes(finalBill, finalPhotos) > SURVEY_FILE_BUDGET) {
            // Newly uploaded files — remove them from Cloudinary.
            await deleteCloudinaryFile(newBillFile);
            await deleteCloudinaryFiles(newPhotos);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Total file size for a site survey must stay under 14MB"
            });
        }

        const survey = await SiteSurvey.findByIdAndUpdate(req.params.id, data, {
            new: true,
            runValidators: true,
            projection: "-electricityBill.fileData -sitePhotos.fileData"
        });
        if (!survey) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site survey not found" });
        const updateChanges = computeChanges(existing, req.body);
        // Persist succeeded — safe to remove the replaced files from Cloudinary.
        await deleteCloudinaryFile(oldBillToRemove);
        await deleteCloudinaryFiles(removedPhotos);
        await logActivity({ req, module: "site-survey", action: "updated", recordId: survey._id, recordLabel: survey.surveyId, summary: "Site survey updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;
        res.locals.changes = updateChanges;
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Site survey updated successfully", data: stripFileData(survey) });
    } catch (error) {
        console.error("Update Site Survey Error:", error);
        // Save failed — remove any newly uploaded files from Cloudinary.
        await deleteCloudinaryFile(newBillFile);
        await deleteCloudinaryFiles(newPhotos);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const downloadElectricityBill = async (req, res) => {
    try {
        const survey = await SiteSurvey.findById(req.params.id).select("electricityBill");
        if (!survey) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site survey not found" });
        // Customers may only download their own survey bills.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(survey, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this site survey does not belong to your account" });
            }
        }
        return await serveSurveyFile(survey.electricityBill, res, "No file is stored for this survey");
    } catch (error) {
        console.error("Download Electricity Bill Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};


export const downloadSitePhoto = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid site survey id"
            });
        }
        const survey = await SiteSurvey.findById(req.params.id);
        if (!survey) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site survey not found" });
        // Customers may only download their own survey photos.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(survey, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this site survey does not belong to your account" });
            }
        }
        const index = parseInt(req.params.index, 10);
        if (isNaN(index) || !Array.isArray(survey.sitePhotos)) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site photo not found" });
        }
        return await serveSurveyFile(survey.sitePhotos[index], res, "No file is stored for this survey");
    } catch (error) {
        console.error("Download Site Photo Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteSiteSurvey = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid site survey id"
            });
        }
        const survey = await SiteSurvey.findByIdAndDelete(req.params.id);
        if (!survey) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site survey not found" });
        // Remove the survey's stored files from Cloudinary (bill + photos).
        await deleteCloudinaryFile(survey.electricityBill);
        await deleteCloudinaryFiles(survey.sitePhotos);
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Site survey deleted successfully" });
    } catch (error) {
        console.error("Delete Site Survey Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
