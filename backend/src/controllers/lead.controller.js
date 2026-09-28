import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Lead from "../models/lead.model.js";
import Customer from "../models/customer.model.js";
import User from "../models/user.model.js";
import Activity from "../models/activity.model.js";
import sendEmail from "../services/mail.service.js";
import welcomeUserTemplate from "../templates/welcomeUser.template.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { formatLead, getMaxLeadNumber } from "../utils/leadHelpers.js";
import { formatCustomer, getMaxCustomerNumber } from "../utils/customerHelpers.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { validateStatusTransition } from "../utils/statusTransitions.js";
import { checkDependencies } from "../utils/dependencies.js";

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Generate the next sequential human-friendly ID like L-001, L-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateLeadId = async () => {
    const max = await getMaxLeadNumber(Lead);
    return `L-${String(max + 1).padStart(3, "0")}`;
};

// Generate the next sequential human-friendly ID like CUS-001, CUS-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateCustomerId = async () => {
    const max = await getMaxCustomerNumber(Customer);
    return `CUS-${String(max + 1).padStart(3, "0")}`;
};

const DEFAULT_ACCOUNT_PASSWORD = "Welcome@123";

let cachedWelcomePasswordHash = null;
const getWelcomePasswordHash = async () => {
    if (!cachedWelcomePasswordHash) {
        cachedWelcomePasswordHash = await bcrypt.hash(DEFAULT_ACCOUNT_PASSWORD, 10);
    }
    return cachedWelcomePasswordHash;
};

