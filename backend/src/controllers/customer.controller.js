import mongoose from "mongoose";
import Customer from "../models/customer.model.js";
import Lead from "../models/lead.model.js";
import FollowUp from "../models/followUp.model.js";
import AMC from "../models/amc.model.js";
import Invoice from "../models/invoice.model.js";
import Quotation from "../models/quotation.model.js";
import ProjectApproval from "../models/projectApproval.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import SiteSurvey from "../models/siteSurvey.model.js";
import SolarDesign from "../models/solarDesign.model.js";
import Installation from "../models/installation.model.js";
import Testing from "../models/testing.model.js";
import CommissioningAndHandover from "../models/commissioningAndHandover.model.js";
import Subsidy from "../models/subsidy.model.js";
import { computeChanges, logActivity } from "../utils/activityLogger.js";
import ServiceVisit from "../models/serviceVisit.model.js";
import MaintenanceTicket from "../models/maintenanceTicket.model.js";
import TicketSupport from "../models/ticketSupport.model.js";
import Warranty from "../models/warranty.model.js";
import WarrantyClaim from "../models/warrantyClaim.model.js";
import TaskAssignment from "../models/taskAssignment.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { formatCustomer, getMaxCustomerNumber } from "../utils/customerHelpers.js";
import { getMaxLeadNumber } from "../utils/leadHelpers.js";
import { getSalesScope, isDocOwnedBySales, mergeOwnershipFilter } from "../utils/ownershipScope.js";
import { validateStatusTransition } from "../utils/statusTransitions.js";
import Technician from "../models/technician.model.js";
import { checkDependencies } from "../utils/dependencies.js";

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

// Modules that reference a customer by its CUS-XXX id. Deleting a customer that
// is still referenced by any of these would leave orphaned records behind.
const CUSTOMER_REFERENCE_MODELS = [
    { model: AMC, label: "AMC" },
    { model: Invoice, label: "invoice" },
    { model: Quotation, label: "quotation" },
    { model: ProjectApproval, label: "project approval" },
    { model: SiteSurvey, label: "site survey" },
    { model: Subsidy, label: "subsidy" },
    { model: Lead, label: "linked lead" }
];

/**
 * Return the label of the first module still referencing this customer by its
 * CUS-XXX id, or null when no references exist.
 */
const findCustomerReference = async (customer) => {
    if (!customer?.customerId) return null;
    for (const { model, label } of CUSTOMER_REFERENCE_MODELS) {
        if (await model.exists({ customerId: customer.customerId })) {
            return label;
        }
    }
    return null;
};

