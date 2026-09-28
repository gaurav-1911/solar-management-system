import Invoice from "../models/invoice.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import Inventory from "../models/inventory.model.js";
import Technician from "../models/technician.model.js";
import TechnicianTask from "../models/technicianTask.model.js";
import Attendance from "../models/attendance.model.js";
import Installation from "../models/installation.model.js";
import SiteSurvey from "../models/siteSurvey.model.js";
import Quotation from "../models/quotation.model.js";
import ProjectApproval from "../models/projectApproval.model.js";
import Testing from "../models/testing.model.js";
import CommissioningAndHandover from "../models/commissioningAndHandover.model.js";
import { getCustomerScope, mergeOwnershipFilter } from "../utils/ownershipScope.js";
import PDFDocument from "pdfkit";

const todayISO = () => new Date().toISOString().slice(0, 10);

const invoiceStatus = (inv) => {
  const today = todayISO();
  const date = inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : "";
  if (inv.paymentStatus === "Paid") return "paid";
  const due = inv.dueDate ? String(inv.dueDate).slice(0, 10) : date ? new Date(new Date(date).getTime() + 30*86400000).toISOString().slice(0,10) : "";
  return (due && due < today) ? "overdue" : "pending";
};

const toProjectStatus = (p) => {
  const raw = String(p.projectStatus || "").trim().toLowerCase();
  const m = { completed: "completed", "in progress": "in-progress", delayed: "delayed", blocked: "blocked" };
  if (m[raw]) return m[raw];
  if (Number(p.completionPercentage) >= 100) return "completed";
  if (p.delayStatus === "Yes") return "delayed";
  return "in-progress";
};

/* ── Project report helpers ──────────────────────────────────────────────
   The Project Progress module re-derives milestones from real records
   (installation, testing, commissioning...) on every load, so its %
   is always fresh. The DB-stored completionPercentage can go stale when
   the record isn't re-saved. These helpers mirror that derivation so
   reports show the same numbers as the module. */

const MILESTONE_KEYS = [
  "leadCreated",
  "surveyCompleted",
  "quotationApproved",
  "paymentReceived",
  "materialProcured",
  "installationStarted",
  "testingCompleted",
  "commissioningCompleted",
  "handoverCompleted",
];

const loadProjectRelatedData = () =>
  Promise.all([
    Installation.find({}).select("leadId customerName installationStatus materials").lean(),
    SiteSurvey.find({}).select("leadId customerName").lean(),
    Quotation.find({}).select("leadId status").lean(),
    ProjectApproval.find({}).select("leadId projectName customerName status capacity").lean(),
    Testing.find({}).select("leadId testResult").lean(),
    CommissioningAndHandover.find({})
      .select("leadId gridConnected netMeterInstalled discomApproval customerSigned documentsDelivered warrantyRegistered")
      .lean(),
  ]).then(([installations, siteSurveys, quotations, approvals, tests, commissionings]) => ({
    installations,
    siteSurveys,
    quotations,
    approvals,
    tests,
    commissionings,
  }));

