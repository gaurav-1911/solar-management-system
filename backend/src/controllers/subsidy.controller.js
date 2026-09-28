import mongoose from "mongoose";
import Subsidy from "../models/subsidy.model.js";
import Invoice from "../models/invoice.model.js";
import Receipt from "../models/receipt.model.js";
import CreditNote from "../models/creditNote.model.js";
import User from "../models/user.model.js";
import PendingFile from "../models/pendingFile.model.js";
import fs from "fs";
import path from "path";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { storedFileLength, sendStoredFile } from "../utils/storedFile.js";
import { uploadFileToCloudinary, deleteCloudinaryFile, deleteCloudinaryFiles } from "../utils/cloudinaryStorage.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

export const SUBSIDY_FILE_BUDGET = 14 * 1024 * 1024; // 14MB

export const UPLOAD_DIR = path.join(process.cwd(), "uploads", "subsidy-documents");

/** Resolve the current user's display name (fall back to email). */
const getUploaderName = async (req) => {
    if (!req.user) return "";
    try {
        if (req.user.userId && req.user.userId !== "dev-user") {
            const userDoc = await User.findById(req.user.userId).select("name email").lean();
            if (userDoc && userDoc.name) return userDoc.name;
        }
    } catch (error) {
        console.error("Resolve uploader name error:", error);
    }
    return req.user.name || req.user.email || "";
};

