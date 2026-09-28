import TicketSupport from "../models/ticketSupport.model.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer, isDocOwnedByTechnician } from "../utils/ownershipScope.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { validateStatusTransition } from "../utils/statusTransitions.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

export const createTicketSupport = async (req, res) => {
    try {
        const ticket = await TicketSupport.create(req.body);
        logActivity({
            module: "tickets",
            action: "created",
            recordId: ticket.ticketId || String(ticket._id),
            recordLabel: ticket.subject || ticket.customer,
            req,
            changes: computeChanges({}, ticket.toObject ? ticket.toObject() : ticket),
            summary: `Support ticket created: ${ticket.subject || ticket.customer}`
        });
        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Ticket created successfully", data: ticket });
    } catch (error) {
        console.error("Create Ticket Support Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllTicketSupport = async (req, res) => {
    try {
        const { search, status, priority, category, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (status && status !== "all") filter.status = status;
        if (priority && priority !== "all") filter.priority = priority;
        if (category && category !== "all") filter.category = category;
        if (search) {
            filter.$or = [
                { subject: { $regex: search, $options: "i" } },
                { customer: { $regex: search, $options: "i" } }
            ];
        }
        // Data scoping: customers see only their own tickets (by customer name
        // or the email they raised them with); technicians only the tickets
        // assigned to them. Admins/staff keep seeing everything.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope) {
                const or = [];
                if (scope.names.length) or.push({ customer: { $in: scope.names } });
                if (scope.email) or.push({ email: scope.email });
                mergeOwnershipFilter(filter, or);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        } else if (req.user?.role === "technician") {
            if (req.user?.name) {
                // Technicians see tickets assigned to them
                filter.$or = [
                    { assignedAgent: req.user.name }
                ];
            } else {
                filter._id = { $exists: false };
            }
        }
        const sortObj = {};
        if (sortField) sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        else sortObj.createdAt = -1;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await TicketSupport.countDocuments(filter);
        const tickets = await TicketSupport.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).lean();
        return res.status(HTTP_STATUS.OK).json({ success: true, data: tickets, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error("Get All Ticket Support Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getTicketSupportById = async (req, res) => {
    try {
        const ticket = await TicketSupport.findById(req.params.id).lean();
        if (!ticket) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Ticket not found" });
        // Customers may only view their own tickets; technicians only the
        // tickets assigned to them.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(ticket, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this ticket does not belong to your account" });
            }
        } else if (req.user?.role === "technician") {
            if (!isDocOwnedByTechnician(ticket, req.user?.name)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this ticket is not assigned to you" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: ticket });
    } catch (error) {
        console.error("Get Ticket Support By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateTicketSupport = async (req, res) => {
    try {
        const existing = await TicketSupport.findById(req.params.id);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Ticket not found" });

        // Validate status transition if status is being changed
        if (req.body.status && req.body.status !== existing.status) {
            const transitionError = validateStatusTransition("tickets", existing.status, req.body.status);
            if (transitionError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: transitionError
                });
            }
        }

        const ticket = await TicketSupport.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Ticket updated successfully", data: ticket });
    } catch (error) {
        console.error("Update Ticket Support Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteTicketSupport = async (req, res) => {
    try {
        const ticket = await TicketSupport.findByIdAndDelete(req.params.id);
        if (!ticket) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Ticket not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Ticket deleted successfully" });
    } catch (error) {
        console.error("Delete Ticket Support Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