const deriveProjectRowData = (p, related) => {
  // Capacity comes from the matching project approval (leadId first, then
  // project name + customer name as fallback).
  const approval =
    (p.leadId && related.approvals.find((a) => a.leadId === p.leadId)) ||
    related.approvals.find(
      (a) =>
        String(a.projectName || "").trim().toLowerCase() === String(p.projectName || "").trim().toLowerCase() &&
        String(a.customerName || "").trim().toLowerCase() === String(p.customerName || "").trim().toLowerCase()
    );
  const capacity = approval && Number(approval.capacity) > 0 ? Number(approval.capacity) : null;

  let progress = Number(p.completionPercentage) || 0;
  if (p.leadId) {
    const installation = related.installations.find((i) => i.leadId === p.leadId);
    const survey =
      related.siteSurveys.find((s) => s.leadId === p.leadId) ||
      (installation?.customerName && related.siteSurveys.find((s) => s.customerName === installation.customerName));
    const quotation = related.quotations.find((q) => q.leadId === p.leadId);
    const test = related.tests.find((t) => t.leadId === p.leadId);
    const commissioning = related.commissionings.find((c) => c.leadId === p.leadId);

    const milestones = { ...(p.milestones || {}) };
    milestones.leadCreated = "Completed";
    if (survey) milestones.surveyCompleted = "Completed";
    if (quotation) {
      milestones.quotationApproved =
        quotation.status === "Approved" ? "Completed" : quotation.status === "Rejected" ? "Not Started" : "In Progress";
    }
    if (approval?.status === "Approved") milestones.quotationApproved = "Completed";
    if (installation) {
      milestones.installationStarted =
        installation.installationStatus === "Completed" ? "Completed" : "In Progress";
    }
    if (
      installation &&
      Array.isArray(installation.materials) &&
      installation.materials.some(
        (m) => (typeof m === "string" ? m === "Available" : m && m.status === "Available" && Number(m.quantity) > 0)
      )
    ) {
      milestones.materialProcured =
        installation.installationStatus === "Completed" ? "Completed" : "In Progress";
    }
    if (test) {
      milestones.testingCompleted = test.testResult === "Pass" ? "Completed" : "In Progress";
    }
    if (commissioning) {
      const commissioned =
        commissioning.gridConnected === "Connected" &&
        commissioning.netMeterInstalled === "Installed" &&
        commissioning.discomApproval === "Approved";
      const handedOver =
        commissioned &&
        commissioning.customerSigned === "Signed" &&
        commissioning.documentsDelivered === "Delivered" &&
        commissioning.warrantyRegistered === true;
      milestones.commissioningCompleted = commissioned ? "Completed" : "In Progress";
      milestones.handoverCompleted = handedOver ? "Completed" : "In Progress";
    }
    progress = Math.round(
      (MILESTONE_KEYS.filter((k) => milestones[k] === "Completed").length / MILESTONE_KEYS.length) * 100
    );
  }

  return { progress, capacity };
};

const invStatus = (item) => {
  if (item.quantity <= 0) return "out-of-stock";
  if (item.quantity < item.minStock) return "low-stock";
  return "in-stock";
};

const mapTechStatus = (s) => s === "On Leave" ? "on-leave" : s === "Inactive" ? "inactive" : "active";
const deriveRating = (pct) => pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : pct >= 40 ? "Average" : "Poor";
const matchesTech = (rec, tech) => {
  const rId = String(rec?.technicianId || "");
  return (rId && rId === String(tech.technicianId || "")) || (rId && rId === String(tech._id || ""));
};

/* Sales Report */
export const getSalesReport = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, dateFrom, dateTo } = req.query;
    const filter = {};
    if (search) filter.$or = [{ invoiceNumber: { $regex: search, $options: "i" } }, { customerName: { $regex: search, $options: "i" } }];
    if (dateFrom || dateTo) { filter.invoiceDate = {}; if (dateFrom) filter.invoiceDate.$gte = new Date(dateFrom); if (dateTo) filter.invoiceDate.$lte = new Date(dateTo + "T23:59:59.999Z"); }
    const all = await Invoice.find(filter).sort({ createdAt: -1 }).lean();
    const processed = all.map((inv) => ({ id: inv.invoiceNumber || inv._id, customer: inv.customerName || "\u2014", amount: Number(inv.totalAmount) || 0, date: inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : "", status: invoiceStatus(inv) }));
    let filtered = processed;
    if (status && status !== "All") filtered = processed.filter((r) => r.status === status);
    const total = filtered.length;
    const skip = (Number(page) - 1) * Number(limit);
    const paginated = filtered.slice(skip, skip + Number(limit));
    const stats = { total, paid: filtered.filter((r) => r.status === "paid").length, pending: filtered.filter((r) => r.status === "pending").length, overdue: filtered.filter((r) => r.status === "overdue").length, revenue: filtered.reduce((s, r) => s + r.amount, 0) };
    res.json({ success: true, data: paginated, stats, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } });
  } catch (err) { console.error("Sales report error:", err); res.status(500).json({ success: false, message: "Failed to generate sales report" }); }
};

