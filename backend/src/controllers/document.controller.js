import Document from "../models/document.model.js";
import {
    validateCreateDocument,
    validateUpdateDocument
} from "../validations/document.validation.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer } from "../utils/ownershipScope.js";
import { uploadFileToCloudinary, deleteCloudinaryFile } from "../utils/cloudinaryStorage.js";
import { sendStoredFile } from "../utils/storedFile.js";

/**
 * Derive the internal fileType (pdf/image/spreadsheet/word/drawing/other)
 * from the MIME type and/or the original filename of an uploaded file.
 */
const getFileTypeFromFile = (mimeType = "", originalName = "") => {
    const ext = originalName.split(".").pop()?.toLowerCase() || "";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
    if (
        [
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
            "application/vnd.oasis.opendocument.spreadsheet"
        ].includes(mimeType) ||
        ["xls", "xlsx", "csv", "ods"].includes(ext)
    ) return "spreadsheet";
    if (
        [
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "application/vnd.oasis.opendocument.text"
        ].includes(mimeType) ||
        ["doc", "docx", "txt", "rtf", "odt"].includes(ext)
    ) return "word";
    if (["dwg", "dxf", "skp", "stl", "3dm"].includes(ext)) return "drawing";
    return "other";
};

/**
 * Normalize a multipart/form-data body. Multer delivers repeated fields as
 * arrays but a single occurrence of a field as a plain string, so tags sent
 * via FormData need to be coerced back into an array.
 */
const normalizeMultipartBody = (body) => {
    if (!body || typeof body !== "object") return {};
    const normalized = { ...body };
    if (typeof normalized.tags === "string" && normalized.tags.trim()) {
        normalized.tags = normalized.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
    }
    return normalized;
};

