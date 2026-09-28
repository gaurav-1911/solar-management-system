import mongoose from "mongoose";
import Testing from "../models/testing.model.js";
import Installation from "../models/installation.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { storedFileLength, sendStoredFile, stripFileData } from "../utils/storedFile.js";
import { uploadFileToCloudinary, deleteCloudinaryFiles } from "../utils/cloudinaryStorage.js";
import { isDocOwnedByTechnician } from "../utils/ownershipScope.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";


const fileEntryBytes = (entry) => {
    if (!entry) return 0;
    if (typeof entry.size === "number" && entry.size > 0) return entry.size;
    return storedFileLength(entry?.fileData);
};


const generateTestId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every test ID in the collection.
    const lastDoc = await Testing.findOne({ testId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("testId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.testId) {
        const m = lastDoc.testId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `TST-${String(max + 1).padStart(3, "0")}`;
};

// When a test passes, mark the linked project's "Testing Completed"
// milestone as Completed (best-effort — a missing project must not
// break the test create/update response).
const syncTestingMilestone = async (test) => {
    try {
        if (test?.testResult !== "Pass" || !test.leadId) return;
        await ProjectProgress.updateOne(
            { leadId: test.leadId },
            { $set: { "milestones.testingCompleted": "Completed" } }
        );
    } catch (error) {
        console.warn("Sync testing milestone error:", error?.message);
    }
};

const buildFileMeta = (file) => uploadFileToCloudinary(file, "testing");

const TESTING_FILE_BUDGET = 14 * 1024 * 1024; // 14MB

// Sum the stored byte length of a list of file objects.
const countFileBytes = (files) => {
    let total = 0;
    (files || []).forEach((f) => {
        total += fileEntryBytes(f);
    });
    return total;
};

export const createTesting = async (req, res) => {
    let docFiles = [];
    let photoFiles = [];
    try {
        const body = { ...req.body };
        // Upload the actual files (multipart/form-data via multer) to Cloudinary.
        docFiles = await Promise.all((req.files?.docs || []).map(buildFileMeta));
        photoFiles = await Promise.all((req.files?.photos || []).map(buildFileMeta));
        if (docFiles.length > 0) body.docs = docFiles;
        if (photoFiles.length > 0) body.photos = photoFiles;
        if (countFileBytes(docFiles) + countFileBytes(photoFiles) > TESTING_FILE_BUDGET) {
            // Files were already uploaded — remove them before rejecting.
            await deleteCloudinaryFiles(docFiles);
            await deleteCloudinaryFiles(photoFiles);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Total file size for a test record must stay under 14MB"
            });
        }
        // Retry a couple of times only if a concurrent save claims the same ID.
        for (let attempt = 0; ; attempt++) {
            try {
                body.testId = await generateTestId();
                // Draft saves bypass required-field validation.
                let test;
                if (body.isDraft) {
                    test = new Testing(body);
                    await test.save({ validateBeforeSave: false });
                } else {
                    test = await Testing.create(body);
                }
                await syncTestingMilestone(test);
                const initialChanges = Object.entries(test.toObject())
                    .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
                    .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
                await logActivity({ req, module: "testing", action: "created", recordId: test._id, recordLabel: test.testId, summary: `Test record ${test.testId} created`, changes: initialChanges });
                res.locals.activityLogged = true;
                res.locals.changes = initialChanges;
                return res.status(HTTP_STATUS.CREATED).json({
                    success: true,
                    message: "Test record created successfully",
                    data: stripFileData(test)
                });
            } catch (error) {
                if (error?.code !== 11000 || attempt >= 2) throw error;
            }
        }
    } catch (error) {
        console.error("Create Testing Error:", error);
        // Save failed — remove any files already uploaded to Cloudinary.
        await deleteCloudinaryFiles(docFiles);
        await deleteCloudinaryFiles(photoFiles);
        // Mongoose validation errors → 400 so the front-end can surface them.
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: messages.join("; ") });
        }
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllTests = async (req, res) => {
    try {
        const { search, result, engineer, isDraft, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (result && result !== "All") filter.testResult = result;
        if (engineer && engineer !== "All") filter.engineerName = engineer;
        if (isDraft === "true") filter.isDraft = true;
        else if (isDraft === "false") filter.isDraft = { $ne: true };
        // Technicians only see tests they performed.
        if (req.user?.role === "technician") {
            if (req.user?.name) filter.engineerName = req.user.name;
            else filter._id = { $exists: false };
        }
        if (search) {
            filter.$or = [
                { testId: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { leadId: { $regex: search, $options: "i" } },
                { installationId: { $regex: search, $options: "i" } },
                { engineerName: { $regex: search, $options: "i" } }
            ];
        }
        const sortableFields = ["createdAt", "testId", "customerName", "leadId", "installationId", "testDate", "testResult", "engineerName"];
        const sortObj = {};
        // Default to createdAt descending so the newest test records appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await Testing.countDocuments(filter);
        const tests = await Testing.find(filter)
            .select("-docs.fileData -photos.fileData")
            .sort(sortObj).skip(skip).limit(limitNum).lean();
        tests.forEach(stripFileData);
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: tests,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Tests Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getTestById = async (req, res) => {
    try {
        const test = await Testing.findById(req.params.id)
            .select("-docs.fileData -photos.fileData")
            .lean();
        if (!test) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Test record not found" });
        // Technicians may only view tests they performed.
        if (req.user?.role === "technician") {
            if (!isDocOwnedByTechnician(test, req.user?.name)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this test record does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: stripFileData(test) });
    } catch (error) {
        console.error("Get Test By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateTesting = async (req, res) => {
    let newDocs = [];
    let newPhotos = [];
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid test id"
            });
        }
        const { testId, ...body } = req.body;
       
        const existing = await Testing.findById(req.params.id).select("-docs.fileData -photos.fileData");
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Test record not found" });

        const updateChanges = computeChanges(existing, body);

       
        let keptDocs = [];
        let docsKeepIndices = [];
        let docsProvided = false;
        let docsUnchanged = false;
        let removedDocs = [];
        if (body.docsKeep !== undefined) {
            docsProvided = true;
            try {
                const parsed = JSON.parse(body.docsKeep);
                if (Array.isArray(parsed)) {
                    docsKeepIndices = parsed.map((i) => parseInt(i, 10)).filter((i) => Number.isInteger(i) && i >= 0);
                }
            } catch {
                // malformed keep-list -> treat as "keep nothing"
            }
            const storedDocs = Array.isArray(existing.docs) ? existing.docs : [];
            keptDocs = docsKeepIndices.map((i) => storedDocs[i]).filter(Boolean);
            
            docsUnchanged =
                (req.files?.docs || []).length === 0 &&
                docsKeepIndices.length === storedDocs.length &&
                docsKeepIndices.every((idx, i) => idx === i);
        }
        newDocs = await Promise.all((req.files?.docs || []).map(buildFileMeta));
        if (!docsUnchanged && (docsProvided || newDocs.length > 0)) {
    
            if (keptDocs.length > 0) {
                const withBytes = await Testing.findById(req.params.id)
                    .select("docs.fileData")
                    .lean();
                const storedDocs = Array.isArray(withBytes?.docs) ? withBytes.docs : [];
                keptDocs = docsKeepIndices.map((i) => storedDocs[i]).filter(Boolean);
            }
            body.docs = [...keptDocs, ...newDocs];
            removedDocs = (Array.isArray(existing.docs) ? existing.docs : [])
                .filter((d, i) => d && !docsKeepIndices.includes(i));
        }
        delete body.docsKeep;

        // ── Photos ── (same keep-index protocol)
        let keptPhotos = [];
        let photosKeepIndices = [];
        let photosProvided = false;
        let photosUnchanged = false;
        let removedPhotos = [];
        if (body.photosKeep !== undefined) {
            photosProvided = true;
            try {
                const parsed = JSON.parse(body.photosKeep);
                if (Array.isArray(parsed)) {
                    photosKeepIndices = parsed.map((i) => parseInt(i, 10)).filter((i) => Number.isInteger(i) && i >= 0);
                }
            } catch {
                // malformed keep-list -> treat as "keep nothing"
            }
            const storedPhotos = Array.isArray(existing.photos) ? existing.photos : [];
            keptPhotos = photosKeepIndices.map((i) => storedPhotos[i]).filter(Boolean);
            photosUnchanged =
                (req.files?.photos || []).length === 0 &&
                photosKeepIndices.length === storedPhotos.length &&
                photosKeepIndices.every((idx, i) => idx === i);
        }
        newPhotos = await Promise.all((req.files?.photos || []).map(buildFileMeta));
        if (!photosUnchanged && (photosProvided || newPhotos.length > 0)) {
            if (keptPhotos.length > 0) {
                const withBytes = await Testing.findById(req.params.id)
                    .select("photos.fileData")
                    .lean();
                const storedPhotos = Array.isArray(withBytes?.photos) ? withBytes.photos : [];
                keptPhotos = photosKeepIndices.map((i) => storedPhotos[i]).filter(Boolean);
            }
            body.photos = [...keptPhotos, ...newPhotos];
            removedPhotos = (Array.isArray(existing.photos) ? existing.photos : [])
                .filter((p, i) => p && !photosKeepIndices.includes(i));
        }
        delete body.photosKeep;

        const finalDocs = body.docs !== undefined ? body.docs : existing.docs;
        const finalPhotos = body.photos !== undefined ? body.photos : existing.photos;
        if (countFileBytes(finalDocs) + countFileBytes(finalPhotos) > TESTING_FILE_BUDGET) {
            await deleteCloudinaryFiles(newDocs);
            await deleteCloudinaryFiles(newPhotos);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Total file size for a test record must stay under 14MB"
            });
        }

        // Draft saves bypass required-field validation.
        const isDraft = body.isDraft !== undefined ? body.isDraft : existing.isDraft;
        const test = await Testing.findByIdAndUpdate(req.params.id, body, {
            new: true,
            runValidators: !isDraft,
            projection: "-docs.fileData -photos.fileData"
        });
        if (!test) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Test record not found" });
        await deleteCloudinaryFiles(removedDocs);
        await deleteCloudinaryFiles(removedPhotos);
        await syncTestingMilestone(test);
        await logActivity({ req, module: "testing", action: "updated", recordId: test._id, recordLabel: test.testId, summary: "Test record updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;
        res.locals.changes = updateChanges;
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Test record updated successfully", data: stripFileData(test) });
    } catch (error) {
        console.error("Update Testing Error:", error);
        await deleteCloudinaryFiles(newDocs);
        await deleteCloudinaryFiles(newPhotos);
        // Mongoose validation errors → 400 so the front-end can surface them.
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: messages.join("; ") });
        }
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const downloadTestingDoc = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid test id"
            });
        }
        const test = await Testing.findById(req.params.id);
        if (!test) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Test record not found" });
        const index = parseInt(req.params.index, 10);
        if (isNaN(index) || !Array.isArray(test.docs)) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Document not found" });
        }
        res.set("Cache-Control", "private, max-age=300");
        return await sendStoredFile(test.docs[index], res, "No document is stored for this test");
    } catch (error) {
        console.error("Download Test Document Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const downloadTestingPhoto = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid test id"
            });
        }
        const test = await Testing.findById(req.params.id);
        if (!test) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Test record not found" });
        const index = parseInt(req.params.index, 10);
        if (isNaN(index) || !Array.isArray(test.photos)) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Photo not found" });
        }
        res.set("Cache-Control", "private, max-age=300");
        return await sendStoredFile(test.photos[index], res, "No photo is stored for this test");
    } catch (error) {
        console.error("Download Test Photo Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteTesting = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid test id"
            });
        }
        const test = await Testing.findByIdAndDelete(req.params.id);
        if (!test) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Test record not found" });
        await deleteCloudinaryFiles(test.docs);
        await deleteCloudinaryFiles(test.photos);
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Test record deleted successfully" });
    } catch (error) {
        console.error("Delete Testing Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
