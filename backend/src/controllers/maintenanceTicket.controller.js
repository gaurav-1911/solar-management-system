import MaintenanceTicket from "../models/maintenanceTicket.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { isDocOwnedByTechnician } from "../utils/ownershipScope.js";
import { validateStatusTransition } from "../utils/statusTransitions.js";
import { applyCustomerScope } from "../utils/customerScope.js";

// Human-friendly ID prefixes per ticket type (MT-2201 / SR-2202 / CM-2203 style)
const TICKET_PREFIXES = { Maintenance: "MT", Service: "SR", Complaint: "CM" };

// Generate the next sequential human-friendly ID like MT-2201, SR-2202, ...
// Uses the numeric suffix of the highest existing ID per prefix so deletions never reuse a number.
const generateTicketId = async (type) => {
    const prefix = TICKET_PREFIXES[type] || "TKT";
    // Ticket IDs are assigned monotonically per prefix at creation, so the
    // newest ticket with this prefix carries the highest suffix — one indexed
    // lookup instead of scanning every ticket ID in the collection.
    const lastDoc = await MaintenanceTicket.findOne({
        ticketId: { $exists: true, $ne: null, $regex: new RegExp(`^${prefix}-`) }
    })
        .sort({ _id: -1 })
        .select("ticketId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.ticketId) {
        const m = lastDoc.ticketId.match(new RegExp(`^${prefix}-(\\d+)$`));
        if (m) max = parseInt(m[1], 10);
    }
    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
};

export const createMaintenanceTicket = async (req, res) => {
    try {
        const data = { ...req.body };

        // Auto-assign technician: if no technician is specified (Unassigned or missing),
        // find the technician who was previously assigned to this customer.
        if (!data.assignedTech || data.assignedTech === "Unassigned") {
            if (data.customer) {
                const previousTicket = await MaintenanceTicket.findOne({
                    customer: data.customer,
                    assignedTech: { $exists: true, $ne: null, $ne: "Unassigned" }
                }).sort({ createdAt: -1 }).select("assignedTech").lean();
                if (previousTicket && previousTicket.assignedTech) {
                    data.assignedTech = previousTicket.assignedTech;
                }
            }
        }

        // Retry on duplicate-key so two simultaneous creates don't collide on the same ticket ID
        let ticket;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.ticketId = await generateTicketId(data.type);
                ticket = await MaintenanceTicket.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Ticket created successfully", data: ticket });
    } catch (error) {
        console.error("Create Maintenance Ticket Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllMaintenanceTickets = async (req, res) => {
    try {
        const { search, status, type, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (status && status !== "all") filter.status = status;
        if (type && type !== "all") filter.type = type;
        // Technicians see all tickets for customers they are assigned to
        // (from any ticket, not just direct assignment).
        if (req.user?.role === "technician") {
            if (req.user?.name) {
                // Find all distinct customers the technician is assigned to
                const assignedCustomers = await MaintenanceTicket.distinct("customer", { assignedTech: req.user.name });
                if (assignedCustomers.length > 0) {
                    filter.customer = { $in: assignedCustomers };
                } else {
                    // No customers assigned yet — also show tickets directly assigned to them
                    filter.$or = [
                        { assignedTech: req.user.name },
                        { customer: { $in: [] } },
                    ];
                }
            } else {
                filter._id = { $exists: false };
            }
        }
        if (search) {
            filter.$or = [
                { customer: { $regex: search, $options: "i" } },
                { system: { $regex: search, $options: "i" } }
            ];
        }
        const sortObj = {};
        if (sortField) sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        else sortObj.createdAt = -1;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await MaintenanceTicket.countDocuments(filter);
        const tickets = await MaintenanceTicket.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit));
        return res.status(HTTP_STATUS.OK).json({ success: true, data: tickets, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error("Get All Maintenance Tickets Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getMaintenanceTicketById = async (req, res) => {
    try {
        const ticket = await MaintenanceTicket.findById(req.params.id);
        if (!ticket) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Ticket not found" });
        // Technicians can view tickets assigned to them OR tickets belonging to their customers.
        if (req.user?.role === "technician") {
            const assignedCustomers = await MaintenanceTicket.distinct("customer", { assignedTech: req.user.name });
            const isAssigned = ticket.assignedTech === req.user.name;
            const isCustomerTicket = assignedCustomers.includes(ticket.customer);
            if (!isAssigned && !isCustomerTicket) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this maintenance ticket does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: ticket });
    } catch (error) {
        console.error("Get Maintenance Ticket By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateMaintenanceTicket = async (req, res) => {
    try {
        const existing = await MaintenanceTicket.findById(req.params.id);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Ticket not found" });

        // Validate status transition if status is being changed
        if (req.body.status && req.body.status !== existing.status) {
            const transitionError = validateStatusTransition("maintenance", existing.status, req.body.status);
            if (transitionError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: transitionError
                });
            }
        }

        const ticket = await MaintenanceTicket.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Ticket updated successfully", data: ticket });
    } catch (error) {
        console.error("Update Maintenance Ticket Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteMaintenanceTicket = async (req, res) => {
    try {
        const ticket = await MaintenanceTicket.findByIdAndDelete(req.params.id);
        if (!ticket) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Ticket not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Ticket deleted successfully" });
    } catch (error) {
        console.error("Delete Maintenance Ticket Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
