import express from "express";
import { createTicketSupport, getAllTicketSupport, getTicketSupportById, updateTicketSupport, deleteTicketSupport } from "../controllers/ticketSupport.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createTicketSupportSchema, updateTicketSupportSchema } from "../validations/ticketSupport.validation.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/").get(getAllTicketSupport).post(checkPermission("tickets", "create"), validate(createTicketSupportSchema), createTicketSupport);
router.route("/:id").get(getTicketSupportById).put(checkPermission("tickets", "edit"), validate(updateTicketSupportSchema), updateTicketSupport).delete(checkPermission("tickets", "delete"), deleteTicketSupport);

// Upload attachment file for a ticket
const attachmentUpload = createUploadMiddleware("file", {
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    allowedMime: [
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
        "application/pdf",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain", "text/csv",
        "video/mp4", "video/webm",
    ],
    expandBody: false,
});

router.post("/:id/attachments", checkPermission("tickets", "edit"), attachmentUpload, async (req, res) => {
    try {
        const TicketSupport = (await import("../models/ticketSupport.model.js")).default;
        const { uploadFileToCloudinary } = await import("../utils/cloudinaryStorage.js");
        const HTTP_STATUS = (await import("../constants/httpStatus.js")).default;

        const ticket = await TicketSupport.findById(req.params.id);
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Ticket not found" });
        }

        if (!req.file) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "No file provided" });
        }

        const result = await uploadFileToCloudinary(req.file, "ticket-attachments");
        if (!result || !result.url) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to upload file" });
        }

        const attachment = {
            id: `AT-${Date.now()}`,
            name: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            url: result.url,
            publicId: result.publicId,
            addedBy: req.user?.name || "Unknown",
            date: new Date(),
        };

        ticket.attachments.push(attachment);
        await ticket.save({ validateBeforeSave: false });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Attachment uploaded successfully",
            data: { attachment, ticket },
        });
    } catch (error) {
        console.error("Upload Ticket Attachment Error:", error);
        const HTTP_STATUS = (await import("../constants/httpStatus.js")).default;
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to upload attachment" });
    }
});

export default router;
