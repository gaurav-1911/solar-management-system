import Role from "../models/role.model.js";
import User from "../models/user.model.js";
import {
    validateCreateRole,
    validateUpdateRole
} from "../validations/role.validation.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Compare two permission matrices action-by-action (order/extra keys ignored).
const permissionsEqual = (a, b) => {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const moduleKey of keys) {
        const pa = (a || {})[moduleKey] || {};
        const pb = (b || {})[moduleKey] || {};
        for (const action of ["view", "create", "edit", "delete", "export"]) {
            if (!!pa[action] !== !!pb[action]) return false;
        }
    }
    return true;
};

// Case-insensitive role-name lookup. Role names are unique regardless of
// case, so "Super Admin", "super admin", "SUPER ADMIN", etc. can never
// create a duplicate — the RBAC matrix allows exactly one Super Admin role.
const findRoleByName = (name) =>
    Role.findOne({
        name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    });

export const getAllRoles = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            isSystem,
            status,
            sortField = "createdAt",
            sortDir = -1
        } = req.query;

        const filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } }
            ];
        }
        if (isSystem !== undefined) filter.isSystem = isSystem === "true";
        if (status !== undefined) filter.status = status;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const sort = {};
        sort[sortField] = parseInt(sortDir, 10);

        const [roles, total] = await Promise.all([
            // .lean() skips Mongoose document hydration for faster reads.
            Role.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
            Role.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            message: "Roles fetched successfully",
            data: roles,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getRoleById = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) {
            return res
                .status(404)
                .json({ success: false, message: "Role not found" });
        }
        res.status(200).json({
            success: true,
            message: "Role fetched successfully",
            data: role
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createRole = async (req, res) => {
    try {
        const { error, value } = validateCreateRole.validate(req.body);
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        const existing = await findRoleByName(value.name);
        if (existing) {
            return res
                .status(400)
                .json({ success: false, message: "Role with this name already exists" });
        }

        const role = await Role.create(value);
        try { logActivity({ module: "role-permissions", action: "created", recordId: role._id, recordLabel: role.name, req, summary: `Role "${role.name}" created` }); } catch (_) {}
        res.status(201).json({
            success: true,
            message: "Role created successfully",
            data: role
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateRole = async (req, res) => {
    try {
        const { error, value } = validateUpdateRole.validate(req.body);
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        if (value.name) {
            const existing = await findRoleByName(value.name);
            if (existing && String(existing._id) !== String(req.params.id)) {
                return res
                    .status(400)
                    .json({ success: false, message: "Role name already in use" });
            }
        }

        const role = await Role.findById(req.params.id);
        if (!role) {
            return res
                .status(404)
                .json({ success: false, message: "Role not found" });
        }
        // The single system role (Super Admin) is locked — it can be viewed
        // but never edited, matching the UI.
        if (role.isSystem) {
            return res
                .status(400)
                .json({ success: false, message: "System roles cannot be edited" });
        }

        const currentPerms = role.permissions instanceof Map
            ? Object.fromEntries(role.permissions)
            : (role.permissions || {});
        if (value.permissions && !permissionsEqual(currentPerms, value.permissions)) {
            const roleKey = String(role.name || "").toLowerCase().replace(/\s+/g, "_");
            const currentUserId = req.user?.userId ? String(req.user.userId) : null;
            const match = {
                role: { $in: [roleKey, role.name] },
                ...(currentUserId ? { _id: { $ne: currentUserId } } : {})
            };
            const result = await User.updateMany(match, { $inc: { tokenVersion: 1 } });
            console.log(
                `Role permissions changed for "${role.name}" — invalidated ${result.modifiedCount} active session(s)`
            );
        }

        const updatedRole = await Role.findByIdAndUpdate(req.params.id, value, {
            new: true,
            runValidators: true
        });
        if (!updatedRole) {
            return res
                .status(404)
                .json({ success: false, message: "Role not found" });
        }

        try {
            const changes = [];
            if (value.name && value.name !== role.name) {
                changes.push({ field: "Name", oldValue: role.name, newValue: value.name });
            }
            if (value.description !== undefined && value.description !== role.description) {
                changes.push({ field: "Description", oldValue: role.description || "—", newValue: value.description || "—" });
            }
            if (value.status && value.status !== role.status) {
                changes.push({ field: "Status", oldValue: role.status, newValue: value.status });
            }

            if (value.permissions) {
                const oldObj = role.toObject ? role.toObject() : role;
                const newObj = updatedRole.toObject ? updatedRole.toObject() : updatedRole;
                const oldPermsObj = oldObj.permissions || {};
                const newPermsObj = newObj.permissions || {};

                const formatModuleActions = (modObj) => {
                    if (!modObj || typeof modObj !== "object") return "None";
                    const plain = typeof modObj.toObject === "function" ? modObj.toObject() : modObj;
                    const validActions = ["view", "create", "edit", "delete", "export"];
                    const active = [];
                    for (const act of validActions) {
                        if (Boolean(plain[act])) {
                            active.push(act.charAt(0).toUpperCase() + act.slice(1));
                        }
                    }
                    return active.length > 0 ? active.join(", ") : "None";
                };

                const allModules = new Set([...Object.keys(oldPermsObj), ...Object.keys(newPermsObj)]);
                for (const modKey of allModules) {
                    if (modKey.startsWith("$") || modKey.startsWith("_")) continue;

                    const oldStr = formatModuleActions(oldPermsObj[modKey]);
                    const newStr = formatModuleActions(newPermsObj[modKey]);

                    if (oldStr !== newStr) {
                        const modLabel = modKey.charAt(0).toUpperCase() + modKey.slice(1).replace(/_/g, " ");
                        changes.push({
                            field: `${modLabel} Permissions`,
                            oldValue: oldStr,
                            newValue: newStr
                        });
                    }
                }
            }

            logActivity({
                module: "role-permissions",
                action: value.status && value.status !== role.status ? "status_change" : "updated",
                recordId: updatedRole._id,
                recordLabel: updatedRole.name,
                req,
                changes,
                summary: `Role "${updatedRole.name}" updated`
            });
        } catch (_) {}
        res.status(200).json({
            success: true,
            message: "Role updated successfully",
            data: updatedRole
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteRole = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) {
            return res
                .status(404)
                .json({ success: false, message: "Role not found" });
        }
        // Only the single system role (Super Admin) is protected from
        // deletion. Every other role — including built-ins like Company
        // Admin, Customer and custom roles — can be removed freely.
        if (role.isSystem) {
            return res
                .status(400)
                .json({ success: false, message: "System roles cannot be deleted" });
        }
        await Role.findByIdAndDelete(req.params.id);
        try { logActivity({ module: "role-permissions", action: "deleted", recordId: role._id, recordLabel: role.name, req, summary: `Role "${role.name}" deleted` }); } catch (_) {}
        res.status(200).json({
            success: true,
            message: "Role deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
