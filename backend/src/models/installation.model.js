import mongoose from "mongoose";

const installationSchema = new mongoose.Schema(
    {
        installationId: {
            type: String,
            unique: true,
            trim: true
        },
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true,
            minlength: [2, "Customer name must be at least 2 characters"],
            maxlength: [50, "Customer name cannot exceed 50 characters"]
        },
        leadId: {
            type: String,
            required: [true, "Lead ID is required"],
            trim: true
        },
        projectName: {
            type: String,
            default: "",
            trim: true,
            maxlength: [100, "Project name cannot exceed 100 characters"]
        },
        projectApprovalId: {
            type: String,
            default: "",
            trim: true
        },
        installationDate: {
            type: Date,
            required: [true, "Installation date is required"]
        },
        installationTime: {
            type: String,
            required: [true, "Installation time is required"]
        },
        installationAddress: {
            type: String,
            required: [true, "Installation address is required"],
            trim: true,
            minlength: [3, "Installation address must be at least 3 characters"],
            maxlength: [200, "Installation address cannot exceed 200 characters"]
        },
        installationStatus: {
            type: String,
            enum: ["Pending", "Scheduled", "In Progress", "Completed", "On Hold"],
            required: [true, "Installation status is required"]
        },
        notes: {
            type: String,
            default: "",
            maxlength: [500, "Notes cannot exceed 500 characters"]
        },
        technicianName: {
            type: String,
            default: "",
            maxlength: [50, "Technician name cannot exceed 50 characters"]
        },
        technicianId: {
            type: String,
            default: "",
            maxlength: [50, "Technician ID cannot exceed 50 characters"]
        },
        // Dynamic tasks with daily progress logs. Each task tracks a named
        // installation sub-activity (e.g. "Mounting Structure", "Wiring") with
        // its own status and a log of daily descriptions so technicians can
        // record what was done each day and what remains.
        tasks: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        // Materials used during installation. Pre-filled from the lead's
        // quotation. Each entry stores a snapshot of the product plus the
        // quantity actually used and its availability. Entries with
        // requested=true are additional materials the technician requested
        // that were not in the original quotation.
        materials: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        // Additional material requests from the technician — items not in
        // the original quotation that are needed for the installation.
        materialRequests: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        // Quotation ID for remaining products sent to customer for billing
        remainingProductsQuotationId: {
            type: String,
            default: "",
            trim: true
        },
        sitePhotos: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        verificationStatus: {
            type: String,
            enum: ["Verified", "Not Verified"],
            required: [true, "Verification status is required"]
        },
        verificationNotes: {
            type: String,
            default: "",
            maxlength: [500, "Verification notes cannot exceed 500 characters"]
        }
    },
    {
        timestamps: true
    }
);

installationSchema.index({ leadId: 1 });
installationSchema.index({ technicianId: 1 });
installationSchema.index({ installationStatus: 1 });
installationSchema.index({ createdAt: -1 });

const Installation = mongoose.model("Installation", installationSchema);

export default Installation;
