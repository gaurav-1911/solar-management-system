import mongoose from "mongoose";

const pendingFileSchema = new mongoose.Schema(
    {
        // Cloudinary asset id (new uploads) — the bytes live in Cloudinary.
        publicId: {
            type: String,
            default: ""
        },
        // Cloudinary CDN URL for the staged file.
        url: {
            type: String,
            default: ""
        },
        // Legacy embedded bytes (pre-Cloudinary uploads) — kept optional.
        fileData: {
            type: Buffer,
            default: null
        },
        originalName: {
            type: String,
            default: ""
        },
        mimeType: {
            type: String,
            default: ""
        },
        size: {
            type: Number,
            default: 0
        },
        fileType: {
            type: String,
            default: "other"
        },
        uploadedBy: {
            type: String,
            default: ""
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 60 * 60 * 24 // auto-delete staged files after 24 hours
        }
    },
    { timestamps: true }
);

const PendingFile = mongoose.model("PendingFile", pendingFileSchema);

export default PendingFile;
