import { Router } from "express";
import {
  getSalesReport, getSalesReportCount,
  getProjectReport, getProjectReportCount,
  getInventoryReport, getInventoryReportCount,
  getTechnicianReport, getTechnicianReportCount,
  exportInventoryPDF,
} from "../controllers/report.controller.js";

const router = Router();

// Sales Report
router.get("/sales", getSalesReport);
router.get("/sales/count", getSalesReportCount);

// Project Report
router.get("/projects", getProjectReport);
router.get("/projects/count", getProjectReportCount);

// Inventory Report
router.get("/inventory", getInventoryReport);
router.get("/inventory/count", getInventoryReportCount);
router.get("/inventory/export/pdf", exportInventoryPDF); // Server-side PDF export

// Technician Report
router.get("/technicians", getTechnicianReport);
router.get("/technicians/count", getTechnicianReportCount);

export default router;
