import TechnicianLocation from "../models/technicianLocation.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";

export const createTechnicianLocation = async (req, res) => {
    try {
        const location = await TechnicianLocation.create(req.body);

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Technician location saved successfully",
            data: location
        });
    } catch (error) {
        console.error("Create Technician Location Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllTechnicianLocations = async (req, res) => {
    try {
        const {
            search,
            technicianName,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};

        if (technicianName && technicianName !== "All") {
            filter.technicianName = technicianName;
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
            sortObj.lastUpdated = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await TechnicianLocation.countDocuments(filter);
        const locations = await TechnicianLocation.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: locations,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Technician Locations Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getTechnicianLocationById = async (req, res) => {
    try {
        const location = await TechnicianLocation.findById(req.params.id);

        if (!location) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Technician location not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: location
        });
    } catch (error) {
        console.error("Get Technician Location By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateTechnicianLocation = async (req, res) => {
    try {
        const data = { ...req.body, lastUpdated: new Date() };
        const location = await TechnicianLocation.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        if (!location) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Technician location not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Technician location updated successfully",
            data: location
        });
    } catch (error) {
        console.error("Update Technician Location Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteTechnicianLocation = async (req, res) => {
    try {
        const location = await TechnicianLocation.findByIdAndDelete(req.params.id);

        if (!location) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Technician location not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Technician location deleted successfully"
        });
    } catch (error) {
        console.error("Delete Technician Location Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
