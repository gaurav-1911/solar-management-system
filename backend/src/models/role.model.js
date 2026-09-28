import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
    {
        view: { type: Boolean, default: false },
        create: { type: Boolean, default: false },
        edit: { type: Boolean, default: false },
        delete: { type: Boolean, default: false },
        export: { type: Boolean, default: false }
    },
    { _id: false }
);

const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Role name is required"],
            trim: true,
            unique: true
        },
        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true
        },
        color: {
            type: String,
            default: "slate"
        },
        isSystem: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        },
        userCount: {
            type: Number,
            default: 0
        },
        permissions: {
            type: Map,
            of: permissionSchema,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

// Indexes for fast list queries — the Roles & Permissions module lists roles
// sorted by creation date and filters by status/system type.
roleSchema.index({ createdAt: -1 });
roleSchema.index({ status: 1, isSystem: 1 });

const Role = mongoose.model("Role", roleSchema);

export default Role;
