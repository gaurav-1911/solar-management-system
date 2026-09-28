import mongoose from "mongoose";
import Role from "../models/role.model.js";
import User from "../models/user.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";

const findRoleDoc = (roleValue) => {
    const role = String(roleValue || "").trim();
    if (!role) return null;
    if (mongoose.isValidObjectId(role)) {
        return Role.findById(role);
    }
    return Role.findOne({
        $or: [
            { name: { $regex: new RegExp(`^${role.replace(/_/g, " ")}$`, "i") } },
            { name: { $regex: new RegExp(`^${role}$`, "i") } }
        ]
    });
};

/**
 * Express middleware factory for dynamic Role-Based Access Control (RBAC)
 * @param {string} moduleName - Target module (e.g. 'customers', 'leads', 'quotations', 'roles')
 * @param {string} action - Required action ('view', 'create', 'edit', 'delete', 'export')
 */
export const checkPermission = (moduleName, action = "view") => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: "Authentication required"
                });
            }

            // Memoize verified permissions on the request object to avoid duplicate DB lookups & re-evaluations
            const checkKey = `${moduleName}:${action}`;
            if (req._grantedPermissions && req._grantedPermissions.has(checkKey)) {
                return next();
            }

            const userRoleKey = (req.user.role || "").toLowerCase();
            // Super Admin role has universal bypass
            if (userRoleKey === "super_admin" || userRoleKey === "super admin") {
                if (!req._grantedPermissions) req._grantedPermissions = new Set();
                req._grantedPermissions.add(checkKey);
                return next();
            }

            // Fetch latest user document from DB if available
            let userDoc = null;
            const userId = req.user.userId || req.user.id || req.user._id;
            if (userId) {
                userDoc = await User.findById(userId);
            }

            const roleNameQuery = userDoc?.role || req.user.role || "company_admin";

            const roleDoc = await findRoleDoc(roleNameQuery);

            if (!roleDoc) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: `Access denied: Role configuration not found for '${roleNameQuery}'`
                });
            }

            // Inspect module permissions map
            const modulePerms = roleDoc.permissions ? roleDoc.permissions.get(moduleName) : null;

            if (modulePerms && modulePerms[action] === true) {
                if (!req._grantedPermissions) req._grantedPermissions = new Set();
                req._grantedPermissions.add(checkKey);
                return next();
            }

            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: `Forbidden: You do not have '${action}' permission for '${moduleName}'`
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: `RBAC Authorization Error: ${error.message}`
            });
        }
    };
};

/**
 * Route-level RBAC guard factory.
 * Derives the required action from the HTTP method:
 *   GET → view, POST → create, PUT/PATCH → edit, DELETE → delete
 * @param {string} moduleName - Target module (must match a key in the Role permission map)
 */
export const rbacGuard = (moduleName) => {
    return (req, res, next) => {
        const method = (req.method || "").toUpperCase();
        let action = "view";
        if (method === "POST") action = "create";
        else if (method === "PUT" || method === "PATCH") action = "edit";
        else if (method === "DELETE") action = "delete";
        return checkPermission(moduleName, action)(req, res, next);
    };
};

export default checkPermission;
