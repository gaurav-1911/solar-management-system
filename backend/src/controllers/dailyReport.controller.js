import DailyReport from "../models/dailyReport.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { applyCustomerScope } from "../utils/customerScope.js";

// Generate the next sequential human-friendly ID like RPT-001, RPT-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateReportId = async () => {
    const lastDoc = await DailyReport.findOne({ reportId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("reportId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.reportId) {
        const m = lastDoc.reportId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `RPT-${String(max + 1).padStart(3, "0")}`;
};

export const createDailyReport = async (req, res) => {
    try {
        const data = { ...req.body };
        // Retry on duplicate-key so two simultaneous creates don't collide on the same RPT-XXX
        let report;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.reportId = await generateReportId();
                report = await DailyReport.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Daily report created successfully",
            data: report
        });
    } catch (error) {
        console.error("Create Daily Report Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllDailyReports = async (req, res) => {
    try {
        const {
            search,
            technicianName,
            date,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};
        applyCustomerScope(filter, req);

        if (technicianName && technicianName !== "All") {
            filter.technicianName = technicianName;
        }
        if (date) {
            filter.date = new Date(date);
        }
        if (search) {
            filter.$or = [
                { reportId: { $regex: search, $options: "i" } },
                { technicianName: { $regex: search, $options: "i" } },
                { assignedJob: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.date = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await DailyReport.countDocuments(filter);
        const reports = await DailyReport.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: reports,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Daily Reports Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getDailyReportById = async (req, res) => {
    try {
        const report = await DailyReport.findById(req.params.id).lean();

        if (!report) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Daily report not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error("Get Daily Report By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateDailyReport = async (req, res) => {
    try {
        const data = { ...req.body };
        // reportId is system-generated; never allow clients to overwrite it
        delete data.reportId;
        const report = await DailyReport.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        if (!report) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Daily report not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Daily report updated successfully",
            data: report
        });
    } catch (error) {
        console.error("Update Daily Report Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteDailyReport = async (req, res) => {
    try {
        const report = await DailyReport.findByIdAndDelete(req.params.id);

        if (!report) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Daily report not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Daily report deleted successfully"
        });
    } catch (error) {
        console.error("Delete Daily Report Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