export const getSalesReportCount = async (req, res) => {
  try {
    const { status, search, dateFrom, dateTo } = req.query;
    const filter = {};
    if (search) filter.$or = [{ invoiceNumber: { $regex: search, $options: "i" } }, { customerName: { $regex: search, $options: "i" } }];
    if (dateFrom || dateTo) { filter.invoiceDate = {}; if (dateFrom) filter.invoiceDate.$gte = new Date(dateFrom); if (dateTo) filter.invoiceDate.$lte = new Date(dateTo + "T23:59:59.999Z"); }
    const all = await Invoice.find(filter).lean();
    const processed = all.map((inv) => ({ status: invoiceStatus(inv) }));
    let filtered = processed;
    if (status && status !== "All") filtered = processed.filter((r) => r.status === status);
    res.json({ success: true, count: filtered.length });
  } catch (err) { console.error("Sales report count error:", err); res.status(500).json({ success: false, message: "Failed to count sales report" }); }
};

/* Project Report */
export const getProjectReport = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, dateFrom, dateTo } = req.query;
    const filter = {};
    if (search) filter.$or = [{ projectId: { $regex: search, $options: "i" } }, { projectName: { $regex: search, $options: "i" } }, { customerName: { $regex: search, $options: "i" } }];
    if (dateFrom || dateTo) { filter.startDate = {}; if (dateFrom) filter.startDate.$gte = new Date(dateFrom); if (dateTo) filter.startDate.$lte = new Date(dateTo + "T23:59:59.999Z"); }
    // Customers only see their own project progress records.
    if (req.user?.role === "customer") {
      const scope = await getCustomerScope(req.user.email);
      if (scope && scope.names.length) {
        mergeOwnershipFilter(filter, [
          { customerName: { $in: scope.names } },
          ...(scope.leadIds.length ? [{ leadId: { $in: scope.leadIds } }] : []),
          ...(scope.customerIds.length ? [{ customerId: { $in: scope.customerIds } }] : [])
        ]);
      } else {
        filter._id = { $exists: false };
      }
    }
    const [all, related] = await Promise.all([
      ProjectProgress.find(filter).sort({ createdAt: -1 }).lean(),
      loadProjectRelatedData(),
    ]);
    const processed = all.map((p) => {
      const { progress, capacity } = deriveProjectRowData(p, related);
      return { key: p._id || p.projectId || p.projectName, id: p.projectId || "\u2014", name: p.projectName || "\u2014", customer: p.customerName || "\u2014", capacity: capacity != null ? `${capacity} kW` : "\u2014", startDate: p.startDate ? String(p.startDate).slice(0, 10) : "", progress, status: toProjectStatus({ ...p, completionPercentage: progress }), budget: p.approvedBudget ?? null, actualCost: p.actualProjectCost ?? null };
    });
    let filtered = processed;
    if (status && status !== "All") filtered = processed.filter((r) => r.status === status);
    const total = filtered.length;
    const skip = (Number(page) - 1) * Number(limit);
    const paginated = filtered.slice(skip, skip + Number(limit));
    const stats = { total, completed: filtered.filter((r) => r.status === "completed").length, active: filtered.filter((r) => r.status === "in-progress").length, delayed: filtered.filter((r) => r.status === "delayed").length, blocked: filtered.filter((r) => r.status === "blocked").length };
    res.json({ success: true, data: paginated, stats, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } });
  } catch (err) { console.error("Project report error:", err); res.status(500).json({ success: false, message: "Failed to generate project report" }); }
};