export const ensureCustomerUserAccount = async (lead) => {
    const email = String(lead.email || "").trim().toLowerCase();
    if (!email) {
        return { created: false, email: "", password: "" };
    }

    try {
        const existing = await User.findOne({ email }).lean();
        if (existing) {
            return { created: false, email, password: "" };
        }

        const password = DEFAULT_ACCOUNT_PASSWORD;

        // Derive a username from the email local part (same rule as createUser)
        let username = (email.split("@")[0] || "")
            .replace(/[^a-z0-9._-]/g, "")
            .slice(0, 30) || null;
        if (username) {
            const taken = await User.findOne({ username }).lean();
            if (taken) {
                username = `${username}.${Math.floor(1000 + Math.random() * 9000)}`;
            }
        }

        const passwordHash = await getWelcomePasswordHash();

        await User.create({
            name: lead.name || "Customer",
            email,
            username,
            password: passwordHash,
            phone: lead.phone || "",
            role: "customer",
            department: "customer",
            status: "active"
        });

        // Non-blocking background welcome email dispatch for sub-50ms API responses
        setImmediate(async () => {
            try {
                const loginUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/admin/login`;
                const emailTemplate = welcomeUserTemplate({
                    userName: lead.name || "there",
                    email,
                    password,
                    loginUrl,
                    supportEmail: process.env.EMAIL_USER
                });
                await sendEmail(
                    email,
                    "Welcome – Your Account is Ready – Solar Management System",
                    {
                        html: emailTemplate,
                        text: `Hi ${lead.name || "there"},\n\nYour account on the Solar Management System has been created.\n\nEmail: ${email}\nTemporary Password: ${password}\n\nSign in here: ${loginUrl}\n\nPlease change your password after your first login.`
                    }
                );
            } catch (mailErr) {
                console.error("Welcome email sending failed:", mailErr.message);
            }
        });

        return { created: true, email, password };
    } catch (error) {
        console.error("Customer account creation failed:", error.message);
        return { created: false, email, password: "" };
    }
};

//#region Lead → Customer Conversion
/**
 * Ensure a Customer exists for a converted lead.
 *  - Lead already linked (customerId set) → no-op, returns the stored code.
 *  - Existing customer with the same email → links it (never duplicates).
 *  - Otherwise → creates a new Customer from the lead data.
 *
 * Sets lead.customerId in memory; the caller is responsible for saving the lead.
 * Returns { customer, created, customerId }.
 * Exported so other modules (quotation) can auto-convert leads on demand.
 */
export const ensureCustomerForLead = async (lead, technicianId = "", technicianName = "", technicianEmail = "") => {
    if (lead.customerId) {
        // If technician info provided, update existing customer
        if (technicianId) {
            await Customer.updateOne(
                { customerId: lead.customerId },
                { $set: { technicianId, technicianName, technicianEmail } }
            );
        }
        return { customer: null, created: false, customerId: lead.customerId };
    }

    // Emails are lowercased by the schema, so an exact match is reliable
    const email = String(lead.email || "").trim().toLowerCase();

    // Avoid duplicates: link an existing customer with the same email if present
    let customer = null;
    if (email) {
        customer = await Customer.findOne({ email }).lean();
    }

    if (customer) {
        // Link the existing customer back to this lead
        if (!customer.leadId) {
            await Customer.updateOne(
                { _id: customer._id },
                { $set: { leadId: lead.leadId || "" } }
            );
            customer.leadId = lead.leadId || "";
        }
        // Carry the lead's capacity into the linked customer if it has none
        const leadCapacity = lead.capacity ? `${lead.capacity} kW` : "";
        if (!customer.capacity && leadCapacity) {
            await Customer.updateOne(
                { _id: customer._id },
                { $set: { capacity: leadCapacity } }
            );
            customer.capacity = leadCapacity;
        }
        // Assign technician if provided
        if (technicianId) {
            await Customer.updateOne(
                { _id: customer._id },
                { $set: { technicianId, technicianName, technicianEmail } }
            );
        }
        const formatted = formatCustomer(customer);
        lead.customerId = formatted.customerId;
        const account = await ensureCustomerUserAccount(lead);
        return { customer, created: false, customerId: formatted.customerId, account };
    }

    const newCustomer = await Customer.create({
        name: lead.name,
        email: lead.email,
        phone: lead.phone || "",
        type: "Residential",
        address: lead.address || "",
        capacity: lead.capacity ? `${lead.capacity} kW` : "",
        status: "Active",
        notes: `Converted from lead ${lead.leadId || ""}`,
        leadId: lead.leadId || "",
        customerId: await generateCustomerId(),
        technicianId: technicianId || "",
        technicianName: technicianName || "",
        technicianEmail: technicianEmail || ""
    });

    const formatted = formatCustomer(newCustomer.toObject ? newCustomer.toObject() : newCustomer);
    lead.customerId = formatted.customerId;
    const account = await ensureCustomerUserAccount(lead);
    return { customer: newCustomer, created: true, customerId: formatted.customerId, account };
};

//#region Convert Lead to Customer
export const convertLead = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid lead id"
            });
        }

        const lead = await Lead.findById(id);

        if (!lead) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.LEAD_NOT_FOUND
            });
        }

        // Idempotent: already converted and linked → return the existing state
        if (lead.status === "Converted" && lead.customerId) {
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: `Lead ${lead.name} is already converted.`,
                data: {
                    lead: formatLead(lead.toObject ? lead.toObject() : lead),
                    customer: null,
                    created: false
                }
            });
        }

        // Create or link the customer, then mark the lead as Converted
        // (ensureCustomerForLead sets lead.customerId in memory)
        const { technicianId = "", technicianName = "", technicianEmail = "" } = req.body || {};
        const conversion = await ensureCustomerForLead(lead, technicianId, technicianName, technicianEmail);

        lead.status = "Converted";
        await lead.save();

        // Non-blocking activity log creation
        const techText = technicianName ? ` | Assigned Technician: ${technicianName}` : "";
        Activity.create({
            leadId: lead._id,
            type: "converted",
            message: `Lead converted to customer ${conversion.customerId}! Value: ₹${(lead.value || 0).toLocaleString("en-IN")}. Ready for installation.${techText}`,
            user: req.user?.email || "System"
        }).catch((err) => console.error("Activity create error:", err));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.LEAD_CONVERTED_SUCCESS,
            data: {
                lead: formatLead(lead.toObject ? lead.toObject() : lead),
                customer: conversion.customer
                    ? formatCustomer(
                          conversion.customer.toObject
                              ? conversion.customer.toObject()
                              : conversion.customer
                      )
                    : null,
                created: conversion.created,
                account: conversion.account || null
            }
        });
    } catch (error) {
        console.error("Convert Lead Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get All Leads
export const getAllLeads = async (req, res) => {
    try {
        const {
            search,
            status,
            source,
            assigned,
            sortField,
            sortDir,
            page = 1,
            limit = 10,
            startDate,
            endDate
        } = req.query;

        // Build filter query
        const filter = {};
        applyCustomerScope(filter, req);

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        if (status && status !== "All") {
            filter.status = status;
        }

        if (source && source !== "All") {
            filter.source = source;
        }

        if (assigned && assigned !== "All") {
            if (assigned === "Assigned") {
                filter.assigned = { $ne: "Unassigned" };
            } else if (assigned === "Unassigned") {
                filter.assigned = { $in: ["Unassigned", ""] };
            } else {
                filter.assigned = assigned;
            }
        }
   
        if (req.user?.role === "sales_manager") {
            if (req.user?.name) filter.assigned = req.user.name;
            else filter._id = { $exists: false };
        }

        // Search across multiple fields
        if (search) {
            const searchRegex = new RegExp(escapeRegExp(search), "i");
            filter.$or = [
                { leadId: searchRegex },
                { customerId: searchRegex },
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex }
            ];
        }


        let sort = { createdAt: -1, _id: -1 };
        const dir = sortDir === "desc" ? -1 : 1;
        const sortableFields = ["createdAt", "leadId", "name", "value", "followUp"];
        if (sortField && sortableFields.includes(sortField)) {
            sort = { [sortField]: dir };
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;

        // Execute query
        const [leads, total] = await Promise.all([
            Lead.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Lead.countDocuments(filter)
        ]);

        // Transform leads to include formatted leadId
        const formattedLeads = leads.map((lead) => formatLead(lead));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formattedLeads,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All Leads Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Lead By ID
export const getLeadById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid lead id"
            });
        }

        const lead = await Lead.findById(id).lean();

        if (!lead) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.LEAD_NOT_FOUND
            });
        }

        // Sales people may only view their own leads.
        if (req.user?.role === "sales_manager") {
            const myName = String(req.user?.name || "").trim().toLowerCase();
            if (!myName || String(lead.assigned || "").trim().toLowerCase() !== myName) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this lead does not belong to your account"
                });
            }
        }

        // Get activities for this lead
        const activities = await Activity.find({ leadId: id })
            .sort({ createdAt: -1 })
            .lean();

        const formattedActivities = activities.map((act) => ({
            id: act._id,
            leadId: act.leadId,
            type: act.type,
            message: act.message,
            timestamp: act.createdAt
                ? new Date(act.createdAt).toLocaleString()
                : "",
            user: act.user
        }));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                ...formatLead(lead),
                activities: formattedActivities
            }
        });
    } catch (error) {
        console.error("Get Lead By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Create Lead
export const createLead = async (req, res) => {
    try {
        const leadData = { ...req.body };

      
        if (
            req.user?.role === "sales_manager" &&
            req.user?.name &&
            (!leadData.assigned || leadData.assigned === "Unassigned" || leadData.assigned === "")
        ) {
            leadData.assigned = req.user.name;
        }

        // Retry on duplicate-key so two simultaneous creates don't collide on the same L-XXX
        let lead;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const data = { ...leadData, leadId: await generateLeadId() };
                lead = await Lead.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        // If a lead is created directly with status "Converted", create/link
        // its Customer immediately so the customer module reflects it.
        let createdAsConverted = null;
        if (lead.status === "Converted") {
            createdAsConverted = await ensureCustomerForLead(lead);
            await lead.save();
        }

        // Create activity for lead creation
        await Activity.create({
            leadId: lead._id,
            type: "created",
            message: `Lead created from ${lead.source}`,
            user: req.user?.email || "System"
        });

        if (createdAsConverted) {
            await Activity.create({
                leadId: lead._id,
                type: "converted",
                message: `Lead converted to customer ${createdAsConverted.customerId}! Value: ₹${(lead.value || 0).toLocaleString("en-IN")}. Ready for installation.`,
                user: req.user?.email || "System"
            });
        }

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: MESSAGE.LEAD_CREATED_SUCCESS,
            data: formatLead(lead.toObject())
        });
    } catch (error) {
        console.error("Create Lead Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map(
                (e) => e.message
            );
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Update Lead
export const updateLead = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid lead id"
            });
        }

        // System-managed fields — never allow clients to overwrite them
        delete updateData.leadId;
        delete updateData.customerId;
        delete updateData._id;
        delete updateData.__v;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        // Fetch existing lead to compare status changes
        const existingLead = await Lead.findById(id);

        if (!existingLead) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.LEAD_NOT_FOUND
            });
        }

        const oldStatus = existingLead.status;

        // Validate status transition if status is being changed
        if (updateData.status && updateData.status !== oldStatus) {
            const transitionError = validateStatusTransition("leads", oldStatus, updateData.status);
            if (transitionError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: transitionError
                });
            }
        }

        const changes = computeChanges(existingLead, updateData);

        // Apply updates
        Object.keys(updateData).forEach((key) => {
            existingLead[key] = updateData[key];
        });

        // When converting via the edit form, ensure a linked customer exists
        // (creates or links one) before persisting the status change
        let conversion = null;
        if (
            existingLead.status === "Converted" &&
            oldStatus !== "Converted" &&
            !existingLead.customerId
        ) {
            // ensureCustomerForLead sets existingLead.customerId in memory
            conversion = await ensureCustomerForLead(existingLead);
        }

        await existingLead.save();

        res.locals.activityLogged = true;
        logActivity({
            module: "leads",
            action: "updated",
            recordId: existingLead._id,
            recordLabel: existingLead.leadId || existingLead.name,
            req,
            changes,
            summary: `Lead updated by ${req.user?.name || "Super Admin"}`
        }).catch(() => {});

        // Track status changes by comparing against existing DB document
        if (updateData.status && oldStatus !== existingLead.status) {
            await Activity.create({
                leadId: existingLead._id,
                type: existingLead.status === "Converted" ? "converted" : "status",
                message:
                    existingLead.status === "Converted"
                        ? `Lead converted to customer! Value: ₹${existingLead.value.toLocaleString("en-IN")}. Ready for installation.`
                        : `Status changed from ${oldStatus} to ${existingLead.status}`,
                user: req.user?.email || "Current User"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.LEAD_UPDATED_SUCCESS,
            data: formatLead(existingLead.toObject())
        });
    } catch (error) {
        console.error("Update Lead Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map(
                (e) => e.message
            );
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Update Lead Status
export const updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, statusReason } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid lead id"
            });
        }

        if (!status) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Status is required"
            });
        }

        const validStatuses = [
            "New",
            "Contacted",
            "Interested",
            "Converted",
            "Lost"
        ];
        if (!validStatuses.includes(status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
            });
        }

        const lead = await Lead.findById(id);

        if (!lead) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.LEAD_NOT_FOUND
            });
        }

        const oldStatus = lead.status;

        if (oldStatus === status) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Lead is already in ${status} status`
            });
        }

        // Validate status transition
        const transitionError = validateStatusTransition("leads", oldStatus, status);
        if (transitionError) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: transitionError
            });
        }

        // When converting, ensure a linked customer exists (creates or links one).
        // ensureCustomerForLead sets lead.customerId in memory when linking/creating.
        let conversion = null;
        if (status === "Converted" && !lead.customerId) {
            conversion = await ensureCustomerForLead(lead);
        }

        lead.status = status;
        if (statusReason) lead.statusReason = statusReason;
        await lead.save();

        // Track status change activity
        await Activity.create({
            leadId: lead._id,
            type: status === "Converted" ? "converted" : "status",
            message:
                status === "Converted"
                    ? `Lead converted to customer${conversion ? ` ${conversion.customerId}` : ""}! Value: ₹${(lead.value || 0).toLocaleString("en-IN")}. Ready for installation.`
                    : `Status changed from ${oldStatus} to ${status}${statusReason ? ` — Reason: ${statusReason}` : ""}`,
            user: req.user?.email || "Current User"
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message:
                status === "Converted"
                    ? `Lead ${lead.name} converted to customer successfully!`
                    : `Lead status changed to "${status}".`,
            data: {
                ...formatLead(lead.toObject()),
                customer: conversion && conversion.customer
                    ? formatCustomer(
                          conversion.customer.toObject
                              ? conversion.customer.toObject()
                              : conversion.customer
                      )
                    : null
            }
        });
    } catch (error) {
        console.error("Update Lead Status Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Delete Lead
export const deleteLead = async (req, res) => {
    try {
        const { id } = req.params;
        const force = req.query.force === "true";

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid lead id"
            });
        }

        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.LEAD_NOT_FOUND
            });
        }

        // [FLOW-06] Check for linked records before deletion
        if (!force) {
            const check = await checkDependencies("lead", {
                leadId: lead.leadId || id,
                customerId: lead.customerId,
            });
            if (!check.canDelete) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: check.message,
                    dependencies: check.dependencies,
                });
            }
        }

        await Lead.findByIdAndDelete(id);

        // Unlink the associated customer so it doesn't reference a deleted lead
        if (lead.customerId) {
            await Customer.updateOne(
                { customerId: lead.customerId },
                { $unset: { leadId: "" } }
            );
        }

        // Delete associated activities
        await Activity.deleteMany({ leadId: id });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.LEAD_DELETED_SUCCESS
        });
    } catch (error) {
        console.error("Delete Lead Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Lead Analytics
export const getLeadAnalytics = async (req, res) => {
    try {
        // Sales people only see analytics for their OWN leads.
        const leadFilter = {};
        if (req.user?.role === "sales_manager") {
            if (req.user?.name) leadFilter.assigned = req.user.name;
            else leadFilter._id = { $exists: false };
        }
        const leads = await Lead.find(leadFilter).lean();
        const total = leads.length;
        const totalValue = leads.reduce((sum, l) => sum + (l.value || 0), 0);

        const statusMap = {};
        const sourceMap = {};
        leads.forEach((l) => {
            if (l.status) statusMap[l.status] = (statusMap[l.status] || 0) + 1;
            if (l.source) sourceMap[l.source] = (sourceMap[l.source] || 0) + 1;
        });

        const conversionRate =
            total > 0
                ? ((statusMap["Converted"] || 0) / total * 100).toFixed(1)
                : "0";

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                totalLeads: total,
                newLeads: statusMap["New"] || 0,
                converted: statusMap["Converted"] || 0,
                conversionRate: parseFloat(conversionRate),
                totalPipelineValue: totalValue,
                statusCounts: statusMap,
                sourceCounts: sourceMap
            }
        });
    } catch (error) {
        console.error("Get Lead Analytics Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Lead Activities
export const getLeadActivities = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid lead id"
            });
        }

        const activities = await Activity.find({ leadId: id })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const formatted = activities.map((act) => ({
            id: act._id,
            leadId: act.leadId,
            type: act.type,
            message: act.message,
            timestamp: act.createdAt
                ? new Date(act.createdAt).toLocaleString()
                : "",
            user: act.user
        }));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formatted
        });
    } catch (error) {
        console.error("Get Lead Activities Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Overdue Follow-ups
export const getOverdueFollowUps = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdueLeads = await Lead.find({
            followUp: { $lte: today },
            status: { $nin: ["Lost", "Converted"] }
        })
            .sort({ followUp: 1 })
            .lean();

        const formatted = overdueLeads.map((lead) => formatLead(lead));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            count: formatted.length,
            data: formatted
        });
    } catch (error) {
        console.error("Get Overdue Follow-ups Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
