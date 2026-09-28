import ServiceVisit from "../models/serviceVisit.model.js";
import MaintenanceTicket from "../models/maintenanceTicket.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { applyCustomerScope } from "../utils/customerScope.js";

// Generate the next sequential human-friendly ID like VS-701, VS-702, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateVisitId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every visit ID in the collection.
    const lastDoc = await ServiceVisit.findOne({ visitId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("visitId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.visitId) {
        const m = lastDoc.visitId.match(/^VS-(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `VS-${String(max + 1).padStart(3, "0")}`;
};

export const createServiceVisit = async (req, res) => {
    try {
        const data = { ...req.body };
        // Retry on duplicate-key so two simultaneous creates don't collide on the same visit ID
        let visit;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.visitId = await generateVisitId();
                visit = await ServiceVisit.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Visit scheduled successfully", data: visit });
    } catch (error) {
        console.error("Create Service Visit Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllServiceVisits = async (req, res) => {
    try {
        const { search, status, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        // Technicians see visits they performed or visits for customers assigned to them
        if (req.user?.role === "technician" && req.user?.name) {
            const ticketCustomers = await MaintenanceTicket.distinct("customer", { assignedTech: req.user.name });
            const ownVisitCustomers = await ServiceVisit.distinct("customer", { technician: req.user.name });
            const allCustomers = [...new Set([...ticketCustomers, ...ownVisitCustomers])];
            if (allCustomers.length > 0) {
                filter.customer = { $in: allCustomers };
            } else {
                filter.technician = req.user.name;
            }
        }
        if (status && status !== "all") filter.status = status;
        if (search) {
            filter.$or = [
                { customer: { $regex: search, $options: "i" } },
                { technician: { $regex: search, $options: "i" } }
            ];
        }
        const sortObj = {};
        if (sortField) sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        else sortObj.createdAt = -1;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await ServiceVisit.countDocuments(filter);
        const visits = await ServiceVisit.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit));
        return res.status(HTTP_STATUS.OK).json({ success: true, data: visits, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error("Get All Service Visits Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getServiceVisitById = async (req, res) => {
    try {
        const visit = await ServiceVisit.findById(req.params.id);
        if (!visit) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Visit not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, data: visit });
    } catch (error) {
        console.error("Get Service Visit By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateServiceVisit = async (req, res) => {
    try {
        const visit = await ServiceVisit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!visit) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Visit not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Visit updated successfully", data: visit });
    } catch (error) {
        console.error("Update Service Visit Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteServiceVisit = async (req, res) => {
    try {
        const visit = await ServiceVisit.findByIdAndDelete(req.params.id);
        if (!visit) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Visit not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Visit deleted successfully" });
    } catch (error) {
        console.error("Delete Service Visit Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
