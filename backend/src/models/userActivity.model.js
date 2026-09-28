import mongoose from "mongoose";

const userActivitySchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: [true, "User ID is required"],
            trim: true
        },
        user: {
            type: String,
            trim: true,
            default: ""
        },
        action: {
            type: String,
            enum: [
                "Login", "Profile Update", "Role Change", "User Created",
                "Permission Change", "Password Reset", "Document Upload"
            ],
            required: [true, "Action is required"]
        },
        detail: {
            type: String,
            trim: true,
            default: ""
        },
        device: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const UserActivity = mongoose.model("UserActivity", userActivitySchema);

export default UserActivity;