/** Delete a single stored file by its server-generated name (safe against traversal). */
const removeStoredFile = (storedName) => {
    if (!storedName) return;
    const name = String(storedName);
    if (name.includes("..") || name.includes("/") || name.includes("\\")) return;
    try {
        const filePath = path.join(UPLOAD_DIR, name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
        console.error("Remove subsidy document file error:", error);
    }
};

/** Delete every stored file referenced by a subsidy's documents array. */
const removeSubsidyFiles = (subsidy) => {
    const docs = Array.isArray(subsidy?.documents) ? subsidy.documents : [];
    docs.forEach((d) => removeStoredFile(d?.storedName || (d?.fileUrl ? d.fileUrl.split("/").pop() : "")));
};

// Upload files to Cloudinary; MongoDB stores the metadata + CDN URL.
const buildFileMeta = (file) => uploadFileToCloudinary(file, "subsidy-documents");

// Remove heavy file bytes from API responses while keeping the metadata + hasFile flag.
const stripFileData = (subsidy) => {
    if (!subsidy) return subsidy;
    if (Array.isArray(subsidy.documents)) {
        subsidy.documents.forEach((d) => {
            if (d) delete d.fileData;
        });
    }
    return subsidy;
};

// Sum the stored byte length of a list of document file entries.
const countSubsidyFileBytes = (documents) => {
    let total = 0;
    (documents || []).forEach((d) => {
        if (typeof d?.fileSize === "number" && d.fileSize > 0) {
            total += d.fileSize;
        } else {
            total += storedFileLength(d);
        }
    });
    return total;
};

export const uploadSubsidyDocument = async (req, res) => {
    let meta = null;
    try {
        if (!req.file) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const uploadedBy = await getUploaderName(req);
        meta = await buildFileMeta(req.file);
        const pending = await PendingFile.create({
            ...meta,
            fileType: path.extname(req.file.originalname).toLowerCase().replace(".", "") || "other",
            uploadedBy
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Document uploaded successfully",
            data: {
                fileRef: pending._id.toString(),
                originalName: req.file.originalname,
                mimeType: req.file.mimetype || "",
                fileSize: req.file.size,
                fileType: path.extname(req.file.originalname).toLowerCase().replace(".", "") || "other",
                uploadedBy,
                uploadedDate: new Date()
            }
        });
    } catch (error) {
        console.error("Upload Subsidy Document Error:", error);
        await deleteCloudinaryFile(meta);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

const resolveStagedDocument = async (doc) => {
    const resolved = { ...doc };
    const ref = doc?.fileRef;
    if (!ref || !mongoose.isValidObjectId(ref)) {
        delete resolved.fileRef;
        return { entry: resolved, consumedRefs: [], missingRef: false };
    }
    const pending = await PendingFile.findById(ref);
    if (!pending) {
        delete resolved.fileRef;
        return { entry: resolved, consumedRefs: [], missingRef: true };
    }
    // New uploads are Cloudinary-backed; legacy staged uploads used fileData.
    if (pending.publicId) {
        resolved.publicId = pending.publicId;
        resolved.url = pending.url || "";
    } else if (pending.fileData) {
        resolved.fileData = pending.fileData;
    }
    resolved.mimeType = pending.mimeType || resolved.mimeType || "";
    resolved.originalName = pending.originalName || resolved.fileName || "";
    resolved.fileSize = pending.size || resolved.fileSize || 0;
    resolved.fileType = pending.fileType || resolved.fileType || "other";
    resolved.fileName = resolved.fileName || pending.originalName || "";
    resolved.hasFile = true;
    delete resolved.fileRef;
    return { entry: resolved, consumedRefs: [ref], missingRef: false };
};

/** True when any resolved entry referenced a staged file that no longer exists. */
const hasMissingStagedRef = (resolved) => resolved.some((r) => r.missingRef);

/** Delete staging records whose bytes were moved into a saved subsidy. */
const cleanupStagedFiles = async (consumedRefs) => {
    for (const ref of consumedRefs || []) {
        if (ref && mongoose.isValidObjectId(ref)) {
            await PendingFile.findByIdAndDelete(ref).catch(() => {});
        }
    }
};

/** Delete a staged document file (body: { fileRef }). */
export const deleteSubsidyDocument = async (req, res) => {
    try {
        const { fileRef } = req.body || {};
        if (!fileRef || !mongoose.isValidObjectId(fileRef)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "fileRef is required"
            });
        }

        const pending = await PendingFile.findByIdAndDelete(fileRef);
        await deleteCloudinaryFile(pending);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Document file deleted successfully"
        });
    } catch (error) {
        console.error("Delete Subsidy Document Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

/** Serve a staged (not-yet-saved) document file for immediate preview. */
export const downloadPendingDocument = async (req, res) => {
    try {
        const pending = await PendingFile.findById(req.params.fileRef);
        if (!pending) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "File not found"
            });
        }
        return await sendStoredFile(pending, res, "No file is stored");
    } catch (error) {
        console.error("Download Pending Subsidy Document Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

/** Serve a stored subsidy document's file bytes (by document index). */
export const downloadSubsidyDocument = async (req, res) => {
    try {
        const subsidy = await Subsidy.findById(req.params.id);
        if (!subsidy) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Subsidy application not found"
            });
        }
        const index = parseInt(req.params.index, 10);
        if (isNaN(index) || !Array.isArray(subsidy.documents)) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Document not found"
            });
        }
        return await sendStoredFile(subsidy.documents[index], res, "No file is stored for this document");
    } catch (error) {
        console.error("Download Subsidy Document Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};


// A customer is eligible for a subsidy only when their full payment has been
// collected — every one of their invoices must have zero outstanding
// (totalAmount − receipts − credit notes).
const isCustomerFullyPaid = async (customerName) => {
    if (!customerName) return false;

    const invoices = await Invoice.find({ customerName }).lean();
    if (!invoices.length) return false;

    const numbers = invoices.map((i) => i.invoiceNumber);
    const [receipts, creditNotes] = await Promise.all([
        Receipt.find({ invoiceNumber: { $in: numbers } }).select("invoiceNumber paymentAmount").lean(),
        CreditNote.find({ invoiceNumber: { $in: numbers } }).select("invoiceNumber creditAmount").lean(),
    ]);

    return invoices.every((inv) => {
        const paid = receipts
            .filter((r) => r.invoiceNumber === inv.invoiceNumber)
            .reduce((s, r) => s + (Number(r.paymentAmount) || 0), 0);
        const credited = creditNotes
            .filter((c) => c.invoiceNumber === inv.invoiceNumber)
            .reduce((s, c) => s + (Number(c.creditAmount) || 0), 0);
        return (Number(inv.totalAmount) || 0) - paid - credited <= 0;
    });
};

export const createSubsidy = async (req, res) => {
    try {
        // Only customers whose full payment is collected are eligible.
        if (!await isCustomerFullyPaid(req.body.customerName)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Customer '${req.body.customerName || ""}' is not eligible for a subsidy — full payment has not been collected yet.`
            });
        }

        const body = { ...req.body };
        // Move staged uploads (fileRef) into the document's stored file bytes.
        let consumedRefs = [];
        if (Array.isArray(body.documents)) {
            const resolved = await Promise.all(body.documents.map(resolveStagedDocument));
            if (hasMissingStagedRef(resolved)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "One of the uploaded files is no longer available. Please re-upload the document and try again."
                });
            }
            body.documents = resolved.map((r) => r.entry);
            consumedRefs = resolved.flatMap((r) => r.consumedRefs);
            if (countSubsidyFileBytes(body.documents) > SUBSIDY_FILE_BUDGET) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "Total document size for a subsidy application must stay under 14MB"
                });
            }
        }

        const subsidy = await Subsidy.create(body);
        // Files are safely stored now — release the staging records.
        await cleanupStagedFiles(consumedRefs);
        const initialChanges = Object.entries(subsidy.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "subsidy", action: "created", recordId: subsidy.applicationNumber || String(subsidy._id), recordLabel: subsidy.applicationNumber, summary: `Subsidy application ${subsidy.applicationNumber} created`, changes: initialChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Subsidy application created successfully",
            data: stripFileData(subsidy)
        });
    } catch (error) {
        console.error("Create Subsidy Error:", error);
        // Race-condition duplicate (two creates at the same moment)
        if (error.code === 11000) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: "Application number already exists. Please try again."
            });
        }
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
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

export const getAllSubsidies = async (req, res) => {
    try {
        const {
            search,
            status,
            schemeName,
            approvalStatus,
            paymentStatus,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};
        applyCustomerScope(filter, req);

        if (status && status !== "All") {
            filter.status = status;
        }
        if (schemeName && schemeName !== "All") {
            filter.schemeName = schemeName;
        }
        if (approvalStatus && approvalStatus !== "All") {
            filter.approvalStatus = approvalStatus;
        }
        if (paymentStatus && paymentStatus !== "All") {
            filter.paymentStatus = paymentStatus;
        }
        if (search) {
            // Escape regex metacharacters so a plain-text search term (e.g.
            // "(" or "[") never throws and 500s the whole list.
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { applicationNumber: { $regex: escaped, $options: "i" } },
                { customerName: { $regex: escaped, $options: "i" } },
                { customerId: { $regex: escaped, $options: "i" } },
                { projectName: { $regex: escaped, $options: "i" } }
            ];
        }

        const sortableFields = ["createdAt", "applicationNumber", "customerName", "projectName", "applicationDate", "status", "approvalStatus", "paymentStatus", "subsidyAmount", "paymentDate"];
        const sortObj = {};
        // Default to createdAt descending so the newest applications appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await Subsidy.countDocuments(filter);
        const subsidies = await Subsidy.find(filter)
            .select("-documents.fileData") // avoid pulling multi-MB buffers for the list
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));
        subsidies.forEach(stripFileData);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: subsidies,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All Subsidies Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getSubsidyById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid subsidy application id" });
        }
        const subsidy = await Subsidy.findById(req.params.id);

        if (!subsidy) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Subsidy application not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: stripFileData(subsidy)
        });
    } catch (error) {
        console.error("Get Subsidy By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateSubsidy = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid subsidy application id" });
        }
        const existing = await Subsidy.findById(req.params.id);
        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Subsidy application not found"
            });
        }

        const updateChanges = computeChanges(existing, req.body);

        // Only enforce the eligibility rule when the customer is being changed
        // (existing applications keep working even if payments are pending).
        if (req.body.customerName !== undefined && req.body.customerName !== existing.customerName) {
            if (!await isCustomerFullyPaid(req.body.customerName)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: `Customer '${req.body.customerName}' is not eligible for a subsidy — full payment has not been collected yet.`
                });
            }
        }

        const body = { ...req.body };
        let consumedRefs = [];
        if (Array.isArray(body.documents)) {
            const existingDocs = Array.isArray(existing.documents) ? existing.documents : [];
            const resolved = await Promise.all(body.documents.map(async (doc) => {
                const { entry, consumedRefs: refs } = await resolveStagedDocument(doc);
                if (entry.publicId || entry.fileData) return { entry, consumedRefs: refs };
                // Kept document: carry the previously stored bytes forward.
                const prev = existingDocs.find((d) => d?.documentType === doc?.documentType);
                if (prev && (prev.publicId || storedFileLength(prev) > 0)) {
                    return {
                        entry: {
                            ...entry,
                            ...(prev.publicId ? { publicId: prev.publicId, url: prev.url || "" } : { fileData: prev.fileData }),
                            mimeType: prev.mimeType || entry.mimeType || "",
                            originalName: prev.originalName || entry.fileName || "",
                            fileSize: prev.fileSize || entry.fileSize || 0,
                            hasFile: true
                        },
                        consumedRefs: refs
                    };
                }
                return { entry, consumedRefs: refs, missingRef: false };
            }));
            if (hasMissingStagedRef(resolved)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "One of the uploaded files is no longer available. Please re-upload the document and try again."
                });
            }
            body.documents = resolved.map((r) => r.entry);
            consumedRefs = resolved.flatMap((r) => r.consumedRefs);
            if (countSubsidyFileBytes(body.documents) > SUBSIDY_FILE_BUDGET) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "Total document size for a subsidy application must stay under 14MB"
                });
            }
        }

        const subsidy = await Subsidy.findByIdAndUpdate(
            req.params.id,
            body,
            { new: true, runValidators: true }
        );
        // Files are safely stored now — release the staging records.
        await cleanupStagedFiles(consumedRefs);
        await logActivity({ req, module: "finance", action: "updated", recordId: subsidy._id, recordLabel: subsidy.applicationNumber, summary: "Subsidy application updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Subsidy application updated successfully",
            data: stripFileData(subsidy)
        });
    } catch (error) {
        console.error("Update Subsidy Error:", error);
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
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

export const deleteSubsidy = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid subsidy application id" });
        }
        const subsidy = await Subsidy.findByIdAndDelete(req.params.id);

        if (!subsidy) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Subsidy application not found"
            });
        }

        removeSubsidyFiles(subsidy);
        await deleteCloudinaryFiles(subsidy?.documents);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Subsidy application deleted successfully"
        });
    } catch (error) {
        console.error("Delete Subsidy Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getSubsidyStats = async (req, res) => {
    try {
        const [agg] = await Subsidy.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    totalApplied: { $sum: { $ifNull: ["$subsidyAmount", 0] } },
                    released: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paymentStatus", "Released"] },
                                { $ifNull: ["$releasedAmount", 0] },
                                0
                            ]
                        }
                    },
                    releasedCount: {
                        $sum: { $cond: [{ $eq: ["$paymentStatus", "Released"] }, 1, 0] }
                    },
                    pendingReview: {
                        $sum: {
                            $cond: [
                                { $in: ["$status", ["Submitted", "Under Verification"]] },
                                1,
                                0
                            ]
                        }
                    },
                    approvedPending: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "Approved"] },
                                        { $ne: ["$paymentStatus", "Released"] }
                                    ]
                                },
                                { $ifNull: ["$subsidyAmount", 0] },
                                0
                            ]
                        }
                    },
                    rejectedCount: {
                        $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] }
                    },
                    draftCount: {
                        $sum: { $cond: [{ $eq: ["$status", "Draft"] }, 1, 0] }
                    }
                }
            }
        ]);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: agg?.total || 0,
                totalApplied: agg?.totalApplied || 0,
                released: agg?.released || 0,
                releasedCount: agg?.releasedCount || 0,
                pendingReview: agg?.pendingReview || 0,
                approvedPending: agg?.approvedPending || 0,
                rejectedCount: agg?.rejectedCount || 0,
                draftCount: agg?.draftCount || 0
            }
        });
    } catch (error) {
        console.error("Get Subsidy Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