export const getProjectReportCount = async (req, res) => {
  try {
    const { status, search, dateFrom, dateTo } = req.query;
    const filter = {};
    if (search) filter.$or = [{ projectId: { $regex: search, $options: "i" } }, { projectName: { $regex: search, $options: "i" } }];
    if (dateFrom || dateTo) { filter.startDate = {}; if (dateFrom) filter.startDate.$gte = new Date(dateFrom); if (dateTo) filter.startDate.$lte = new Date(dateTo + "T23:59:59.999Z"); }
    // Customers only see their own project progress records.
    if (req.user?.role === "customer") {
      const scope = await getCustomerScope(req.user.email);
      if (scope && scope.names.length) {
        mergeOwnershipFilter(filter, [
          { customerName: { $in: scope.names } },
          ...(scope.leadIds.length ? [{ leadId: { $in: scope.leadIds } }] : []),
          ...(scope.customerIds.length ? [{ customerId: { $in: scope.customerIds } }] : [])
        ]);
      } else {
        filter._id = { $exists: false };
      }
    }
    const [all, related] = await Promise.all([
      ProjectProgress.find(filter).lean(),
      loadProjectRelatedData(),
    ]);
    const processed = all.map((p) => {
      const { progress } = deriveProjectRowData(p, related);
      return { status: toProjectStatus({ ...p, completionPercentage: progress }) };
    });
    let filtered = processed;
    if (status && status !== "All") filtered = processed.filter((r) => r.status === status);
    res.json({ success: true, count: filtered.length });
  } catch (err) { console.error("Project report count error:", err); res.status(500).json({ success: false, message: "Failed to count project report" }); }
};

/* Inventory Report — optimized for large datasets (10k+ items).
   Uses MongoDB aggregation for stats + server-side pagination instead of
   loading every document into Node.js memory. */
const buildInventoryFilter = (query) => {
  const { category, search, dateFrom, dateTo } = query;
  const filter = {};
  if (search) {
    const re = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: re }, { sku: re }, { invId: re }];
  }
  if (category && category !== "All") filter.category = category;
  if (dateFrom || dateTo) {
    filter.updatedAt = {};
    if (dateFrom) filter.updatedAt.$gte = new Date(dateFrom);
    if (dateTo) filter.updatedAt.$lte = new Date(dateTo + "T23:59:59.999Z");
  }
  return filter;
};

