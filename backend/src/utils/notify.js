import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import sendEmail from "../services/mail.service.js";
import logger from "./logger.js";

/**
 * Send an in-app notification (and optionally email) to a user.
 *
 * This function NEVER throws — notification failures are logged but never
 * break the calling controller.
 *
 * @param {Object} opts
 * @param {string}  opts.recipientId    - User _id or email to notify
 * @param {string}  opts.recipientRole  - Role of the recipient (for filtering)
 * @param {string}  opts.type           - Notification type enum
 * @param {string}  opts.title          - Short title
 * @param {string}  opts.message        - Detailed message body
 * @param {string}  [opts.link]         - Frontend route to navigate to
 * @param {string}  [opts.sourceModule] - Module name (e.g. "follow-ups")
 * @param {string}  [opts.sourceId]     - Source record ID
 * @param {string}  [opts.triggeredBy]  - Who triggered this notification
 * @param {boolean} [opts.sendEmail]    - Whether to also send an email (default: true)
 */
export const sendNotification = async (opts) => {
    try {
        const {
            recipientId,
            recipientRole = "",
            type = "general",
            title,
            message,
            link = "",
            sourceModule = "",
            sourceId = "",
            triggeredBy = "System",
            sendEmailNotification = true,
        } = opts;

        if (!recipientId || !title || !message) {
            logger.warn("sendNotification: missing required fields", { recipientId, title });
            return;
        }

        // 1. Save in-app notification
        await Notification.create({
            recipientId: String(recipientId),
            recipientRole,
            type,
            title,
            message,
            link,
            sourceModule,
            sourceId: String(sourceId || ""),
            read: false,
            triggeredBy,
        });

        // 2. Optionally send email
        if (sendEmailNotification) {
            // Look up the user's email
            const user = await User.findOne({
                $or: [{ _id: recipientId }, { email: recipientId }],
            }).select("email name").lean();

            if (user?.email) {
                const html = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #0f2027, #2c5364); padding: 20px; border-radius: 8px 8px 0 0;">
                            <h2 style="color: #fff; margin: 0;">${title}</h2>
                        </div>
                        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                            <p style="color: #374151; font-size: 15px; line-height: 1.6;">${message}</p>
                            ${link ? `<p style="margin-top: 16px;"><a href="${process.env.CLIENT_URL || "http://localhost:3000"}${link}" style="background: #2c5364; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Details</a></p>` : ""}
                            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">— Solar Management System</p>
                        </div>
                    </div>
                `;
                await sendEmail(user.email, title, { html }).catch((err) => {
                    logger.warn(`Email notification failed for ${user.email}: ${err.message}`);
                });
            }
        }
    } catch (error) {
        // Notification failures must never break the main operation
        logger.error("sendNotification failed:", error.message);
    }
};

/**
 * Find a user by name or email and return their _id for notification targeting.
 * Returns null if not found.
 */
export const findUserIdByName = async (name) => {
    if (!name) return null;
    const user = await User.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } })
        .select("_id email")
        .lean();
    return user?._id ? String(user._id) : null;
};

/**
 * Find a user by email and return their _id.
 */
export const findUserIdByEmail = async (email) => {
    if (!email) return null;
    const user = await User.findOne({ email: email.toLowerCase().trim() })
        .select("_id")
        .lean();
    return user?._id ? String(user._id) : null;
};

/**
 * Get all admin user IDs (super_admin, company_admin).
 */
export const getAdminUserIds = async () => {
    const admins = await User.find({ role: { $in: ["super_admin", "company_admin"] } })
        .select("_id")
        .lean();
    return admins.map((u) => String(u._id));
};
