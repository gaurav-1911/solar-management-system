import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

import logger from "./src/utils/logger.js";
import connectDB from "./src/config/db.js";
import authRoutes from "./src/routes/auth.routes.js";
import leadRoutes from "./src/routes/lead.routes.js";
import customerRoutes from "./src/routes/customer.routes.js";
import followUpRoutes from "./src/routes/followUp.routes.js";
import quotationRoutes from "./src/routes/quotation.routes.js";
import quotationPublicRoutes from "./src/routes/quotationPublic.routes.js";
import siteSurveyRoutes from "./src/routes/siteSurvey.routes.js";
import solarDesignRoutes from "./src/routes/solarDesign.routes.js";
import projectApprovalRoutes from "./src/routes/projectApproval.routes.js";
import installationRoutes from "./src/routes/installation.routes.js";
import testingRoutes from "./src/routes/testing.routes.js";
import projectProgressRoutes from "./src/routes/projectProgress.routes.js";
import commissioningAndHandoverRoutes from "./src/routes/commissioningAndHandover.routes.js";
import dailyProgressLogRoutes from "./src/routes/dailyProgressLog.routes.js";
import technicianRoutes from "./src/routes/technician.routes.js";
import technicianLocationRoutes from "./src/routes/technicianLocation.routes.js";
import dailyReportRoutes from "./src/routes/dailyReport.routes.js";
import technicianTaskRoutes from "./src/routes/technicianTask.routes.js";
import attendanceRoutes from "./src/routes/attendance.routes.js";
import taskAssignmentRoutes from "./src/routes/taskAssignment.routes.js";
import teamScheduleRoutes from "./src/routes/teamSchedule.routes.js";
import productRoutes from "./src/routes/product.routes.js";
import productCategoryRoutes from "./src/routes/productCategory.routes.js";
import inventoryRoutes from "./src/routes/inventory.routes.js";
import vendorRoutes from "./src/routes/vendor.routes.js";
import purchaseOrderRoutes from "./src/routes/purchaseOrder.routes.js";
import vendorPaymentRoutes from "./src/routes/vendorPayment.routes.js";
import invoiceRoutes from "./src/routes/invoice.routes.js";
import creditNoteRoutes from "./src/routes/creditNote.routes.js";
import gstInvoiceRoutes from "./src/routes/gstInvoice.routes.js";
import receiptRoutes from "./src/routes/receipt.routes.js";
import subsidyRoutes from "./src/routes/subsidy.routes.js";
import maintenanceTicketRoutes from "./src/routes/maintenanceTicket.routes.js";
import serviceVisitRoutes from "./src/routes/serviceVisit.routes.js";
import ticketSupportRoutes from "./src/routes/ticketSupport.routes.js";
import warrantyRoutes from "./src/routes/warranty.routes.js";
import warrantyClaimRoutes from "./src/routes/warrantyClaim.routes.js";
import vendorEscalationRoutes from "./src/routes/vendorEscalation.routes.js";
import amcRoutes from "./src/routes/amc.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import roleRoutes from "./src/routes/role.routes.js";
import departmentRoutes from "./src/routes/department.routes.js";
import documentRoutes from "./src/routes/document.routes.js";
import documentCategoryRoutes from "./src/routes/documentCategory.routes.js";
import settingsRoutes from "./src/routes/settings.routes.js";
import notificationRoutes from "./src/routes/notification.routes.js";
import warehouseRoutes from "./src/routes/warehouse.routes.js";
import activityLogRoutes from "./src/routes/activityLog.routes.js";
import reportRoutes from "./src/routes/report.routes.js";
import notFoundMiddleware from "./src/middlewares/notFound.middleware.js";
import errorMiddleware from "./src/middlewares/error.middleware.js";
import authMiddleware from "./src/middlewares/auth.middleware.js";
import { rbacGuard } from "./src/middlewares/rbac.middleware.js";
import activityLoggerMiddleware from "./src/middlewares/activityLogger.middleware.js";
import responseEnvelopeMiddleware from "./src/middlewares/responseEnvelope.middleware.js";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "https://YOUR-FRONTEND-NGROK-URL.ngrok-free.dev",
];
if (process.env.CLIENT_URL) {
    allowedOrigins.push(process.env.CLIENT_URL.replace(/\/+$/, ""));
}

