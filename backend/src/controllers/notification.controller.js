import MaintenanceTicket from "../models/maintenanceTicket.model.js";
import Warranty from "../models/warranty.model.js";
import AMC from "../models/amc.model.js";
import TicketSupport from "../models/ticketSupport.model.js";
import Quotation from "../models/quotation.model.js";
import Notification from "../models/notification.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";

// Date helpers matching the frontend NotificationContext day-math:
// today = UTC midnight of the current day, then +/- N days.
function utcDaysFromToday(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Lightweight notification summary (GET /api/notifications/summary).
 *
 * Returns just the alert counts so the header bell badge + stats can render
 * immediately with ONE small request — instead of the NotificationProvider
 * paging through every record of five collections on app load. The full alert
 * list is still derived on demand (bell opened / Alerts page visited).
 *
 * Counts mirror the deriveAlerts() logic in NotificationContext.js:
 *   - total    = every record that would produce an alert
 *   - unread   = the subset whose derived alert is unread
 *   - resolvedToday = tickets resolved/closed today (Maintenance + Support)
 */
// [FLOW-04] Get persistent notifications for the logged-in user
export const getUserNotifications = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?._id;
        if (!userId) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: "Not authenticated" });
        }
        const { page = 1, limit = 20, unreadOnly } = req.query;
        const filter = { recipientId: String(userId) };
        if (unreadOnly === "true") filter.read = false;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            Notification.countDocuments(filter),
            Notification.countDocuments({ recipientId: String(userId), read: false }),
        ]);
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: notifications,
            unreadCount,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        console.error("Get User Notifications Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Mark a single notification as read
export const markNotificationRead = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?._id;
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientId: String(userId) },
            { read: true },
            { new: true }
        );
        if (!notification) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Notification not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, data: notification });
    } catch (error) {
        console.error("Mark Notification Read Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Mark all notifications as read for the logged-in user
export const markAllNotificationsRead = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?._id;
        await Notification.updateMany({ recipientId: String(userId), read: false }, { read: true });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        console.error("Mark All Notifications Read Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getNotificationSummary = async (req, res) => {
  try {
    const todayStart = utcDaysFromToday(0);   // UTC midnight today
    const in14Days = utcDaysFromToday(14);    // warranty unread window
    const in60Days = utcDaysFromToday(60);    // warranty alert window
    const in7Days = utcDaysFromToday(7);      // AMC unread / quotation overdue+urgent
    const in30Days = utcDaysFromToday(30);    // AMC alert window

    const [
      maintTotal,
      maintUnread,
      maintResolved,
      warrantyTotal,
      warrantyUnread,
      amcTotal,
      amcUnread,
      supportTotal,
      supportUnread,
      supportResolved,
      quotationTotal,
      quotationUnread
    ] = await Promise.all([
      // Maintenance tickets: alert when Open/In Progress/Pending, unread when Open
      MaintenanceTicket.countDocuments({ status: { $in: ["Open", "In Progress", "Pending"] } }),
      MaintenanceTicket.countDocuments({ status: "Open" }),
      MaintenanceTicket.countDocuments({
        status: { $in: ["Resolved", "Closed", "Completed"] },
        updatedAt: { $gte: todayStart }
      }),
      // Warranties: alert when expired or expiring within 60 days, unread within 14
      Warranty.countDocuments({ expires: { $lte: in60Days } }),
      Warranty.countDocuments({ expires: { $lte: in14Days } }),
      // AMCs: alert when expired or expiring within 30 days, unread within 7
      AMC.countDocuments({ endDate: { $lte: in30Days } }),
      AMC.countDocuments({ endDate: { $lte: in7Days } }),
      // Support tickets: alert when Open/In Progress + Critical/High, unread when Open
      TicketSupport.countDocuments({
        status: { $in: ["Open", "In Progress"] },
        priority: { $in: ["Critical", "High"] }
      }),
      TicketSupport.countDocuments({ status: "Open", priority: { $in: ["Critical", "High"] } }),
      TicketSupport.countDocuments({
        status: { $in: ["Resolved", "Closed"] },
        updatedAt: { $gte: todayStart }
      }),
      // Quotations: alert on Sent/Negotiating/Pending Approval, unread when overdue or due within 7
      Quotation.countDocuments({ status: { $in: ["Sent", "Negotiating", "Pending Approval"] } }),
      Quotation.countDocuments({
        status: { $in: ["Sent", "Negotiating", "Pending Approval"] },
        validUntil: { $lte: in7Days }
      })
    ]);

    const total = maintTotal + warrantyTotal + amcTotal + supportTotal + quotationTotal;
    const unread = maintUnread + warrantyUnread + amcUnread + supportUnread + quotationUnread;
    const resolvedToday = maintResolved + supportResolved;

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { total, unread, resolvedToday }
    });
  } catch (error) {
    console.error("Get Notification Summary Error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGE.INTERNAL_SERVER_ERROR
    });
  }
};
