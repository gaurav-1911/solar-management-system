import Warehouse from "../models/warehouse.model.js";
import Inventory from "../models/inventory.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Escape user input before building a regex so a warehouse name containing
// characters like ( ) [ ] . * can never break the uniqueness query.
const escapeRegExp = (str) =>
    String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getAllWarehouses = async (req, res) => {
    try {
        const {
            search,
            status,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};

        if (status && status !== "All" && status !== "all") {
            filter.status = status;
        }
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { code: { $regex: search, $options: "i" } },
                { city: { $regex: search, $options: "i" } },
                { contactPerson: { $regex: search, $options: "i" } },
                { address: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = 1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Warehouse.countDocuments(filter);
        const warehouses = await Warehouse.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: warehouses,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Warehouses Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getWarehouseById = async (req, res) => {
    try {
        const warehouse = await Warehouse.findById(req.params.id);

        if (!warehouse) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Warehouse not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: warehouse
        });
    } catch (error) {
        console.error("Get Warehouse By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

const generateWarehouseCode = async () => {
    const lastWarehouse = await Warehouse.findOne({ code: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("code")
        .lean();
    let max = 0;
    if (lastWarehouse && lastWarehouse.code) {
        const m = lastWarehouse.code.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `WH-${String(max + 1).padStart(3, "0")}`;
};

export const createWarehouse = async (req, res) => {
    try {
        const existing = await Warehouse.findOne({
            name: {
                $regex: new RegExp(`^${escapeRegExp(req.body.name)}$`, "i")
            }
        });
        if (existing) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "A warehouse with this name already exists"
            });
        }

        // Auto-generate warehouse code
        const code = await generateWarehouseCode();
        const warehouse = await Warehouse.create({ ...req.body, code });

        logActivity({
            module: "warehouses",
            action: "created",
            recordId: warehouse.code || String(warehouse._id),
            recordLabel: warehouse.name,
            req,
            changes: computeChanges({}, warehouse.toObject ? warehouse.toObject() : warehouse),
            summary: `Warehouse created: ${warehouse.name}`
        });

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Warehouse created successfully",
            data: warehouse
        });
    } catch (error) {
        console.error("Create Warehouse Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateWarehouse = async (req, res) => {
    try {
        const existing = await Warehouse.findById(req.params.id);
        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Warehouse not found"
            });
        }

        // Rename protection: keep the name unique, but make sure we don't trip
        // over the record itself when the name is unchanged.
        if (req.body.name && req.body.name.toLowerCase() !== existing.name.toLowerCase()) {
            const clash = await Warehouse.findOne({
                name: {
                    $regex: new RegExp(`^${escapeRegExp(req.body.name)}$`, "i")
                },
                _id: { $ne: existing._id }
            });
            if (clash) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "A warehouse with this name already exists"
                });
            }
        }

        const warehouse = await Warehouse.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        logActivity({
            module: "warehouses",
            action: "updated",
            recordId: warehouse.code || String(warehouse._id),
            recordLabel: warehouse.name,
            req,
            changes: computeChanges(existing.toObject ? existing.toObject() : existing, warehouse.toObject ? warehouse.toObject() : warehouse),
            summary: `Updated warehouse ${warehouse.name}`
        });

        // Inventory items store the warehouse NAME as their location — keep them
        // in step when the warehouse is renamed so items never point at a
        // location that no longer exists (and delete protection stays accurate).
        if (req.body.name && req.body.name.trim() !== existing.name) {
            await Inventory.updateMany(
                { location: existing.name },
                { location: req.body.name.trim() }
            );
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Warehouse updated successfully",
            data: warehouse
        });
    } catch (error) {
        console.error("Update Warehouse Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteWarehouse = async (req, res) => {
    try {
        const warehouse = await Warehouse.findById(req.params.id);
        if (!warehouse) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Warehouse not found"
            });
        }

        // Inventory items store the warehouse name as their location — deleting
        // a warehouse that is still in use would silently orphan those items,
        // so block it until the items are reassigned.
        const itemsUsing = await Inventory.countDocuments({
            location: warehouse.name
        });
        if (itemsUsing > 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Cannot delete "${warehouse.name}": it is used by ${itemsUsing} inventory item(s). Reassign those items to another warehouse first.`
            });
        }

        
        await Warehouse.findByIdAndDelete(req.params.id);

        logActivity({
            module: "warehouses",
            action: "deleted",
            recordId: warehouse.code || String(warehouse._id),
            recordLabel: warehouse.name,
            req,
            summary: `Deleted warehouse ${warehouse.name}`
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Warehouse deleted successfully"
        });
    } catch (error) {
        console.error("Delete Warehouse Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Warehouse Stats
export const getWarehouseStats = async (req, res) => {
    try {
        const warehouses = await Warehouse.find().lean();
        const total = warehouses.length;
        const active = warehouses.filter((w) => w.status === "Active").length;
        const inactive = warehouses.filter((w) => w.status === "Inactive").length;
        const totalCapacity = warehouses.reduce((sum, w) => sum + (w.capacity || 0), 0);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total,
                active,
                inactive,
                totalCapacity
            }
        });
    } catch (error) {
        console.error("Get Warehouse Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
