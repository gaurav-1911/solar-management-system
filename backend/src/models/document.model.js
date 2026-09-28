import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Document name is required"],
            trim: true
        },
        category: {
            type: String,
            trim: true,
            required: [true, "Category is required"]
        },
        entity: {
            type: String,
            trim: true,
            default: ""
        },
        entityType: {
            type: String,
            trim: true,
            default: ""
        },
        fileType: {
            type: String,
            enum: ["pdf", "image", "spreadsheet", "word", "drawing", "other"],
            default: "other"
        },
        size: {
            type: Number,
            default: 0
        },
        // The actual uploaded file bytes, stored directly in MongoDB.
        // (max ~10MB, enforced by multer limits in document.routes.js)
        fileData: {
            type: Buffer,
            default: null
        },
        
        publicId: {
            type: String,
            default: ""
        },
        
        url: {
            type: String,
            default: ""
        },
        mimeType: {
            type: String,
            default: ""
        },
        originalName: {
            type: String,
            trim: true,
            default: ""
        },
        // True when real file bytes are stored in fileData. Used by list
        // queries (which exclude fileData for size) to show the download
        // button only when a file actually exists.
        hasFile: {
            type: Boolean,
            default: false
        },
        uploadedBy: {
            type: String,
            trim: true,
            default: ""
        },
        uploadedByRole: {
            type: String,
            trim: true,
            default: ""
        },
        access: {
            type: String,
            enum: ["admin", "finance", "team", "all"],
            default: "admin"
        },
        tags: [{
            type: String,
            trim: true
        }],
        status: {
            type: String,
            enum: ["approved", "pending", "rejected", "draft"],
            default: "draft"
        },
        verifiedBy: {
            type: String,
            trim: true,
            default: ""
        },
        verifiedAt: {
            type: Date,
            default: null
        },
        rejectedBy: {
            type: String,
            trim: true,
            default: ""
        },
        rejectedAt: {
            type: Date,
            default: null
        },
        rejectionReason: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const Document = mongoose.model("Document", documentSchema);

export default Document;