export const getInventoryReport = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, search, dateFrom, dateTo } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(10000, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = buildInventoryFilter(req.query);

    // Derive the status filter condition inside MongoDB so we never load
    // the full dataset into Node.js.
    if (status && status !== "All") {
      if (status === "out-of-stock") {
        filter.quantity = { $lte: 0 };
      } else if (status === "low-stock") {
        // quantity > 0 AND quantity < minStock  — expressed as $and
        filter.$and = [
          { quantity: { $gt: 0 } },
          { $expr: { $lt: ["$quantity", "$minStock"] } }
        ];
      } else if (status === "in-stock") {
        filter.$expr = { $gte: ["$quantity", "$minStock"] };
      }
    }

    // Run the paginated query + the stats aggregation in parallel.
    const [rows, total, statsResult] = await Promise.all([
      Inventory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Inventory.countDocuments(filter),
      // Stats are computed on the full filtered set via a lightweight
      // aggregation pipeline — no document body is transferred.
      Inventory.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalStock: { $sum: "$quantity" },
            totalValue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
            lowStock: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ["$quantity", 0] }, { $lt: ["$quantity", "$minStock"] }] },
                  1, 0
                ]
              },
            },
            outOfStock: {
              $sum: { $cond: [{ $lte: ["$quantity", 0] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const s = statsResult[0] || { totalStock: 0, totalValue: 0, lowStock: 0, outOfStock: 0 };
    const data = rows.map((item) => ({
      sku: item.sku || item.invId || item._id,
      name: item.name,
      id: item.invId || item._id,
      category: item.category,
      stock: item.quantity || 0,
      reserved: 0,
      unitPrice: item.unitPrice || 0,
      status: invStatus(item),
      updateDate: (item.lastRestocked || item.updatedAt)
        ? String(item.lastRestocked || item.updatedAt).slice(0, 10)
        : "",
      location: item.location || "",
      supplier: item.supplier || "",
      minStock: item.minStock || 0,
    }));

    const stats = {
      totalProducts: total,
      totalStock: s.totalStock,
      lowStockItems: s.lowStock + s.outOfStock,
      totalValue: s.totalValue,
    };

    res.json({
      success: true,
      data,
      stats,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("Inventory report error:", err);
    res.status(500).json({ success: false, message: "Failed to generate inventory report" });
  }
};

export const getInventoryReportCount = async (req, res) => {
  try {
    const filter = buildInventoryFilter(req.query);
    const { status } = req.query;
    if (status && status !== "All") {
      if (status === "out-of-stock") {
        filter.quantity = { $lte: 0 };
      } else if (status === "low-stock") {
        filter.$and = [
          { quantity: { $gt: 0 } },
          { $expr: { $lt: ["$quantity", "$minStock"] } }
        ];
      } else if (status === "in-stock") {
        filter.$expr = { $gte: ["$quantity", "$minStock"] };
      }
    }
    const count = await Inventory.countDocuments(filter);
    res.json({ success: true, count });
  } catch (err) {
    console.error("Inventory report count error:", err);
    res.status(500).json({ success: false, message: "Failed to count inventory report" });
  }
};

/* Technician Report */
export const getTechnicianReport = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, rating, search, dateFrom, dateTo } = req.query;
    const techFilter = {};
    if (search) techFilter.$or = [{ name: { $regex: search, $options: "i" } }, { technicianId: { $regex: search, $options: "i" } }, { region: { $regex: search, $options: "i" } }];
    const techs = await Technician.find(techFilter).sort({ createdAt: -1 }).lean();
    const allTasks = await TechnicianTask.find({}).lean();
    const allAttendance = await Attendance.find({}).lean();
    const processed = techs.map((tech) => {
      const techTasks = allTasks.filter((t) => matchesTech(t, tech));
      const techAtt = allAttendance.filter((a) => matchesTech(a, tech));
      const tasksAssigned = techTasks.length;
      const completedTasks = techTasks.filter((t) => (t.status || "").toLowerCase() === "completed").length;
      const pct = tasksAssigned > 0 ? Math.round((completedTasks / tasksAssigned) * 100) : 0;
      const presentDays = techAtt.filter((a) => (a.status || "").toLowerCase() === "present").length;
      const attPct = Math.round((presentDays / (techAtt.length || 1)) * 100);
      const dates = [...techTasks.map((t) => t.updatedAt || t.createdAt), ...techAtt.map((a) => a.updatedAt || a.createdAt), tech.updatedAt, tech.createdAt].filter(Boolean);
      const lastAct = dates.length > 0 ? new Date(Math.max(...dates.map((d) => new Date(d).getTime()))) : null;
      return { id: tech.technicianId || tech._id, name: tech.name || "\u2014", region: tech.region || "\u2014", tasksAssigned, completedTasks, taskCompletionPct: pct, attendance: attPct, performanceRating: deriveRating(pct), lastActivity: lastAct ? lastAct.toISOString().slice(0, 10) : "", status: mapTechStatus(tech.status || "Active") };
    });
    let filtered = processed;
    if (status && status !== "All") filtered = processed.filter((r) => r.status === status);
    if (rating && rating !== "All") filtered = filtered.filter((r) => r.performanceRating === rating);
    if (dateFrom) filtered = filtered.filter((r) => r.lastActivity >= dateFrom);
    if (dateTo) filtered = filtered.filter((r) => r.lastActivity <= dateTo);
    const total = filtered.length;
    const skip = (Number(page) - 1) * Number(limit);
    const paginated = filtered.slice(skip, skip + Number(limit));
    const stats = { total, active: filtered.filter((r) => r.status === "active").length, onLeave: filtered.filter((r) => r.status === "on-leave").length, inactive: filtered.filter((r) => r.status === "inactive").length, avgCompletion: filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + r.taskCompletionPct, 0) / filtered.length) : 0 };
    res.json({ success: true, data: paginated, stats, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } });
  } catch (err) { console.error("Technician report error:", err); res.status(500).json({ success: false, message: "Failed to generate technician report" }); }
};