// Middlewares 
app.use(compression());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, origin);
    },
    credentials: true
}));
app.use(cookieParser());
app.use(responseEnvelopeMiddleware);
// SEC-06: Protect uploaded files with authentication middleware.
// Requires valid authentication cookie (accessToken/adminToken), Authorization header, or ?token= parameter.
// Files in /uploads/public/ remain publicly accessible for public links (e.g., public quotation assets).
app.use("/uploads", (req, res, next) => {
    if (req.path.startsWith("/public/")) {
        return next();
    }
    return authMiddleware(req, res, next);
}, express.static(path.join(__dirname, "uploads")));
// 10mb body limit so the base64 company logo (Settings → Company Profile) can be saved via JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));
app.use(activityLoggerMiddleware);

// Database availability middleware — prevents 10-second query buffering timeouts when DB is connecting or offline
app.use((req, res, next) => {
    if (req.path.startsWith("/api/") && mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            success: false,
            message: "Database connection in progress. Please retry in a few seconds.",
            errors: ["Database connection in progress. Please retry in a few seconds."],
            data: null
        });
    }
    next();
});

// Default Route
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running successfully"
    });
});
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Solar API is running"
  });
});
// Auth Routes
app.use("/api/auth", authRoutes);

// Lead Routes
app.use("/api/leads", authMiddleware, rbacGuard("leads"), leadRoutes);

// Customer Routes
app.use("/api/customers", authMiddleware, rbacGuard("customers"), customerRoutes);

// Follow-Up Routes
app.use("/api/follow-ups", authMiddleware, rbacGuard("follow-ups"), followUpRoutes);

// Quotation Routes
app.use("/api/quotations", authMiddleware, rbacGuard("quotations"), quotationRoutes);

// Quotation Public Routes (no auth — accessed via email links)
app.use("/api/public/quotations", quotationPublicRoutes);

// Site Survey Routes
app.use("/api/site-surveys", authMiddleware, rbacGuard("site-survey"), siteSurveyRoutes);

// Solar Design Routes
app.use("/api/solar-designs", authMiddleware, rbacGuard("solar-design"), solarDesignRoutes);

// Project Approval Routes
app.use("/api/project-approvals", authMiddleware, rbacGuard("project-approval"), projectApprovalRoutes);

// Installation Routes
app.use("/api/installations", authMiddleware, rbacGuard("installations"), installationRoutes);

// Testing Routes
app.use("/api/testing", authMiddleware, rbacGuard("testing"), testingRoutes);

// Project Progress Routes
app.use("/api/project-progress", authMiddleware, rbacGuard("project-progress"), projectProgressRoutes);

// Commissioning & Handover Routes
app.use("/api/commissioning", authMiddleware, rbacGuard("commissioning"), commissioningAndHandoverRoutes);

// Daily Progress Log Routes
app.use("/api/daily-progress", authMiddleware, rbacGuard("daily-progress"), dailyProgressLogRoutes);

// Technician Routes
// GET (list/detail) is open to any authenticated user — many modules need
// the technician list for dropdowns. Write routes are guarded inside the router.
app.use("/api/technicians", authMiddleware, technicianRoutes);

// Technician Location Routes
app.use("/api/technician-locations", technicianLocationRoutes);

// Daily Report Routes
app.use("/api/daily-reports", dailyReportRoutes);

// Technician Task Routes
app.use("/api/technician-tasks", technicianTaskRoutes);

// Attendance Routes
app.use("/api/attendance", authMiddleware, rbacGuard("attendance"), attendanceRoutes);

// Task Assignment Routes
app.use("/api/task-assignments", authMiddleware, rbacGuard("task-assignment"), taskAssignmentRoutes);

// Team Schedule Routes
app.use("/api/team-schedules", authMiddleware, rbacGuard("team-schedule"), teamScheduleRoutes);

