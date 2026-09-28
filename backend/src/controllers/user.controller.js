import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import UserActivity from "../models/userActivity.model.js";
import Technician from "../models/technician.model.js";
import sendEmail from "../services/mail.service.js";
import welcomeUserTemplate from "../templates/welcomeUser.template.js";
import {
    validateCreateUser,
    validateUpdateUser,
    validateCreateActivity
} from "../validations/user.validation.js";
import { logActivity } from "../utils/activityLogger.js";

export const getAllUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            status,
            role,
            department,
            sortField = "createdAt",
            sortDir = -1
        } = req.query;

        const filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { username: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
                { employeeId: { $regex: search, $options: "i" } }
            ];
            // Allow searching by the record's own database ID (exact match)
            // when the term is a valid ObjectId.
            if (mongoose.Types.ObjectId.isValid(search)) {
                filter.$or.push({ _id: mongoose.Types.ObjectId(search) });
            }
        }
        if (status) filter.status = status;
        if (role) filter.role = role;
        if (department) filter.department = department;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const sort = {};
        sort[sortField] = parseInt(sortDir, 10);

        const [users, total] = await Promise.all([
            // .lean() skips Mongoose document hydration — much faster when
            // returning large lists (up to 1000 users) to the frontend.
            User.find(filter)
                .select("-password")
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            User.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            message: "Users fetched successfully",
            data: users,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }
        res.status(200).json({
            success: true,
            message: "User fetched successfully",
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createUser = async (req, res) => {
    try {
        const { error, value } = validateCreateUser.validate(req.body);
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        // At least one login identifier (email or username) is required.
        if (!value.email && !value.username) {
            return res
                .status(400)
                .json({ success: false, message: "Email or username is required" });
        }

        // Derive the missing identifier so every account has both.
        if (!value.email && value.username) {
            value.email = `${value.username}@solar.local`;
        }

        // Derive a readable display name from the login identifier when a
        // name was not provided in the request body (defensive safety net —
        // the Add User form always sends a validated name). Only characters
        // allowed by the name pattern are kept so the derived name can never
        // fail later validation (e.g. digits in usernames).
        if (!value.name) {
            const source = value.username || (value.email || "").split("@")[0] || "User";
            value.name = source
                .replace(/[._-]+/g, " ")
                .replace(/[^A-Za-z\s.'-]/g, "")
                .replace(/\b\w/g, (ch) => ch.toUpperCase())
                .trim() || "User";
        }

        const existing = await User.findOne({ email: value.email });
        if (existing) {
            return res
                .status(400)
                .json({ success: false, message: "User with this email already exists" });
        }

        if (value.username) {
            const existingUsername = await User.findOne({ username: value.username });
            if (existingUsername) {
                return res
                    .status(400)
                    .json({ success: false, message: "Username is already taken" });
            }
        } else {
            // Auto-generate a username from the email local part when the admin
            // only provides an email address.
            value.username = (value.email.split("@")[0] || "").replace(/[^a-z0-9._-]/g, "").slice(0, 30) || null;
            if (value.username) {
                const existingUsername = await User.findOne({ username: value.username });
                if (existingUsername) {
                    value.username = `${value.username}.${Math.floor(1000 + Math.random() * 9000)}`;
                }
            }
        }

        // Every new account gets the same default password, which is emailed
        // to the user below — any password sent in the payload is ignored.
        const defaultPassword = "Welcome@123";
        value.password = await bcrypt.hash(defaultPassword, 10);

        if (!value.employeeId) {
            const userCount = await User.countDocuments();
            const nextNum = String(userCount + 1).padStart(3, "0");
            value.employeeId = `EMP-${nextNum}`;
        }

        const user = await User.create(value);

        // Auto-create a Technician roster entry when the new user has the
        // technician role — so they appear in the Technician Management page
        // without the admin having to create the same person twice.
        if (value.role === "technician") {
            try {
                const existingTech = await Technician.findOne({ email: value.email });
                if (!existingTech) {
                    const lastDoc = await Technician.findOne({ technicianId: { $exists: true, $ne: null } })
                        .sort({ _id: -1 }).select("technicianId").lean();
                    let maxNum = 0;
                    if (lastDoc?.technicianId) {
                        const m = lastDoc.technicianId.match(/(\d+)$/);
                        if (m) maxNum = parseInt(m[1], 10);
                    }
                    await Technician.create({
                        name: user.name,
                        phone: user.phone || "",
                        email: user.email,
                        region: "",
                        skills: ["Site Survey"],
                        experience: "0-1 Years",
                        status: "Available",
                        joinDate: new Date(),
                        technicianId: `TECH-${String(maxNum + 1).padStart(3, "0")}`,
                    });
                }
            } catch (techErr) {
                console.error("Auto-create technician failed:", techErr.message);
            }
        }

        // Send the welcome email with the default credentials (best-effort —
        // account creation must never fail because the mail service is down).
        let emailSent = false;
        try {
            const loginUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/admin/login`;
            const emailTemplate = welcomeUserTemplate({
                userName: user.name || "there",
                email: user.email,
                password: defaultPassword,
                loginUrl,
                supportEmail: process.env.EMAIL_USER
            });
            await sendEmail(
                user.email,
                "Welcome – Your Account is Ready – Solar Management System",
                {
                    html: emailTemplate,
                    text: `Hi ${user.name || "there"},\n\nYour account on the Solar Management System has been created.\n\nEmail: ${user.email}\nTemporary Password: ${defaultPassword}\n\nSign in here: ${loginUrl}\n\nPlease change your password after your first login.`
                }
            );
            emailSent = true;
        } catch (mailErr) {
            console.error("Welcome email sending failed:", mailErr.message);
        }


        const createChanges = [
            { field: "Name", oldValue: null, newValue: user.name || "—" },
            { field: "Username", oldValue: null, newValue: user.username || "—" },
            { field: "Email", oldValue: null, newValue: user.email || "—" },
            { field: "Phone", oldValue: null, newValue: user.phone || "—" },
            { field: "Role", oldValue: null, newValue: user.role || "—" },
            { field: "Status", oldValue: null, newValue: user.status || "active" },
            { field: "Employee Id", oldValue: null, newValue: user.employeeId || "—" }
        ].filter((c) => c.newValue && c.newValue !== "—");

        try {
            await UserActivity.create({
                userId: String(user._id),
                user: user.name || user.email,
                action: "User Created",
                detail: `New account created with role '${user.role}'`,
                changes: createChanges,
                device: req.headers["user-agent"] || "Web Dashboard"
            });
        } catch (e) { }

        try {
            await logActivity({
                module: "users",
                action: "created",
                recordId: String(user._id),
                recordLabel: user.name || user.email,
                req,
                changes: createChanges,
                summary: `User created: ${user.name || user.email}`
            });
        } catch (e) { }

        res.status(201).json({
            success: true,
            message: emailSent
                ? `User created successfully. Welcome email sent to ${user.email}`
                : "User created successfully, but welcome email could not be sent",
            data: user,
            emailSent
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateUser = async (req, res) => {
    try {
        const { error, value } = validateUpdateUser.validate(req.body);
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        if (value.email) {
            const existing = await User.findOne({
                email: value.email,
                _id: { $ne: req.params.id }
            });
            if (existing) {
                return res
                    .status(400)
                    .json({ success: false, message: "Email already in use by another user" });
            }
        }

        if (value.username) {
            const existingUsername = await User.findOne({
                username: value.username,
                _id: { $ne: req.params.id }
            });
            if (existingUsername) {
                return res
                    .status(400)
                    .json({ success: false, message: "Username is already taken" });
            }
        } else if (value.username === "") {
            // Allow clearing a username on update.
            value.username = null;
        }

        // ── Account-status safety guards ────────────────────────────────
        // A user must never be able to deactivate their OWN account: the
        // update would succeed, but the auth middleware then rejects every
        // later request from the now-inactive account ("Account is inactive.
        // Access denied."), permanently locking the user out of the panel.
        const isSelfUpdate =
            req.user?.userId && String(req.params.id) === String(req.user.userId);

        if (isSelfUpdate && value.status === "inactive") {
            return res.status(400).json({
                success: false,
                message: "You cannot deactivate your own account"
            });
        }

        // Never leave the system without an active Super Admin.
        if (value.status === "inactive") {
            const target = await User.findById(req.params.id);
            if (target && target.role === "super_admin" && target.status === "active") {
                const activeSuperAdmins = await User.countDocuments({
                    role: "super_admin",
                    status: "active"
                });
                if (activeSuperAdmins <= 1) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot deactivate the last active Super Admin"
                    });
                }
            }
        }

        const existingUser = await User.findById(req.params.id).lean();
        if (!existingUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const user = await User.findByIdAndUpdate(req.params.id, value, {
            new: true,
            runValidators: true
        });

        // Compute field-level diffs
        const changes = [];
        const trackFields = ["name", "email", "username", "phone", "role", "status", "employeeId", "designation"];
        for (const f of trackFields) {
            if (value[f] !== undefined && String(value[f] ?? "") !== String(existingUser[f] ?? "")) {
                changes.push({
                    field: f.charAt(0).toUpperCase() + f.slice(1),
                    oldValue: existingUser[f] || "—",
                    newValue: value[f] || "—"
                });
            }
        }

        let message = "User updated successfully";
        let actionName = "Profile Update";
        let detailMsg = `Updated account & profile details for ${user.name}`;

        if (value.status && value.status !== existingUser.status) {
            actionName = "Status Change";
            if (value.status === "active") {
                message = "User activated successfully";
                detailMsg = `Activated user account for ${user.name}`;
            } else if (value.status === "inactive") {
                message = "User deactivated successfully";
                detailMsg = `Deactivated user account for ${user.name}`;
            }
        } else if (value.role && value.role !== existingUser.role) {
            actionName = "Role Change";
            detailMsg = `Changed role for ${user.name} from '${existingUser.role}' to '${value.role}'`;
        }

        try {
            await UserActivity.create({
                userId: String(user._id),
                user: user.name || user.email,
                action: actionName,
                detail: detailMsg,
                changes,
                device: req.headers["user-agent"] || "Web Dashboard"
            });
        } catch (e) { }

        try {
            await logActivity({
                module: "users",
                action: value.status && value.status !== existingUser.status ? "status_change" : "updated",
                recordId: String(user._id),
                recordLabel: user.name || user.email,
                req,
                changes,
                summary: `${message}: ${user.name}`
            });
        } catch (e) { }

        res.status(200).json({
            success: true,
            message,
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        // Same lockout protection as updateUser — never allow deleting your
        // own account or the last active Super Admin.
        const isSelfDelete =
            req.user?.userId && String(req.params.id) === String(req.user.userId);
        if (isSelfDelete) {
            return res.status(400).json({
                success: false,
                message: "You cannot delete your own account"
            });
        }

        const existing = await User.findById(req.params.id);
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }

        if (existing.role === "super_admin" && existing.status === "active") {
            const activeSuperAdmins = await User.countDocuments({
                role: "super_admin",
                status: "active"
            });
            if (activeSuperAdmins <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot delete the last active Super Admin"
                });
            }
        }

        const userName = existing.name || existing.email || "";
        const userEmail = existing.email || "";
        const userRole = existing.role || "";

        // ── Cascade cleanup: remove/neutralize all references to this user
        // across the system. Failures are non-fatal — the user record is
        // always deleted even if some references can't be cleaned up.
        const cascadeErrors = [];
        const safeUpdate = async (model, filter, update) => {
            try {
                const result = await model.updateMany(filter, update);
                return result.modifiedCount || 0;
            } catch (err) {
                cascadeErrors.push(`${model.modelName}: ${err.message}`);
                return 0;
            }
        };
        const safeDelete = async (model, filter) => {
            try {
                const result = await model.deleteMany(filter);
                return result.deletedCount || 0;
            } catch (err) {
                cascadeErrors.push(`${model.modelName}: ${err.message}`);
                return 0;
            }
        };

        // Dynamically import models to avoid circular dependencies
        const [
            LeadModel,
            FollowUpModel,
            InstallationModel,
            CustomerModel,
            SiteSurveyModel,
            DailyReportModel,
            DailyProgressLogModel,
            AttendanceModel,
            TaskAssignmentModel,
            TeamScheduleModel,
            TechnicianLocationModel,
            TechnicianTaskModel,
            MaintenanceTicketModel,
            TicketSupportModel,
            ServiceVisitModel,
            UserActivityModel,
            NotificationModel,
            QuotationModel,
            ProjectApprovalModel,
            SolarDesignModel,
            TestingModel,
            CommissioningModel,
            InvoiceModel,
            WarrantyModel,
            AmcModel,
            ActivityModel,
            ActivityLogModel,
        ] = await Promise.all([
            import("../models/lead.model.js").then(m => m.default),
            import("../models/followUp.model.js").then(m => m.default),
            import("../models/installation.model.js").then(m => m.default),
            import("../models/customer.model.js").then(m => m.default),
            import("../models/siteSurvey.model.js").then(m => m.default),
            import("../models/dailyReport.model.js").then(m => m.default),
            import("../models/dailyProgressLog.model.js").then(m => m.default),
            import("../models/attendance.model.js").then(m => m.default),
            import("../models/taskAssignment.model.js").then(m => m.default),
            import("../models/teamSchedule.model.js").then(m => m.default),
            import("../models/technicianLocation.model.js").then(m => m.default),
            import("../models/technicianTask.model.js").then(m => m.default),
            import("../models/maintenanceTicket.model.js").then(m => m.default),
            import("../models/ticketSupport.model.js").then(m => m.default),
            import("../models/serviceVisit.model.js").then(m => m.default),
            import("../models/userActivity.model.js").then(m => m.default),
            import("../models/notification.model.js").then(m => m.default),
            import("../models/quotation.model.js").then(m => m.default),
            import("../models/projectApproval.model.js").then(m => m.default),
            import("../models/solarDesign.model.js").then(m => m.default),
            import("../models/testing.model.js").then(m => m.default),
            import("../models/commissioningAndHandover.model.js").then(m => m.default),
            import("../models/invoice.model.js").then(m => m.default),
            import("../models/warranty.model.js").then(m => m.default),
            import("../models/amc.model.js").then(m => m.default),
            import("../models/activity.model.js").then(m => m.default),
            import("../models/activityLog.model.js").then(m => m.default),
        ]);

        const nameMatch = { $regex: new RegExp(`^${userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), $options: "i" };
        const emailMatch = userEmail.toLowerCase();

        // ── 1. If technician role, delete the linked Technician roster entry
        if (userRole === "technician" || userRole === "technician_admin") {
            await safeDelete(Technician, { email: emailMatch });
        }

        // ── 2. Clear technician/sales references across modules
        // Leads: assigned to this user → Unassigned
        await safeUpdate(LeadModel, { assigned: nameMatch }, { $set: { assigned: "Unassigned" } });

        // Follow-ups: assignedTo → Unassigned
        await safeUpdate(FollowUpModel, { assignedTo: nameMatch }, { $set: { assignedTo: "Unassigned" } });

        // Installations: technicianName → Unassigned
        await safeUpdate(InstallationModel, { technicianName: nameMatch }, { $set: { technicianName: "Unassigned", technicianId: "" } });

        // Customers: clear technician assignment
        await safeUpdate(CustomerModel, { $or: [{ technicianName: nameMatch }, { technicianEmail: emailMatch }] }, { $set: { technicianName: "", technicianEmail: "", technicianId: "" } });

        // Site surveys: clear technician
        await safeUpdate(SiteSurveyModel, { $or: [{ technicianName: nameMatch }, { technicianId: nameMatch }] }, { $set: { technicianName: "", technicianId: "" } });

        // Daily reports: clear technician
        await safeUpdate(DailyReportModel, { $or: [{ technicianName: nameMatch }, { technicianId: nameMatch }] }, { $set: { technicianName: "", technicianId: "" } });

        // Daily progress logs: clear technician
        await safeUpdate(DailyProgressLogModel, { technician: nameMatch }, { $set: { technician: "" } });

        // Attendance: clear technician
        await safeUpdate(AttendanceModel, { $or: [{ technicianName: nameMatch }, { technicianId: nameMatch }] }, { $set: { technicianName: "", technicianId: "" } });

        // Task assignments: clear technician
        await safeUpdate(TaskAssignmentModel, { $or: [{ technicianName: nameMatch }, { technicianId: nameMatch }] }, { $set: { technicianName: "Unassigned", technicianId: "" } });

        // Team schedules: clear technician
        await safeUpdate(TeamScheduleModel, { $or: [{ technicianName: nameMatch }, { technicianId: nameMatch }] }, { $set: { technicianName: "", technicianId: "" } });

        // Technician locations: clear
        await safeUpdate(TechnicianLocationModel, { $or: [{ technicianName: nameMatch }, { technicianId: nameMatch }] }, { $set: { technicianName: "", technicianId: "" } });

        // Technician tasks: clear
        await safeUpdate(TechnicianTaskModel, { $or: [{ technicianName: nameMatch }, { technicianId: nameMatch }] }, { $set: { technicianName: "Unassigned", technicianId: "" } });

        // Maintenance tickets: clear technician
        await safeUpdate(MaintenanceTicketModel, { $or: [{ technician: nameMatch }, { technicianEmail: emailMatch }] }, { $set: { technician: "Unassigned", technicianEmail: "" } });

        // Ticket support: clear technician
        await safeUpdate(TicketSupportModel, { $or: [{ assignedTo: nameMatch }, { technicianEmail: emailMatch }] }, { $set: { assignedTo: "Unassigned", technicianEmail: "" } });

        // Service visits: clear technician
        await safeUpdate(ServiceVisitModel, { $or: [{ technician: nameMatch }, { technicianEmail: emailMatch }] }, { $set: { technician: "" } });

        // ── 3. Delete user-specific data (activities, notifications)
        await safeDelete(UserActivityModel, { userId: String(existing._id) });
        await safeDelete(NotificationModel, { recipientUserId: String(existing._id) });
        await safeDelete(ActivityModel, { $or: [{ userId: String(existing._id) }, { user: nameMatch }] });
        await safeDelete(ActivityLogModel, { $or: [{ userId: String(existing._id) }, { user: nameMatch }] });

        // ── 4. Delete the User record itself
        const user = await User.findByIdAndDelete(req.params.id);

        // Log the deletion (creates audit records in both UserActivity & ActivityLog)
        const deleteChanges = [
            { field: "User Account", oldValue: `${userName} (${userEmail})`, newValue: "Deleted" },
            { field: "Role", oldValue: userRole, newValue: "—" },
            { field: "Status", oldValue: "active", newValue: "deleted" }
        ];

        try {
            await UserActivity.create({
                userId: "system",
                user: req.user?.name || "Admin",
                action: "User Deleted",
                detail: `Deleted user account ${userName} (${userEmail}) [role: ${userRole}]`,
                changes: deleteChanges,
                device: req.headers["user-agent"] || "Web Dashboard"
            });
        } catch (e) { }

        try {
            await logActivity({
                module: "users",
                action: "deleted",
                recordId: String(req.params.id),
                recordLabel: `${userName} (${userEmail})`,
                req,
                changes: deleteChanges,
                summary: `Deleted user account ${userName} (${userEmail})`
            });
        } catch (e) { }

        res.status(200).json({
            success: true,
            message: cascadeErrors.length ? `User deleted successfully. Note: ${cascadeErrors.length} reference(s) could not be cleaned: ${cascadeErrors.slice(0, 3).join(", ")}` : "User deleted successfully",
            data: { deletedUserId: req.params.id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getActivities = async (req, res) => {
    try {
        const { userId, action, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (userId) filter.userId = userId;
        if (action) filter.action = action;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const [activities, total] = await Promise.all([
            UserActivity.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            UserActivity.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            message: "Activities fetched successfully",
            data: activities,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createActivity = async (req, res) => {
    try {
        const { error, value } = validateCreateActivity.validate(req.body);
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        const activity = await UserActivity.create(value);
        res.status(201).json({
            success: true,
            message: "Activity created successfully",
            data: activity
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