export const getTechnicianReportCount = async (req, res) => {
  try {
    const { status, rating, search } = req.query;
    const techFilter = {};
    if (search) techFilter.$or = [{ name: { $regex: search, $options: "i" } }, { technicianId: { $regex: search, $options: "i" } }];
    const techs = await Technician.find(techFilter).lean();
    const allTasks = await TechnicianTask.find({}).lean();
    const processed = techs.map((tech) => {
      const techTasks = allTasks.filter((t) => matchesTech(t, tech));
      const pct = techTasks.length > 0 ? Math.round(techTasks.filter((t) => (t.status || "").toLowerCase() === "completed").length / techTasks.length * 100) : 0;
      return { status: mapTechStatus(tech.status || "Active"), rating: deriveRating(pct) };
    });
    let filtered = processed;
    if (status && status !== "All") filtered = processed.filter((r) => r.status === status);
    if (rating && rating !== "All") filtered = filtered.filter((r) => r.rating === rating);
    res.json({ success: true, count: filtered.length });
  } catch (err) { console.error("Technician report count error:", err); res.status(500).json({ success: false, message: "Failed to count technician report" }); }
};

/* ── Server-side PDF Export ───────────────────────────────────────────────
   Generates PDF directly on the server and streams it to the client.
   Much faster than the client-side jsPDF approach because:
   - No JSON transfer of 10k+ items (saves ~5MB bandwidth)
   - No browser-side PDF rendering (saves CPU/memory)
   - Streams directly from MongoDB → PDF → download
   ──────────────────────────────────────────────────────────────────────── */

