import Department from "../models/department.model.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

export const getAllDepartments = async (req, res) => {
    try {
        const { search, status } = req.query;
        const filter = {};
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { name: { $regex: escaped, $options: "i" } },
                { head: { $regex: escaped, $options: "i" } }
            ];
        }
        if (status) filter.status = status;

        const departments = await Department.find(filter).sort({ createdAt: 1 });
        res.status(200).json({
            success: true,
            message: "Departments fetched successfully",
            data: departments
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getDepartmentById = async (req, res) => {
    try {
        let department = null;
        if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            department = await Department.findById(req.params.id);
        }
        if (!department) {
            department = await Department.findOne({
                $or: [{ code: req.params.id }, { name: req.params.id }]
            });
        }
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found" });
        }
        res.status(200).json({ success: true, data: department });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createDepartment = async (req, res) => {
    try {
        const { name, head, description, status } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Department name is required" });
        }

        const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const existing = await Department.findOne({
            name: { $regex: `^${escapedName}$`, $options: "i" }
        });
        if (existing) {
            return res.status(400).json({ success: false, message: "Department with this name already exists" });
        }

        const code = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
        const department = await Department.create({
            name: name.trim(),
            code,
            head: head ? head.trim() : "Not Assigned",
            description: description ? description.trim() : "",
            status: status || "active"
        });

        try { logActivity({ module: "departments", action: "created", recordId: department._id, recordLabel: department.name, req, summary: `Department "${department.name}" created` }); } catch (_) {}
        res.status(201).json({
            success: true,
            message: "Department created successfully",
            data: department
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Department with this name already exists" });
        }
        res.status(500).json({ success: false, message: error.message || "Failed to create department" });
    }
};

export const updateDepartment = async (req, res) => {
    try {
        const { name, head, description, status } = req.body;
        let department = null;
        let oldSnapshot = null;
        if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            department = await Department.findById(req.params.id);
        }
        if (!department) {
            department = await Department.findOne({
                $or: [{ code: req.params.id }, { name: req.params.id }]
            });
        }

        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found" });
        }
        oldSnapshot = department.toObject();

        if (name && name.trim() !== department.name) {
            const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const existing = await Department.findOne({
                _id: { $ne: department._id },
                name: { $regex: `^${escapedName}$`, $options: "i" }
            });
            if (existing) {
                return res.status(400).json({ success: false, message: "Department with this name already exists" });
            }
            department.name = name.trim();
            department.code = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
        }

        if (head !== undefined) department.head = head.trim() || "Not Assigned";
        if (description !== undefined) department.description = description.trim();
        if (status) department.status = status;

        await department.save();
        try { const changes = computeChanges(oldSnapshot, department.toObject()); logActivity({ module: "departments", action: "updated", recordId: department._id, recordLabel: department.name, req, changes, summary: `Department "${department.name}" updated` }); } catch (_) {}

        res.status(200).json({
            success: true,
            message: "Department updated successfully",
            data: department
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteDepartment = async (req, res) => {
    try {
        let department = null;
        if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            department = await Department.findByIdAndDelete(req.params.id);
        }
        if (!department) {
            department = await Department.findOneAndDelete({
                $or: [{ code: req.params.id }, { name: req.params.id }]
            });
        }
        if (!department) {
            return res.status(404).json({ success: false, message: "Department not found" });
        }
        try { logActivity({ module: "departments", action: "deleted", recordId: department._id, recordLabel: department.name, req, summary: `Department "${department.name}" deleted` }); } catch (_) {}
        res.status(200).json({
            success: true,
            message: "Department deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
