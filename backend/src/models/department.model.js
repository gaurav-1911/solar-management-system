import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Department name is required"],
            trim: true,
            unique: true
        },
        code: {
            type: String,
            trim: true,
            lowercase: true
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        head: {
            type: String,
            trim: true,
            default: "Not Assigned"
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        },
        userCount: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

const Department = mongoose.model("Department", departmentSchema);

export default Department;
