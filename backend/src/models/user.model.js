import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
            default: "User"
        },
        username: {
            type: String,
            trim: true,
            lowercase: true,
            default: null,
            // Sparse unique index lets multiple documents omit the username
            // while keeping it unique whenever it is set.
            sparse: true,
            unique: true
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true,
            unique: true,
            match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"]
        },
        password: {
            type: String,
            required: [true, "Password is required"]
        },
        phone: {
            type: String,
            trim: true,
            default: ""
        },

        role: {
            type: String,
            default: "super_admin"
        },

        resetPasswordToken: {
            type: String,
            default: null
        },
        resetPasswordExpire: {
            type: Date,
            default: null
        },
        department: {
            type: String,
            default: "admin"
        },
        location: {
            type: String,
            trim: true,
            default: ""
        },
        bio: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        },
        joinDate: {
            type: Date,
            default: null
        },
        employeeId: {
            type: String,
            trim: true,
            default: ""
        },
        photo: {
            type: String,
            default: null
        },
        lastLogin: {
            type: Date,
            default: null
        },
        tokenVersion: {
            type: Number,
            default: 0
        },
        documents: {
            type: Number,
            default: 0
        },
        permissions: [{
            type: String
        }],
        modules: [{
            type: String
        }]
    },
    {
        timestamps: true
    }
);

// Indexes for fast list queries — the User Management module loads up to
// 1000 users sorted by creation date and filters by role/department/status.
userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1 });

const User = mongoose.model("User", userSchema);

export default User;
