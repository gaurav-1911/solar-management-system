import Technician from "../models/technician.model.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import sendEmail from "../services/mail.service.js";
import welcomeUserTemplate from "../templates/welcomeUser.template.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Generate the next sequential human-friendly ID like TECH-001, TECH-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateTechnicianId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every technician ID in the collection.
    const lastDoc = await Technician.findOne({ technicianId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("technicianId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.technicianId) {
        const m = lastDoc.technicianId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `TECH-${String(max + 1).padStart(3, "0")}`;
};

export const createTechnician = async (req, res) => {
    try {
        const data = { ...req.body };
        // Retry on duplicate-key so two simultaneous creates don't collide on the same TECH-XXX
        let technician;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.technicianId = await generateTechnicianId();
                technician = await Technician.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        let emailSent = false;
        try {
            const defaultPassword = "Welcome@123";
            const loginUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/admin/login`;
            const emailTemplate = welcomeUserTemplate({
                userName: technician.name || "there",
                email: technician.email,
                password: defaultPassword,
                loginUrl,
                supportEmail: process.env.EMAIL_USER
            });
            await sendEmail(
                technician.email,
                `Welcome – Your Technician Account is Ready – Solar Management System`,
                {
                    html: emailTemplate,
                    text: `Hi ${technician.name || "there"},\n\nYour technician account on the Solar Management System has been created.\n\nTechnician ID: ${technician.technicianId}\nEmail: ${technician.email}\nTemporary Password: ${defaultPassword}\n\nSign in here: ${loginUrl}\n\nPlease change your password after your first login.`
                }
            );
            emailSent = true;
        } catch (mailErr) {
            console.error("Welcome email sending failed:", mailErr.message);
        }

        // Auto-create a User account so the technician can log in to the
        // dashboard — mirrors the reverse sync in the User controller.
        try {
            const existingUser = await User.findOne({ email: technician.email });
            if (!existingUser) {
                const defaultPassword = "Welcome@123";
                const hashedPassword = await bcrypt.hash(defaultPassword, 10);
                const userCount = await User.countDocuments();
                await User.create({
                    name: technician.name,
                    email: technician.email,
                    username: (technician.email || "").split("@")[0] || null,
                    phone: technician.phone || "",
                    password: hashedPassword,
                    role: "technician",
                    status: "active",
                    employeeId: `EMP-${String(userCount + 1).padStart(3, "0")}`,
                    joinDate: technician.joinDate || new Date(),
                });
            }
        } catch (userErr) {
            console.error("Auto-create user account failed:", userErr.message);
        }

        logActivity({
            module: "technicians",
            action: "created",
            recordId: technician.technicianId || String(technician._id),
            recordLabel: technician.name,
            req,
            changes: computeChanges({}, technician.toObject ? technician.toObject() : technician),
            summary: `Technician created: ${technician.name}`
        });

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: emailSent
                ? `Technician created successfully. Welcome email sent to ${technician.email}`
                : "Technician created successfully, but welcome email could not be sent",
            data: technician,
            emailSent
        });
    } catch (error) {
        console.error("Create Technician Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllTechnicians = async (req, res) => {
    try {
        const {
            search,
            status,
            skill,
            experience,
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
        if (skill && skill !== "All") {
            filter.skills = skill;
        }
        if (experience && experience !== "All") {
            filter.experience = experience;
        }
        if (search) {
            filter.$or = [
                { technicianId: { $regex: search, $options: "i" } },
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }
        // A technician account only ever sees its OWN roster entry — the page
        // is used by technicians purely for their own live location/attendance.
        if (req.user?.role === "technician") {
            if (req.user?.name) {
                filter.name = { $regex: new RegExp(`^${req.user.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
            } else {
                filter._id = { $exists: false };
            }
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Technician.countDocuments(filter);
        const technicians = await Technician.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: technicians,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Technicians Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getTechnicianById = async (req, res) => {
    try {
        const technician = await Technician.findById(req.params.id).lean();

        if (!technician) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Technician not found"
            });
        }

        // Technicians may only view their own roster entry.
        if (req.user?.role === "technician") {
            const myName = String(req.user?.name || "").trim().toLowerCase();
            if (!myName || String(technician.name || "").trim().toLowerCase() !== myName) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this technician profile does not belong to your account"
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: technician
        });
    } catch (error) {
        console.error("Get Technician By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateTechnician = async (req, res) => {
    try {
        const data = { ...req.body };
        // technicianId is system-generated; never allow clients to overwrite it
        delete data.technicianId;
        const technician = await Technician.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        if (!technician) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Technician not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Technician updated successfully",
            data: technician
        });
    } catch (error) {
        console.error("Update Technician Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteTechnician = async (req, res) => {
    try {
        const technician = await Technician.findByIdAndDelete(req.params.id);

        if (!technician) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Technician not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Technician deleted successfully"
        });
    } catch (error) {
        console.error("Delete Technician Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
