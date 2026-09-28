import HTTP_STATUS from "../constants/httpStatus.js";
import { Readable } from "stream";


const toStoredBuffer = (fileData) => {
    if (!fileData) return null;
    if (Buffer.isBuffer(fileData)) return fileData;
    if (fileData.buffer && Buffer.isBuffer(fileData.buffer)) {
        const buf = fileData.buffer;
        const len = Number.isInteger(fileData.position) ? fileData.position : buf.length;
        return buf.slice(0, len);
    }
    // Legacy shape from JSON round-trips / old writes: { type: Buffer, data: [...] }
    if (fileData.type === Buffer && (Array.isArray(fileData.data) || Buffer.isBuffer(fileData.data))) {
        return Buffer.from(fileData.data);
    }
    return null;
};

export const storedFileLength = (file) => {
    if (!file) return 0;
    if (file.publicId || file.url) return Number(file.size) || 0;
    if (file.fileData) {
        const buf = toStoredBuffer(file.fileData);
        return buf ? buf.length : 0;
    }
    return Number(file.size) || 0;
};

export const sendStoredFile = async (file, res, notFoundMessage) => {
    const notFound = () =>
        res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: notFoundMessage || "No file is stored"
        });

    if (!file) return notFound();

    // Cloudinary-backed file (new storage) — proxy through the backend
    // instead of redirecting, so the browser never hits Cloudinary directly.
    // This avoids CORS issues when withCredentials is enabled.
    if (file.url) {
        try {
            const upstream = await fetch(file.url);
            if (!upstream.ok) {
                return res.status(upstream.status).json({
                    success: false,
                    message: "Failed to fetch file from storage"
                });
            }
            const contentType = upstream.headers.get("content-type") || "application/octet-stream";
            const contentLength = upstream.headers.get("content-length");
            const filename = file.originalName || file.name || "file";
            const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
            res.set({
                "Content-Type": contentType,
                "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                "Cache-Control": "public, max-age=86400"
            });
            if (contentLength) res.set("Content-Length", contentLength);
            const { Readable } = await import("stream");
            const nodeStream = Readable.fromWeb(upstream.body);
            nodeStream.pipe(res);
        } catch (err) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: "Failed to fetch file from storage"
            });
        }
        return;
    }

    // Legacy embedded-buffer file.
    const data = toStoredBuffer(file.fileData);
    if (!data || data.length === 0) return notFound();

    const filename = file.originalName || file.name || "file";
    const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
    res.set({
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": data.length
    });
    return res.send(data);
};

// Remove heavy file buffer payloads from API response objects before JSON serialization
export const stripFileData = (doc) => {
    if (!doc) return doc;
    const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
    if (obj.electricityBill) delete obj.electricityBill.fileData;
    if (obj.reportFile) delete obj.reportFile.fileData;
    if (obj.certificateFile) delete obj.certificateFile.fileData;
    if (obj.document) delete obj.document.fileData;
    if (obj.file) delete obj.file.fileData;
    if (Array.isArray(obj.sitePhotos)) {
        obj.sitePhotos.forEach((p) => {
            if (p && typeof p === "object") delete p.fileData;
        });
    }
    if (Array.isArray(obj.photos)) {
        obj.photos.forEach((p) => {
            if (p && typeof p === "object") delete p.fileData;
        });
    }
    if (Array.isArray(obj.docs)) {
        obj.docs.forEach((p) => {
            if (p && typeof p === "object") delete p.fileData;
        });
    }
    if (Array.isArray(obj.attachments)) {
        obj.attachments.forEach((p) => {
            if (p && typeof p === "object") delete p.fileData;
        });
    }
    return obj;
};