export const exportInventoryPDF = async (req, res) => {
  try {
    const { limit = 10000, status, category, search, dateFrom, dateTo } = req.query;
    const limitNum = Math.min(10000, Math.max(1, parseInt(limit, 10) || 10000));

    const filter = buildInventoryFilter(req.query);

    // Status filter
    if (status && status !== "All") {
      if (status === "out-of-stock") {
        filter.quantity = { $lte: 0 };
      } else if (status === "low-stock") {
        filter.$and = [
          { quantity: { $gt: 0 } },
          { $expr: { $lt: ["$quantity", "$minStock"] } }
        ];
      } else if (status === "in-stock") {
        filter.$expr = { $gte: ["$quantity", "$minStock"] };
      }
    }

    // Stream cursor — never loads all docs into memory at once
    const cursor = Inventory.find(filter).sort({ createdAt: -1 }).limit(limitNum).lean().cursor();

    // Set response headers for PDF download
    const filename = `Inventory_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Create PDF document in landscape A4
    const doc = new PDFDocument({
      layout: "landscape",
      margin: 40,
      bufferPages: true,
      autoFirstPage: false,
    });

    // Pipe PDF stream directly to response — no buffering
    doc.pipe(res);

    // ── Title Page ──
    doc.addPage();
    doc.fontSize(24).font("Helvetica-Bold").text("Inventory Report", 40, 50);
    doc.fontSize(10).font("Helvetica").fillColor("#666");
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, 40, 80);
    doc.text(`Filter: ${category || "All Categories"} | Status: ${status || "All"} | Search: ${search || "None"}`, 40, 95);
    doc.moveTo(40, 115).lineTo(800, 115).strokeColor("#ccc").lineWidth(0.5).stroke();

    // ── Stats Section ──
    const statsResult = await Inventory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalStock: { $sum: "$quantity" },
          totalValue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
          totalItems: { $sum: 1 },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$quantity", 0] }, { $lt: ["$quantity", "$minStock"] }] },
                1, 0
              ]
            },
          },
          outOfStock: {
            $sum: { $cond: [{ $lte: ["$quantity", 0] }, 1, 0] },
          },
        },
      },
    ]);
    const s = statsResult[0] || { totalStock: 0, totalValue: 0, totalItems: 0, lowStock: 0, outOfStock: 0 };

    let y = 130;
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000").text("Summary", 40, y);
    y += 20;
    doc.fontSize(10).font("Helvetica").fillColor("#333");
    doc.text(`Total Items: ${s.totalItems.toLocaleString("en-IN")}`, 40, y);
    doc.text(`Total Stock: ${s.totalStock.toLocaleString("en-IN")} units`, 250, y);
    doc.text(`Low Stock: ${s.lowStock.toLocaleString("en-IN")}`, 480, y);
    y += 18;
    doc.text(`Out of Stock: ${s.outOfStock.toLocaleString("en-IN")}`, 40, y);
    doc.text(`Total Value: INR ${(s.totalValue || 0).toLocaleString("en-IN")}`, 250, y);
    y += 30;
    doc.moveTo(40, y).lineTo(800, y).strokeColor("#ccc").lineWidth(0.5).stroke();
    y += 10;

    // ── Table Header ──
    const headers = ["SKU", "Item Name", "Category", "Stock", "Reserved", "Available", "Unit Price", "Status", "Location"];
    const colWidths = [80, 180, 90, 60, 65, 70, 85, 75, 115];
    let colX = 40;

    const drawHeader = () => {
      doc.rect(40, y, 820, 22).fill("#2c5364");
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#fff");
      colX = 45;
      headers.forEach((h, i) => {
        doc.text(h, colX, y + 7, { width: colWidths[i], align: "left" });
        colX += colWidths[i];
      });
      y += 22;
    };

    drawHeader();

    // ── Table Rows (streamed from cursor) ──
    let rowCount = 0;
    let alt = false;
    const statusMap = { "in-stock": "In Stock", "low-stock": "Low Stock", "out-of-stock": "Out of Stock" };

    for await (const item of cursor) {
      // New page if near bottom
      if (y > 540) {
        doc.addPage();
        y = 40;
        drawHeader();
        alt = false;
      }

      const itemStatus = invStatus(item);
      const available = Math.max(0, (item.quantity || 0) - 0);
      const row = [
        item.sku || item.invId || "",
        (item.name || "").substring(0, 30),
        item.category || "",
        String(item.quantity || 0),
        "0",
        String(available),
        `INR ${(item.unitPrice || 0).toLocaleString("en-IN")}`,
        statusMap[itemStatus] || itemStatus,
        (item.location || "").substring(0, 20),
      ];

      // Alternate row background
      if (alt) {
        doc.rect(40, y - 2, 820, 18).fill("#f8f9fa");
      }

      doc.fontSize(7).font("Helvetica").fillColor("#333");
      colX = 45;
      row.forEach((cell, i) => {
        doc.text(cell, colX, y + 2, { width: colWidths[i], align: "left" });
        colX += colWidths[i];
      });

      y += 18;
      alt = !alt;
      rowCount++;
    }

    // ── Footer on every page ──
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).font("Helvetica").fillColor("#999");
      doc.text(
        `Inventory Report — Page ${i + 1} of ${totalPages} — ${rowCount} records exported`,
        40, doc.page.height - 25,
        { align: "center", width: 820 }
      );
    }

    doc.end();

    doc.on("error", (err) => {
      console.error("PDF stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "PDF generation failed" });
      }
    });
  } catch (err) {
    console.error("Export inventory PDF error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Failed to export inventory PDF" });
    }
  }
};