export const getAllDocuments = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            category,
            fileType,
            access,
            status,
            sortField = "createdAt",
            sortDir = -1
        } = req.query;

        const filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { entity: { $regex: search, $options: "i" } },
                { tags: { $regex: search, $options: "i" } }
            ];
        }
        if (category) filter.category = category;
        if (fileType) filter.fileType = fileType;
        if (access) filter.access = access;
        if (status) filter.status = status;

        // Customers see only documents filed against their own entity.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                mergeOwnershipFilter(filter, [{ entity: { $in: scope.names } }]);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const sort = {};
        sort[sortField] = parseInt(sortDir, 10);

        const [documents, total] = await Promise.all([
            Document.find(filter)
                .select("-fileData")
                .sort(sort)
                .skip(skip)
                .limit(limitNum),
            Document.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            message: "Documents fetched successfully",
            data: documents,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getDocumentById = async (req, res) => {
    try {
        const document = await Document.findById(req.params.id).select(
            "-fileData"
        );
        if (!document) {
            return res
                .status(404)
                .json({ success: false, message: "Document not found" });
        }
        // Customers may only view their own documents.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(document, scope)) {
                return res
                    .status(403)
                    .json({ success: false, message: "Access denied: this document does not belong to your account" });
            }
        }
        res.status(200).json({
            success: true,
            message: "Document fetched successfully",
            data: document
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createDocument = async (req, res) => {
    let newlySaved = null;
    try {
        const body = normalizeMultipartBody(req.body || {});

        const { error, value } = validateCreateDocument.validate(body, {
            stripUnknown: true
        });
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        // Attach the actual uploaded file (multipart/form-data via multer).
        // The bytes go to Cloudinary; MongoDB stores the metadata + CDN URL.
        if (req.file) {
            const saved = await uploadFileToCloudinary(req.file, "documents");
            if (saved) {
                newlySaved = saved;
                value.publicId = saved.publicId;
                value.url = saved.url;
                value.mimeType = saved.mimeType;
                value.originalName = saved.originalName;
                value.size = saved.size;
                value.name = value.name || req.file.originalname;
                value.hasFile = true;
                if (!value.fileType || value.fileType === "other") {
                    value.fileType = getFileTypeFromFile(
                        value.mimeType,
                        value.originalName
                    );
                }
            }
        }

        if (!value.name) {
            // Validation failed after upload — remove the uploaded file.
            await deleteCloudinaryFile(newlySaved);
            return res
                .status(400)
                .json({ success: false, message: "Document name is required" });
        }

        // New documents always enter the review queue - admins approve/reject
        // them through PATCH /:id/status (reviewDocument).
        value.status = "pending";

        // Always derive uploaded identity from the authenticated user, not
        // from whatever the client sends — prevents impersonation.
        if (req.user) {
            value.uploadedBy = req.user.name || req.user.email || "";
            value.uploadedByRole = req.user.role || "";
        }

        const document = await Document.create(value);
        res.status(201).json({
            success: true,
            message: "Document created successfully",
            data: document
        });
    } catch (error) {
        // Save failed — remove the newly uploaded file from Cloudinary.
        await deleteCloudinaryFile(newlySaved);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateDocument = async (req, res) => {
    let newlySaved = null;
    let prevForReplace = null;
    try {
        const body = normalizeMultipartBody(req.body || {});

        const { error, value } = validateUpdateDocument.validate(body, {
            stripUnknown: true
        });
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        // Optional replacement file attached via multipart/form-data. The old
        // disk file is removed only AFTER the update succeeds below.
        if (req.file) {
            prevForReplace = await Document.findById(req.params.id).select("publicId").lean();
            newlySaved = await uploadFileToCloudinary(req.file, "documents");
            if (newlySaved) {
                value.publicId = newlySaved.publicId;
                value.url = newlySaved.url;
                value.mimeType = newlySaved.mimeType;
                value.originalName = newlySaved.originalName;
                value.size = newlySaved.size;
                value.name = value.name || req.file.originalname;
                value.hasFile = true;
                if (!value.fileType) {
                    value.fileType = getFileTypeFromFile(
                        value.mimeType,
                        value.originalName
                    );
                }
            }
        }

        // Status changes are only allowed through PATCH /:id/status
        // (reviewDocument), which records the verified/rejected audit trail.
        delete value.status;

        const document = await Document.findByIdAndUpdate(
            req.params.id,
            value,
            { new: true, runValidators: true }
        );
        if (!document) {
            // Update failed — remove the newly uploaded replacement file.
            await deleteCloudinaryFile(newlySaved);
            return res
                .status(404)
                .json({ success: false, message: "Document not found" });
        }
        // Persist succeeded — safe to remove the replaced file from Cloudinary.
        if (newlySaved) await deleteCloudinaryFile(prevForReplace);
        res.status(200).json({
            success: true,
            message: "Document updated successfully",
            data: document
        });
    } catch (error) {
        // Save failed — remove the newly uploaded replacement file.
        await deleteCloudinaryFile(newlySaved);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteDocument = async (req, res) => {
    try {
        const document = await Document.findByIdAndDelete(req.params.id);
        if (!document) {
            return res
                .status(404)
                .json({ success: false, message: "Document not found" });
        }
        // Remove the document's stored file from Cloudinary (legacy fileData
        // dies with the record).
        await deleteCloudinaryFile(document);
        res.status(200).json({
            success: true,
            message: "Document deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const ADMIN_ROLES = ["super_admin", "company_admin"];

const requireAdmin = (req, res) => {
    const role = req.user?.role;
    if (!role || !ADMIN_ROLES.includes(role)) {
        res.status(403).json({
            success: false,
            message: "Only admins can approve or reject documents"
        });
        return false;
    }
    return true;
};

/**
 * Stream the stored file bytes back to the client as a download.
 */
export const downloadDocument = async (req, res) => {
    try {
        const document = await Document.findById(req.params.id);
        if (!document) {
            return res
                .status(404)
                .json({ success: false, message: "Document not found" });
        }
        // Customers may only download their own documents.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(document, scope)) {
                return res
                    .status(403)
                    .json({ success: false, message: "Access denied: this document does not belong to your account" });
            }
        }
        return await sendStoredFile(document, res, "No file is stored for this document");
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const reviewDocument = async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const { status, reason } = req.body;
        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be either 'approved' or 'rejected'"
            });
        }

        const document = await Document.findById(req.params.id);
        if (!document) {
            return res
                .status(404)
                .json({ success: false, message: "Document not found" });
        }

        // Audit trail from the authenticated admin
        // Frontend sends the display name; fall back to the JWT identity
        const actor =
            req.body?.actorName ||
            req.user?.name ||
            req.user?.email ||
            "Admin";

        if (status === "approved") {
            document.status = "approved";
            document.verifiedBy = actor;
            document.verifiedAt = new Date();
            document.rejectedBy = "";
            document.rejectedAt = null;
            document.rejectionReason = "";
        } else {
            document.status = "rejected";
            document.rejectedBy = actor;
            document.rejectedAt = new Date();
            document.rejectionReason = (reason || "").trim();
            document.verifiedBy = "";
            document.verifiedAt = null;
        }

        await document.save();

        res.status(200).json({
            success: true,
            message:
                status === "approved"
                    ? "Document approved successfully"
                    : "Document rejected successfully",
            data: document
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