//#region Get All Customers
export const getAllCustomers = async (req, res) => {
    try {
        const {
            search,
            status,
            type,
            sortField,
            sortDir,
            page = 1,
            limit = 10,
            startDate,
            endDate
        } = req.query;

        // Build filter query
        const filter = {};

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

        if (type && type !== "All") {
            filter.type = type;
        }

        // Search across multiple fields
        if (search) {
            const searchRegex = new RegExp(search, "i");
            filter.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { leadId: searchRegex }
            ];
        }

        // Technicians only see customers assigned to them.
        // Look up the technician record by email to get their technicianId,
        // then match customers by technicianId OR technicianName.
        if (req.user?.role === "technician") {
            const techEmail = (req.user?.email || "").trim().toLowerCase();
            const techName = req.user?.name || "";
            let matchedTechId = "";
            if (techEmail) {
                const techRecord = await Technician.findOne({ email: techEmail }).select("technicianId name").lean();
                if (techRecord) matchedTechId = techRecord.technicianId || "";
            }
            const techClauses = [];
            if (techEmail) techClauses.push({ technicianEmail: techEmail });
            if (matchedTechId) techClauses.push({ technicianId: matchedTechId });
            if (techName) techClauses.push({ technicianName: techName });

            if (techClauses.length) {
                const techScope = { $or: techClauses };
                if (filter.$or) {
                    // Combine search $or with technician scope using $and
                    const searchOr = { $or: filter.$or };
                    delete filter.$or;
                    filter.$and = [techScope, searchOr];
                } else {
                    Object.assign(filter, techScope);
                }
            } else {
                filter._id = { $exists: false };
            }
        }
        // Sales people only ever see the customers linked to their own leads.
        else if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (scope) {
                const clauses = [];
                if (scope.customerIds.length) clauses.push({ customerId: { $in: scope.customerIds } });
                if (scope.emails.length) clauses.push({ email: { $in: scope.emails } });
                mergeOwnershipFilter(filter, clauses);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        }

        // Build sort object (only whitelisted fields, never user-provided keys)
        // Default to createdAt descending so the newest customers appear on top.
        let sort = { createdAt: -1 };
        const sortableFields = ["createdAt", "customerId", "name", "email", "type", "status", "totalProjects"];
        if (sortField && sortableFields.includes(sortField)) {
            sort = { [sortField]: sortDir === "desc" ? -1 : 1 };
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;

        // Execute query
        const [customers, total] = await Promise.all([
            Customer.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Customer.countDocuments(filter)
        ]);

        // Transform customers to include formatted customerId
        const formattedCustomers = customers.map((customer) => formatCustomer(customer));

        // Attach a hasSurvey flag so the front-end can disable the "Create
        // Site Survey" button when a survey already exists for the customer.
        const leadIds = formattedCustomers
            .map((c) => c.leadId)
            .filter(Boolean);
        const surveyLeadIds = leadIds.length
            ? await SiteSurvey.distinct("leadId", { leadId: { $in: leadIds } })
            : [];
        const surveyLeadSet = new Set(surveyLeadIds);
        formattedCustomers.forEach((c) => {
            c.hasSurvey = !!(c.leadId && surveyLeadSet.has(c.leadId));
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formattedCustomers,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All Customers Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Customer By ID
export const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid customer id"
            });
        }

        const customer = await Customer.findById(id).lean();

        if (!customer) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.CUSTOMER_NOT_FOUND
            });
        }

        // Sales people may only view customers linked to their own leads.
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (!isDocOwnedBySales(customer, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this customer does not belong to your account"
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formatCustomer(customer)
        });
    } catch (error) {
        console.error("Get Customer By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getCustomerProfile = async (req, res) => {
    try {
        const { id } = req.params;

        let customer = null;
        if (mongoose.isValidObjectId(id)) {
            customer = await Customer.findById(id).lean();
        }
        if (!customer) {
            customer = await Customer.findOne({ customerId: id }).lean();
        }

        if (!customer) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.CUSTOMER_NOT_FOUND
            });
        }

        // Sales people may only view customers linked to their own leads.
        if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (!isDocOwnedBySales(customer, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this customer does not belong to your account"
                });
            }
        }

        const cusId = customer.customerId || "";
        const leadId = customer.leadId || "";

        // Match records linked by the customer's CUS-XXX id and/or its lead id.
        // Modules store one, the other, or both, so OR the non-empty clauses.
        const byCusId = cusId ? { customerId: cusId } : null;
        const byLeadId = leadId ? { leadId } : null;
        const linked = (clauses) => {
            const valid = clauses.filter(Boolean);
            return valid.length ? { $or: valid } : { _id: { $exists: false } };
        };

        const [
            lead,
            quotations,
            siteSurveys,
            solarDesigns,
            projectApprovals,
            projectProgress,
            installations,
            testingRecords,
            commissioningRecords,
            amcs,
            invoices,
            subsidies,
            serviceVisits,
            maintenanceTickets,
            tickets,
            warranties,
            warrantyClaims,
            taskAssignments,
            followUps
        ] = await Promise.all([
            leadId ? Lead.findOne({ leadId }).lean() : Promise.resolve(null),
            Quotation.find(linked([byCusId, byLeadId])).sort({ createdAt: -1 }).lean(),
            SiteSurvey.find(linked([byCusId, byLeadId])).sort({ createdAt: -1 }).lean(),
            SolarDesign.find(linked([byLeadId])).sort({ createdAt: -1 }).lean(),
            ProjectApproval.find(linked([byCusId, byLeadId])).sort({ createdAt: -1 }).lean(),
            ProjectProgress.find(linked([byLeadId])).sort({ createdAt: -1 }).lean(),
            Installation.find(linked([byLeadId])).sort({ createdAt: -1 }).lean(),
            Testing.find(linked([byLeadId])).sort({ createdAt: -1 }).lean(),
            CommissioningAndHandover.find(linked([byLeadId])).sort({ createdAt: -1 }).lean(),
            AMC.find(linked([byCusId])).sort({ createdAt: -1 }).lean(),
            Invoice.find(linked([byCusId])).sort({ createdAt: -1 }).lean(),
            Subsidy.find(linked([byCusId])).sort({ createdAt: -1 }).lean(),
            ServiceVisit.find({ customer: customer.name }).sort({ date: -1 }).lean(),
            MaintenanceTicket.find({ customer: customer.name }).sort({ createdDate: -1 }).lean(),
            TicketSupport.find({ customer: customer.name }).sort({ createdAt: -1 }).lean(),
            Warranty.find({ customer: customer.name }).sort({ installed: -1 }).lean(),
            WarrantyClaim.find({ customer: customer.name }).sort({ submitted: -1 }).lean(),
            TaskAssignment.find(linked([byLeadId, { customerName: customer.name }])).sort({ assignedDate: -1 }).lean(),
            FollowUp.find(linked([byCusId, byLeadId])).sort({ scheduledDate: -1 }).lean()
        ]);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                customer: formatCustomer(customer),
                lead,
                quotations,
                siteSurveys,
                solarDesigns,
                projectApprovals,
                projectProgress,
                installations,
                testingRecords,
                commissioningRecords,
                amcs,
                invoices,
                subsidies,
                serviceVisits,
                maintenanceTickets,
                tickets,
                warranties,
                warrantyClaims,
                taskAssignments,
                followUps
            }
        });
    } catch (error) {
        console.error("Get Customer Profile Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Create Customer
export const createCustomer = async (req, res) => {
    try {
        const customerData = { ...req.body };
        // System-managed fields — never allow clients to set them
        delete customerData._id;
        delete customerData.__v;
        delete customerData.createdAt;
        delete customerData.updatedAt;
        delete customerData.customerId;
        delete customerData.leadId;

        // Reject duplicates: a customer with the same email or phone must not
        // be created twice (emails are stored lowercased by the schema).
        const dupEmail = String(customerData.email || "").trim().toLowerCase();
        const dupPhone = String(customerData.phone || "").trim();
        if (dupEmail || dupPhone) {
            const existing = await Customer.findOne({
                $or: [
                    ...(dupEmail ? [{ email: dupEmail }] : []),
                    ...(dupPhone ? [{ phone: dupPhone }] : [])
                ]
            }).lean();
            if (existing) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    message: "A customer with this email or phone already exists"
                });
            }
        }

        // A manually-added customer always gets a linked lead automatically so it
        // appears in lead-driven dropdowns. The lead mirrors the customer data and
        // starts as "New"; it only becomes visible to site survey once it is
        // converted (status "Converted") from the Lead module.
        let customer;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                customer = await Customer.create({
                    ...customerData,
                    leadId: await generateLeadId(),
                    customerId: await generateCustomerId()
                });

                const formatted = formatCustomer(customer.toObject());

                try {
                    await Lead.create({
                        leadId: customer.leadId,
                        name: customer.name,
                        email: customer.email,
                        phone: customer.phone,
                        source: "Walk-in",
                        status: "New",
                        value: 0,
                        address: customer.address,
                        customerId: formatted.customerId,
                        notes: "Automatically created from manually added customer"
                    });
                } catch (leadError) {
                    // Roll back the customer so we never leave an unlinked record
                    await Customer.findByIdAndDelete(customer._id).catch(() => {});
                    throw leadError;
                }
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) {
                    customer = null;
                    continue; // re-roll the lead ID
                }
                throw error;
            }
        }

        const initialChanges = Object.entries(customer.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));

        await logActivity({
            req,
            module: "customers",
            action: "created",
            recordId: customer._id,
            recordLabel: customer.customerId || customer.name,
            summary: `Customer ${customer.name} created`,
            changes: initialChanges,
        });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: MESSAGE.CUSTOMER_CREATED_SUCCESS,
            data: formatCustomer(customer.toObject())
        });
    } catch (error) {
        console.error("Create Customer Error:", error);

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

//#region Update Customer
export const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid customer id"
            });
        }

        const oldCustomer = await Customer.findById(id);
        if (!oldCustomer) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.CUSTOMER_NOT_FOUND
            });
        }

        // System-managed fields — never allow clients to overwrite them
        delete updateData._id;
        delete updateData.__v;
        delete updateData.createdAt;
        delete updateData.updatedAt;
        delete updateData.customerId;
        delete updateData.leadId;

        const changes = computeChanges(oldCustomer, updateData);

        const customer = await Customer.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        await logActivity({
            req,
            module: "customers",
            action: "updated",
            recordId: customer._id,
            recordLabel: customer.customerId || customer.name,
            summary: "Customer updated successfully.",
            changes,
        });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.CUSTOMER_UPDATED_SUCCESS,
            data: formatCustomer(customer.toObject())
        });
    } catch (error) {
        console.error("Update Customer Error:", error);

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

//#region Update Customer Status
export const updateCustomerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid customer id"
            });
        }

        if (!status) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Status is required"
            });
        }

        const validStatuses = ["Active", "Inactive"];
        if (!validStatuses.includes(status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.CUSTOMER_NOT_FOUND
            });
        }

        // Idempotent: setting the same status again is a no-op, not a success
        if (customer.status === status) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Customer is already in ${status} status`
            });
        }

        // Validate status transition
        const transitionError = validateStatusTransition("customers", customer.status, status);
        if (transitionError) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: transitionError
            });
        }

        const oldStatus = customer.status;
        customer.status = status;
        await customer.save();

        const changes = [{ field: "status", oldValue: oldStatus, newValue: status }];
        await logActivity({
            req,
            module: "customers",
            action: "status_change",
            recordId: customer._id,
            recordLabel: customer.customerId || customer.name,
            summary: `Customer status changed from ${oldStatus} to ${status}`,
            changes,
        });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Customer status changed to "${status}".`,
            data: formatCustomer(customer.toObject())
        });
    } catch (error) {
        console.error("Update Customer Status Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Delete Customer
export const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const force = req.query.force === "true";

        if (!mongoose.isValidObjectId(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid customer id"
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.CUSTOMER_NOT_FOUND
            });
        }

        // [FLOW-06] Comprehensive dependency check before deletion
        if (!force) {
            const check = await checkDependencies("customer", {
                customerId: customer.customerId,
                name: customer.name,
                email: customer.email,
            });
            if (!check.canDelete) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: check.message,
                    dependencies: check.dependencies,
                });
            }
        }

        await Customer.findByIdAndDelete(id);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.CUSTOMER_DELETED_SUCCESS
        });
    } catch (error) {
        console.error("Delete Customer Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Customer Analytics
export const getCustomerAnalytics = async (req, res) => {
    try {
        // Role-based scoping: technicians, sales, and customers each see only their own.
        let customerFilter = {};
        if (req.user?.role === "technician") {
            const techEmail = (req.user?.email || "").trim().toLowerCase();
            const techName = req.user?.name || "";
            let matchedTechId = "";
            if (techEmail) {
                const techRecord = await Technician.findOne({ email: techEmail }).select("technicianId name").lean();
                if (techRecord) matchedTechId = techRecord.technicianId || "";
            }
            const techClauses = [];
            if (techEmail) techClauses.push({ technicianEmail: techEmail });
            if (matchedTechId) techClauses.push({ technicianId: matchedTechId });
            if (techName) techClauses.push({ technicianName: techName });
            if (techClauses.length) {
                mergeOwnershipFilter(customerFilter, techClauses);
            } else {
                mergeOwnershipFilter(customerFilter, []);
            }
        } else if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (scope) {
                const clauses = [];
                if (scope.customerIds.length) clauses.push({ customerId: { $in: scope.customerIds } });
                if (scope.emails.length) clauses.push({ email: { $in: scope.emails } });
                mergeOwnershipFilter(customerFilter, clauses);
            } else {
                mergeOwnershipFilter(customerFilter, []);
            }
        }
        const customers = await Customer.find(customerFilter).lean();
        const total = customers.length;

        // Status counts
        const activeCustomers = customers.filter((c) => c.status === "Active").length;
        const inactiveCustomers = customers.filter((c) => c.status === "Inactive").length;

        // Type distribution
        const residentialCount = customers.filter((c) => c.type === "Residential").length;
        const commercialCount = customers.filter((c) => c.type === "Commercial").length;

        // Total projects sum
        const totalProjectsSum = customers.reduce(
            (sum, c) => sum + (c.totalProjects || 0),
            0
        );

        // Active percentage
        const activePercentage =
            total > 0
                ? ((activeCustomers / total) * 100).toFixed(1)
                : "0";

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                totalCustomers: total,
                activeCustomers,
                inactiveCustomers,
                residentialCount,
                commercialCount,
                totalProjects: totalProjectsSum,
                activePercentage: parseFloat(activePercentage)
            }
        });
    } catch (error) {
        console.error("Get Customer Analytics Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
