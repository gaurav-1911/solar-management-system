import Attendance from "../models/attendance.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { isDocOwnedByTechnician } from "../utils/ownershipScope.js";
import { applyCustomerScope } from "../utils/customerScope.js";

export const createAttendance = async (req, res) => {
    try {
        const { technicianId, technicianName, date } = req.body;

        // A technician can only mark attendance once per day.
        // Dates are stored as UTC midnight (Mongoose casts "YYYY-MM-DD" to UTC), so
        // day boundaries must be computed in UTC to match the stored values.
        if (technicianId && date) {
            const dayStart = new Date(`${date}T00:00:00.000Z`);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

            const existing = await Attendance.findOne({
                technicianId,
                date: { $gte: dayStart, $lt: dayEnd }
            });

            if (existing) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    message: `Attendance already marked for ${existing.technicianName || technicianName || technicianId} on ${dayStart.toISOString().split("T")[0]}`
                });
            }
        }

        const attendance = await Attendance.create(req.body);

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Attendance record created successfully",
            data: attendance
        });
    } catch (error) {
        console.error("Create Attendance Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllAttendance = async (req, res) => {
    try {
        const {
            search,
            status,
            date,
            startDate,
            endDate,
            technicianName,
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
        if (date) {
            filter.date = new Date(date);
        } else if (startDate || endDate) {
            filter.date = {};
            if (startDate) {
                filter.date.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.date.$lte = new Date(endDate);
            }
        }
        // Exact technician-name filter — used so a technician role only ever
        // sees (and stats) their own attendance records.
        if (technicianName && technicianName !== "All") {
            filter.technicianName = technicianName;
        }

        if (req.user?.role === "technician") {
            if (req.user?.name) filter.technicianName = req.user.name;
            else filter._id = { $exists: false };
        }
        if (search) {
            filter.$or = [
                { technicianName: { $regex: search, $options: "i" } },
                { technicianId: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Attendance.countDocuments(filter);
        const records = await Attendance.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: records,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Attendance Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAttendanceById = async (req, res) => {
    try {
        const record = await Attendance.findById(req.params.id);

        if (!record) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Attendance record not found"
            });
        }

        if (req.user?.role === "technician") {
            if (!isDocOwnedByTechnician(record, req.user?.name)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this attendance record does not belong to your account"
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: record
        });
    } catch (error) {
        console.error("Get Attendance By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateAttendance = async (req, res) => {
    try {
        const existingRecord = await Attendance.findById(req.params.id);

        if (!existingRecord) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Attendance record not found"
            });
        }

        const technicianId = req.body.technicianId || existingRecord.technicianId;
        const date = req.body.date || existingRecord.date;

        // A technician can only have one attendance record per day — make sure the
        // edit doesn't collide with another record for the same technician + date.
        // Day boundaries use UTC to match the stored UTC-midnight dates.
        if (technicianId && date) {
            const dayStart = date instanceof Date
                ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
                : new Date(`${date}T00:00:00.000Z`);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

            const duplicate = await Attendance.findOne({
                _id: { $ne: req.params.id },
                technicianId,
                date: { $gte: dayStart, $lt: dayEnd }
            });

            if (duplicate) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    message: `Attendance already marked for ${duplicate.technicianName || technicianId} on ${dayStart.toISOString().split("T")[0]}`
                });
            }
        }

        const record = await Attendance.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Attendance record updated successfully",
            data: record
        });
    } catch (error) {
        console.error("Update Attendance Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteAttendance = async (req, res) => {
    try {
        const record = await Attendance.findByIdAndDelete(req.params.id);

        if (!record) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Attendance record not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Attendance record deleted successfully"
        });
    } catch (error) {
        console.error("Delete Attendance Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