// Product Routes
app.use("/api/products", authMiddleware, rbacGuard("products"), productRoutes);

// Product Category Routes
app.use("/api/product-categories", productCategoryRoutes);

// Inventory Routes
app.use("/api/inventory", authMiddleware, rbacGuard("inventory"), inventoryRoutes);

// Vendor Routes
app.use("/api/vendors", authMiddleware, rbacGuard("vendors"), vendorRoutes);

// Purchase Order Routes
app.use("/api/purchase-orders", purchaseOrderRoutes);

// Vendor Payment Routes
app.use("/api/vendor-payments", vendorPaymentRoutes);

// Invoice Routes
app.use("/api/invoices", authMiddleware, rbacGuard("billing"), invoiceRoutes);

// Credit Note Routes
app.use("/api/credit-notes", authMiddleware, rbacGuard("billing"), creditNoteRoutes);

// GST Invoice Routes
app.use("/api/gst-invoices", authMiddleware, rbacGuard("billing"), gstInvoiceRoutes);

// Receipt Routes
app.use("/api/receipts", authMiddleware, rbacGuard("payments"), receiptRoutes);

// Subsidy Routes
app.use("/api/subsidies", authMiddleware, rbacGuard("subsidy"), subsidyRoutes);

// Maintenance Routes
app.use("/api/maintenance-tickets", authMiddleware, rbacGuard("maintenance"), maintenanceTicketRoutes);

// Service Visit Routes (managed from the Maintenance Management page)
app.use("/api/service-visits", authMiddleware, rbacGuard("maintenance"), serviceVisitRoutes);

// Ticket Support Routes
app.use("/api/ticket-support", authMiddleware, rbacGuard("tickets"), ticketSupportRoutes);

// Warranty Routes
app.use("/api/warranties", authMiddleware, rbacGuard("warranty"), warrantyRoutes);

// Warranty Claim Routes
app.use("/api/warranty-claims", authMiddleware, rbacGuard("warranty"), warrantyClaimRoutes);

// Vendor Escalation Routes
app.use("/api/vendor-escalations", authMiddleware, rbacGuard("warranty"), vendorEscalationRoutes);

// AMC Routes
app.use("/api/amcs", authMiddleware, rbacGuard("amc"), amcRoutes);

// User Routes
app.use("/api/users", authMiddleware, rbacGuard("users"), userRoutes);

// Role Routes
app.use("/api/roles", authMiddleware, rbacGuard("role-permissions"), roleRoutes);

// Department Routes
app.use("/api/departments", authMiddleware, departmentRoutes);

// Document Routes
app.use("/api/documents", authMiddleware, rbacGuard("documents"), documentRoutes);

// Document Category Routes
app.use("/api/document-categories", authMiddleware, rbacGuard("documents"), documentCategoryRoutes);

// Settings Routes
app.use("/api/settings", authMiddleware, rbacGuard("settings"), settingsRoutes);

// Activity Log Routes
app.use("/api/activity-logs", authMiddleware, rbacGuard("activity-logs"), activityLogRoutes);
app.use("/api/reports", authMiddleware, reportRoutes);

// Notification Summary Routes (auth only — the bell is on every page for every role)
app.use("/api/notifications", notificationRoutes);

// Warehouse Routes (auth inside router; GET open to any authenticated user so the
// Inventory page can load the Location dropdown, writes need warehouses module)
app.use("/api/warehouses", warehouseRoutes);

// 404 Route Handler
app.use(notFoundMiddleware);

// Global Error Handler
app.use(errorMiddleware);

import seedDepartments from "./src/seeders/department.seeder.js";

// Connect Database then Start Server
const startServer = async () => {
    const connected = await connectDB();
    if (mongoose.connection.readyState === 1) {
        try {
            await seedDepartments();
        } catch (err) {
            logger.warn("Database seeder failed:", err.message);
        }
    }

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        if (!connected) {
            logger.warn(`⚠️  Server running on port ${PORT} WITHOUT database connection. API requests will return 503 until MongoDB connects.`);
        } else {
            logger.info(`🚀 Server running on port ${PORT}`);
        }
    });
};

startServer();
