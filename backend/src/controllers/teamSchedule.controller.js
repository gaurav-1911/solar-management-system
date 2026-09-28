import TeamSchedule from "../models/teamSchedule.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";

export const createTeamSchedule = async (req, res) => {
    try {
        const schedule = await TeamSchedule.create(req.body);

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Schedule created successfully",
            data: schedule
        });
    } catch (error) {
        console.error("Create Team Schedule Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllTeamSchedules = async (req, res) => {
    try {
        const {
            search,
            status,
            shift,
            date,
            startDate,
            endDate,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};

        if (status && status !== "All") {
            filter.status = status;
        }
        if (shift && shift !== "All") {
            filter.shift = shift;
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
        if (search) {
            filter.$or = [
                { technicianName: { $regex: search, $options: "i" } },
                { technicianId: { $regex: search, $options: "i" } },
                { jobAssignment: { $regex: search, $options: "i" } },
                { siteLocation: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await TeamSchedule.countDocuments(filter);
        const schedules = await TeamSchedule.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: schedules,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Team Schedules Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getTeamScheduleById = async (req, res) => {
    try {
        const schedule = await TeamSchedule.findById(req.params.id);

        if (!schedule) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Schedule not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: schedule
        });
    } catch (error) {
        console.error("Get Team Schedule By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateTeamSchedule = async (req, res) => {
    try {
        const schedule = await TeamSchedule.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!schedule) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Schedule not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Schedule updated successfully",
            data: schedule
        });
    } catch (error) {
        console.error("Update Team Schedule Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteTeamSchedule = async (req, res) => {
    try {
        const schedule = await TeamSchedule.findByIdAndDelete(req.params.id);

        if (!schedule) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Schedule not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Schedule deleted successfully"
        });
    } catch (error) {
        console.error("Delete Team Schedule Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
