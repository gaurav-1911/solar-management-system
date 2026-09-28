import * as Yup from "yup";
import {
  NAME_REQUIRED_MSG,
  NAME_PATTERN_MSG,
  NAME_MIN_MSG,
  NAME_MAX_MSG,
  EMAIL_REQUIRED_MSG,
  EMAIL_PATTERN_MSG,
  EMAIL_MAX_MSG,
  PHONE_REQUIRED_MSG,
  PHONE_PATTERN_MSG,
  PASSWORD_PATTERN_MSG,
  PASSWORD_MISMATCH_MSG,
  ADDRESS_REQUIRED_MSG,
  ADDRESS_MIN_MSG,
  ADDRESS_MAX_MSG,
  NOTES_MAX_MSG,
  STATUS_REQUIRED_MSG,
  DESCRIPTION_MIN_MSG,
  DESCRIPTION_MAX_MSG,
  POSITIVE_NUMBER_MSG,
  VALID_NUMBER_MSG,
  NON_NEGATIVE_MSG,
  WHOLE_NUMBER_MSG,
  DECIMAL_NUMBER_MSG,
  PERCENT_RANGE_MSG,
} from "./validationMessages";

/* ─────────── User Provided Regex Constants ─────────── */
export const NAME_REGEX = /^[A-Za-z][A-Za-z\s.'-]{1,49}$/;
export const EMAIL_REGEX = /^[A-Za-z0-9]+([._%+-][A-Za-z0-9]+)*@[A-Za-z0-9]+([.-][A-Za-z0-9]+)*\.[A-Za-z]{2,}$/;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()_\-+=])[A-Za-z\d@$!%*?&^#()_\-+=]{8,32}$/;
export const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;

/**
 * Validate phone numbers by stripping all non-digit characters (except leading +)
 * This allows formats like +91 98765 43210, +91-98765-43210, 9876543210, etc.
 */
export const isValidPhone = (value) => {
  if (!value) return false;
  const cleaned = value.replace(/[\s-()]/g, "");
  return PHONE_REGEX.test(cleaned);
};

/**
 * Normalize a phone number to a single canonical "+<country><digits>" form.
 * Never duplicates an existing country code: numbers that already carry a
 * leading "+" are kept as-is (formatting only), plain 10-digit numbers are
 * treated as Indian numbers and prefixed with +91.
 */
export const normalizePhone = (value) => {
  if (!value) return "";
  const cleaned = String(value).trim();
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";
  if (cleaned.startsWith("+")) return "+" + digits;
  return "+91" + digits;
};

/**
 * Inverse of normalizePhone: return just the local number (no country code)
 * so it can be shown in an input that already has a "+91" prefix chip.
 * Handles stored formats like "+919876543210", "+91 98250 11223", or
 * "9876543210" (and self-heals numbers with a doubled country code).
 */
export const toLocalPhone = (value) => {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (/^91\d{10}$/.test(digits)) return digits.slice(2); // strip +91 country code
  if (/^9191\d{10}$/.test(digits)) return digits.slice(4); // heal a doubled +91
  if (digits.length <= 10) return digits; // already a local number
  return digits; // international / ambiguous — show everything, never drop digits
};

export const CAPACITY_REGEX = /^\d+(\.\d+)?\s*(kW|kw|KW)?$/;

/* ─────────── Date Validation Helpers ─────────── */
export const validateNotPastDate = (val) => {
  if (!val) return true;
  const parts = String(val).split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const selected = new Date(year, month, day, 0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected >= today;
  }
  const selected = new Date(val);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selected >= today;
};

export const validateNotFutureDate = (val) => {
  if (!val) return true;
  const parts = String(val).split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const selected = new Date(year, month, day, 0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected <= today;
  }
  const selected = new Date(val);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return selected <= today;
};

/* ─────────── Yup Validation Schemas ─────────── */

/**
 * Admin Login Validation Schema — accepts either an email address
 * or a username, and does not enforce password policy on sign-in.
 */
export const adminLoginSchema = Yup.object().shape({
  email: Yup.string()
    .trim()
    .required("Email or username is required")
    .test("email-or-username", "Enter a valid email or username", (value) => {
      if (!value) return true;
      return EMAIL_REGEX.test(value) || /^[a-zA-Z0-9._-]{3,30}$/.test(value);
    }),

  password: Yup.string()
    .required("Password is required"),
});
 
// ========================================
// Site Survey Module
// ========================================
export const siteSurveySchema = Yup.object().shape({
  customerName: Yup.string()
    .trim()
    .test("customerName", NAME_PATTERN_MSG, (v) => !v || NAME_REGEX.test(v)),

  projectName: Yup.string()
    .trim()
    .required("Project name is required")
    .min(3, "Project name must be at least 3 characters")
    .max(100, "Project name cannot exceed 100 characters")
    .matches(
      /^[A-Za-z0-9\s\-\/]+$/,
      "Only letters, numbers, spaces, - and / are allowed"
    ),

  leadId: Yup.string()
    .trim()
    .required("Please select a lead"),

  technicianId: Yup.string()
    .required("Please select a technician"),
  technicianName: Yup.string(),

  visitDate: Yup.date()
    .transform((_val, orig) => orig ? new Date(orig) : undefined)
    .required("Visit date is required")
    .typeError("Invalid date"),

  visitTime: Yup.string()
    .required("Visit time is required"),

  visitStatus: Yup.string(),

  notes: Yup.string().max(200, "Notes cannot exceed 200 characters"),

  roofType: Yup.string()
    .required("Roof type is required"),

  customRoofType: Yup.string()
    .max(100, "Roof type cannot exceed 100 characters")
    .when("roofType", {
      is: "Other",
      then: (schema) => schema.trim().required("Please specify the roof type"),
      otherwise: (schema) => schema,
    }),

  roofLength: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .required("Roof length is required")
    .moreThan(0, "Roof length must be greater than 0")
    .max(100, "Roof length must not exceed 100 meters")
    .typeError(VALID_NUMBER_MSG),

  roofWidth: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .required("Roof width is required")
    .moreThan(0, "Roof width must be greater than 0")
    .max(100, "Roof width must not exceed 100 meters")
    .typeError(VALID_NUMBER_MSG),

  roofAngle: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .required("Roof angle is required")
    .min(0, "Roof angle cannot be less than 0°")
    .max(90, "Roof angle cannot exceed 90°")
    .typeError(VALID_NUMBER_MSG),

  shadowAnalysis: Yup.string()
    .required("Shadow analysis is required"),

  shadowNotes: Yup.string().max(200, "Shadow notes cannot exceed 200 characters"),

  monthlyUnits: Yup.number()
    .transform((_val, orig) => {
      if (orig === "" || orig == null) return undefined;
      const s = String(orig);
      const dec = s.includes(".") ? s.split(".")[1].length : 0;
      if (dec > 2) return Number.NaN; // invalid → caught by typeError
      return Number(orig);
    })
    .required("Monthly electricity units are required")
    .moreThan(0, "Monthly electricity units must be greater than 0")
    .max(10000, "Monthly electricity units cannot exceed 10,000 kWh")
    .typeError("Maximum 2 decimal places allowed"),

  latitude: Yup.string()
    .required("Latitude is required")
    .test("is-valid-lat", "Latitude must be a number between -90 and 90", (value) => {
      if (!value) return true;
      const num = Number(value);
      return !isNaN(num) && num >= -90 && num <= 90;
    }),

  longitude: Yup.string()
    .required("Longitude is required")
    .test("is-valid-lng", "Longitude must be a number between -180 and 180", (value) => {
      if (!value) return true;
      const num = Number(value);
      return !isNaN(num) && num >= -180 && num <= 180;
    }),

  electricityBill: Yup.mixed()
    .required("Electricity bill is required"),

  sitePhotos: Yup.array()
    .min(1, "At least one site photo is required"),

  surveyNotes: Yup.string().max(200, "Additional survey notes cannot exceed 200 characters"),
});

// ========================================
// Solar Design Module
// ========================================
export const solarDesignSchema = Yup.object().shape({
  customerName: Yup.string()
    .trim()
    .test("customerName", NAME_PATTERN_MSG, (v) => !v || NAME_REGEX.test(v)),

  projectName: Yup.string()
    .trim()
    .max(100, "Project name is too long"),

  leadId: Yup.string()
    .trim()
    .required("Please select a lead"),

  monthlyConsumption: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .required("Monthly consumption is required")
    .positive(POSITIVE_NUMBER_MSG)
    .max(1000000, "Monthly consumption is too large")
    .typeError(VALID_NUMBER_MSG),

  roofLength: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .nullable()
    .positive(POSITIVE_NUMBER_MSG)
    .max(1000, "Roof length is too large")
    .typeError(VALID_NUMBER_MSG),

  roofWidth: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .nullable()
    .positive(POSITIVE_NUMBER_MSG)
    .max(1000, "Roof width is too large")
    .typeError(VALID_NUMBER_MSG),

  estimatedSystemCost: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .nullable()
    .positive(POSITIVE_NUMBER_MSG)
    .max(10000000000, "Estimated system cost is too large")
    .typeError(VALID_NUMBER_MSG),
});

// ========================================
// Installation Management Module
// ========================================
export const installationSchema = Yup.object().shape({
  customerName: Yup.string()
    .trim()
    .matches(NAME_REGEX, NAME_PATTERN_MSG),

  leadId: Yup.string()
    .trim()
    .required("Lead ID is required"),

  projectName: Yup.string().max(100),

  installationDate: Yup.string()
    .required("Installation date is required"),

  installationTime: Yup.string()
    .required("Installation time is required"),

  installationAddress: Yup.string()
    .trim()
    .max(200, "Installation address cannot exceed 200 characters")
    .required("Installation address is required"),

  installationStatus: Yup.string()
    .required("Installation status is required"),

  notes: Yup.string().max(100, "Notes cannot exceed 100 characters"),

  technicianName: Yup.string().max(50),

  technicianId: Yup.string(),

  checklist: Yup.array().of(Yup.boolean()),
  tasks: Yup.array().of(
    Yup.object().shape({
      name: Yup.string().trim(),
      status: Yup.string(),
      dailyLogs: Yup.array().of(
        Yup.object().shape({
          date: Yup.string(),
          description: Yup.string().trim().max(500, "Description cannot exceed 500 characters"),
        })
      ),
    }).noUnknown(false)
  ).nullable(),

  materials: Yup.array().nullable(),

  materialRequests: Yup.array().nullable(),

  sitePhotos: Yup.array().nullable(),

  verificationStatus: Yup.string().nullable(),

  verificationNotes: Yup.string().max(200, "Verification notes cannot exceed 200 characters"),
});

// ========================================
// Testing Module
// ========================================
export const testingSchema = Yup.object().shape({
  customerName: Yup.string()
    .trim()
    .required("Customer name is required"),

  leadId: Yup.string()
    .trim()
    .required("Lead ID is required"),

  installationId: Yup.string()
    .trim()
    .required("Installation ID is required"),

  testDate: Yup.date()
    .transform((_val, orig) => orig ? new Date(orig) : undefined)
    .required("Test date is required")
    .typeError("Invalid date"),

  engineerName: Yup.string()
    .required("Engineer name is required"),

  status: Yup.string()
    .oneOf(["Scheduled", "In Progress", "Completed", "Cancelled"], "Invalid status")
    .required("Status is required"),

  testResult: Yup.string()
    .required("Test result is required"),

  remarks: Yup.string(),

  stringTests: Yup.array(),
  inverterTest: Yup.object().shape({
    model: Yup.string().trim().required("Inverter model is required"),
    status: Yup.string().trim().required("Inverter status is required"),
    remarks: Yup.string().max(500),
  }),
  earthingTest: Yup.object().shape({
    result: Yup.string().trim().required("Earthing result is required"),
    resistance: Yup.string().trim().required("Earthing resistance is required"),
    remarks: Yup.string().max(500),
  }),
  insulationTest: Yup.object().shape({
    value: Yup.string().trim().required("Insulation resistance value is required"),
    status: Yup.string().trim().required("Insulation status is required"),
  }),
  voltageTest: Yup.object().shape({
    value: Yup.string().trim().required("Voltage value is required"),
    status: Yup.string().trim().required("Voltage status is required"),
  }),
  currentTest: Yup.object().shape({
    value: Yup.string().trim().required("Current value is required"),
    status: Yup.string().trim().required("Current status is required"),
  }),
  performance: Yup.object().shape({
    status: Yup.string().trim().required("Performance status is required"),
    remarks: Yup.string().max(500),
  }),
  safety: Yup.object().shape({
    status: Yup.string().trim().required("Safety status is required"),
    remarks: Yup.string().max(500),
  }),
  finalInspection: Yup.object().shape({
    status: Yup.string().trim().required("Final inspection status is required"),
    remarks: Yup.string().max(500),
  }),

  params: Yup.object().shape({
    voc: Yup.string().max(20),
    isc: Yup.string().max(20),
    acVoltage: Yup.string().max(20),
    frequency: Yup.string().max(20),
    earthing: Yup.string().max(20),
    inverterEff: Yup.string().max(20),
    pr: Yup.string().max(20),
  }),

  docs: Yup.array(),

  photos: Yup.array(),

  tasks: Yup.array().of(
    Yup.object().shape({
      name: Yup.string().trim().required("Task name is required"),
      status: Yup.string().oneOf(["To Do", "In Progress", "Completed"]),
      dailyLogs: Yup.array().of(
        Yup.object().shape({
          date: Yup.date().required("Date is required"),
          description: Yup.string().trim().max(500).required("Description is required"),
        })
      ),
    })
  ),

  materials: Yup.array(),

  materialRequests: Yup.array().of(
    Yup.object().shape({
      productName: Yup.string().trim().required("Product name is required"),
      category: Yup.string(),
      brand: Yup.string(),
      quantity: Yup.number().min(1).required("Quantity is required"),
      reason: Yup.string(),
      status: Yup.string().oneOf(["Pending", "Sent", "Approved", "Rejected"]),
    })
  ),
});

// ========================================
// Project Progress Module
// ========================================
export const projectProgressSchema = Yup.object().shape({
  projectName: Yup.string()
    .trim()
    .required("Project name is required"),

  customerName: Yup.string()
    .trim()
    .required("Customer name is required"),

  startDate: Yup.date()
    .transform((_val, orig) => orig ? new Date(orig) : undefined)
    .required("Start date is required")
    .typeError("Invalid date"),

  expectedEndDate: Yup.date()
    .transform((_val, orig) => orig ? new Date(orig) : undefined)
    .typeError("Invalid date")
    .test("end-after-start", "Expected end date cannot be earlier than start date", function(value) {
      const { startDate } = this.parent;
      if (!value || !startDate) return true;
      return value >= startDate;
    }),

  milestones: Yup.object().shape({
    leadCreated: Yup.string(),
    surveyCompleted: Yup.string(),
    quotationApproved: Yup.string(),
    paymentReceived: Yup.string(),
    materialProcured: Yup.string(),
    installationStarted: Yup.string(),
    testingCompleted: Yup.string(),
    commissioningCompleted: Yup.string(),
    handoverCompleted: Yup.string(),
  }),

  completionPercentage: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .min(0, PERCENT_RANGE_MSG)
    .max(100, PERCENT_RANGE_MSG)
    .typeError(PERCENT_RANGE_MSG),

  delayStatus: Yup.string(),

  delayReason: Yup.string()
    .max(500, "Delay reason cannot exceed 500 characters")
    .when("delayStatus", {
      is: "Yes",
      then: (schema) => schema.trim().required("Delay reason is mandatory when delay exists"),
      otherwise: (schema) => schema,
    }),

  resources: Yup.array()
    .of(Yup.object().shape({
      name: Yup.string().max(50),
      role: Yup.string().max(50),
    })),

  actualProjectCost: Yup.string()
    .max(15, "Project cost is too large")
    .test("is-positive-numeric", POSITIVE_NUMBER_MSG, (val) => {
      if (!val) return true;
      return !isNaN(Number(val)) && Number(val) >= 0;
    }),

  approvedBudget: Yup.string()
    .max(15, "Approved budget is too large")
    .test("is-positive-numeric", POSITIVE_NUMBER_MSG, (val) => {
      if (!val) return true;
      return !isNaN(Number(val)) && Number(val) >= 0;
    }),

  gstAmount: Yup.string()
    .test("is-positive-numeric", POSITIVE_NUMBER_MSG, (val) => {
      if (!val) return true;
      return !isNaN(Number(val)) && Number(val) >= 0;
    }),

  riskLevel: Yup.string()
    .required("Risk level is required"),

  riskDescription: Yup.string(),

  dependentActivity: Yup.string()
    .trim(),

  dependencyStatus: Yup.string(),

  healthScore: Yup.string(),
});

/* ── Daily Progress Log ────────────────────────────────── */
export const dailyProgressLogSchema = Yup.object().shape({
  date: Yup.string().required("Date is required"),

  project: Yup.string().required("Project name is required"),

  technician: Yup.string().required("Technician name is required"),

  workPerformed: Yup.string()
    .trim()
    .max(1000, "Work performed cannot exceed 1000 characters")
    .required("Work performed is required"),

  status: Yup.string(),

  completedTasks: Yup.string().max(500, "Completed tasks cannot exceed 500 characters"),
  pendingTasks: Yup.string().max(500, "Pending tasks cannot exceed 500 characters"),
  materials: Yup.string().max(500, "Materials cannot exceed 500 characters"),

  qty: Yup.number()
    .transform((_val, orig) => orig === "" ? undefined : Number(orig))
    .positive(POSITIVE_NUMBER_MSG)
    .max(1000000, "Quantity is too large")
    .typeError(VALID_NUMBER_MSG),

  delayStatus: Yup.string(),

  delayReason: Yup.string()
    .trim()
    .when("delayStatus", {
      is: "Yes",
      then: (s) => s.required("Delay reason is required"),
    }),

  weather: Yup.string().required("Weather is required"),
  weatherDesc: Yup.string().max(500, "Weather description cannot exceed 500 characters"),

  gpsLat: Yup.string().matches(/^-?\d+\.?\d*$/, DECIMAL_NUMBER_MSG),
  gpsLng: Yup.string().matches(/^-?\d+\.?\d*$/, DECIMAL_NUMBER_MSG),



  images: Yup.array(),
  videos: Yup.array(),

  // Structured material consumption entries from the inventory-linked picker.
  // `materials` / `qty` stay as the human-readable summary + total.
  materialUsage: Yup.array().of(
    Yup.object().shape({
      name: Yup.string().max(100, "Material name cannot exceed 100 characters").required("Material name is required"),
      qty: Yup.number().min(1, "Quantity must be at least 1").max(1000000, "Quantity is too large").required("Quantity is required"),
    })
  ),

  nextDayPlan: Yup.string().max(500, "Next day plan cannot exceed 500 characters"),
  issuesFound: Yup.string().max(500, "Issues found cannot exceed 500 characters"),
  customerRemarks: Yup.string().max(500, "Customer remarks cannot exceed 500 characters"),
});

// ========================================
// Technician Management — Technician Form
// ========================================
export const technicianSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG)
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .required(NAME_REQUIRED_MSG),

  phone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, isValidPhone)
    .required(PHONE_REQUIRED_MSG),

  email: Yup.string()
    .trim()
    .max(100, EMAIL_MAX_MSG)
    .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
    .required(EMAIL_REQUIRED_MSG),

  skills: Yup.array(),

  experience: Yup.string()
    .required("Experience is required"),

  joinDate: Yup.string()
    .required("Join date is required"),

  status: Yup.string(),
});

/**
 * Add-technician variant: the join date cannot be in the past when creating a
 * new technician. Editing keeps the base technicianSchema so past hire dates
 * (existing technicians) remain valid.
 */
export const technicianAddSchema = technicianSchema.shape({
  joinDate: Yup.string()
    .required("Join date is required")
    .test("not-past-date", "Join date cannot be in the past", validateNotPastDate),
});

// ========================================
// Technician Management — Location Form
// ========================================
export const locationSchema = Yup.object().shape({
  technicianName: Yup.string()
    .required("Technician is required"),

  latitude: Yup.string()
    .required("Latitude is required")
    .test("is-decimal", DECIMAL_NUMBER_MSG, (value) => {
      if (!value) return true;
      return /^-?\d+\.?\d*$/.test(value.trim());
    }),

  longitude: Yup.string()
    .required("Longitude is required")
    .test("is-decimal", DECIMAL_NUMBER_MSG, (value) => {
      if (!value) return true;
      return /^-?\d+\.?\d*$/.test(value.trim());
    }),
});

// ========================================
// Technician Management — Daily Report Form
// ========================================
export const dailyReportSchema = Yup.object().shape({
  technicianName: Yup.string()
    .required("Technician is required"),

  date: Yup.string()
    .required("Date is required"),

  workSummary: Yup.string()
    .trim()
    .max(500, "Work summary cannot exceed 500 characters")
    .required("Work summary is required"),

  hoursWorked: Yup.string()
    .required("Hours worked is required")
    .test("is-numeric", "Hours worked must be a number", (value) => {
      if (!value) return false;
      return /^\d*\.?\d*$/.test(value);
    })
    .test("is-positive", POSITIVE_NUMBER_MSG, (value) => {
      if (!value) return false;
      const hrs = parseFloat(value);
      return !isNaN(hrs) && hrs >= 0;
    })
    .test("max-hours", "Hours worked cannot be more than 12", (value) => {
      if (!value) return false;
      const hrs = parseFloat(value);
      return !isNaN(hrs) && hrs <= 12;
    }),
});

// ========================================
// Technician Management — Task Tracking Form
// ========================================
export const taskTrackingSchema = Yup.object().shape({
  technicianName: Yup.string()
    .required("Technician is required"),

  taskName: Yup.string()
    .trim()
    .required("Task name is required"),

  status: Yup.string()
    .required("Status is required"),

  // Job details collected on the task form so the reverse flow can auto-create
  // a job in the Task Assignment module.
  customerName: Yup.string()
    .trim()
    .required("Customer is required"),

  leadId: Yup.string()
    .trim()
    .required("Lead ID is required"),

  installationId: Yup.string()
    .trim()
    .required("Installation ID is required"),
});

// ========================================
// Task Assignment — Job Form
// ========================================
export const taskAssignmentSchema = Yup.object().shape({
  technicianName: Yup.string()
    .required("Technician selection is required"),

  customerName: Yup.string()
    .trim()
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .required("Customer name is required"),

  leadId: Yup.string()
    .trim()
    .required("Lead ID is required"),

  installationId: Yup.string()
    .trim()
    .required("Installation ID is required"),

  jobTitle: Yup.string()
    .trim()
    .required("Job title is required")
    .max(150, "Job title cannot exceed 150 characters"),

  jobDescription: Yup.string()
    .trim()
    .max(1000, "Job description cannot exceed 1000 characters"),

  assignedDate: Yup.string()
    .required("Assigned date is required"),

  dueDate: Yup.string()
    .test("due-after-assigned", "Due date cannot be earlier than assigned date", function (value) {
      const { assignedDate } = this.parent;
      if (!value || !assignedDate) return true;
      return value >= assignedDate;
    }),

  priority: Yup.string()
    .oneOf(["Low", "Medium", "High"], "Priority must be Low, Medium, or High"),

  status: Yup.string()
    .required("Job status is required")
    .oneOf(["Pending", "In Progress", "Completed"], "Status must be Pending, In Progress, or Completed"),
});

// ========================================
// Team Schedule — Schedule Form
// ========================================
export const teamScheduleSchema = Yup.object().shape({
  technicianName: Yup.string()
    .required("Technician is required"),

  date: Yup.string()
    .required("Date is required"),

  shift: Yup.string()
    .required("Shift type is required")
    .oneOf(["Morning", "Afternoon", "Night", "Full Day"], "Shift must be Morning, Afternoon, Night, or Full Day"),

  shiftStart: Yup.string(),
  shiftEnd: Yup.string(),

  jobAssignment: Yup.string()
    .trim()
    .required("Job assignment is required")
    .max(100, "Job assignment cannot exceed 100 characters"),

  siteLocation: Yup.string()
    .trim()
    .required("Site location is required")
    .max(150, "Site location cannot exceed 150 characters"),

  status: Yup.string()
    .required("Schedule status is required")
    .oneOf(["Scheduled", "In Progress", "Completed", "Cancelled"], "Status must be Scheduled, In Progress, Completed, or Cancelled"),

  notes: Yup.string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters"),
});

// ========================================
// Attendance — Attendance Form
// ========================================
export const attendanceSchema = Yup.object().shape({
  technicianName: Yup.string()
    .trim()
    .required("Technician name is required"),

  // technicianId is auto-filled from the selected technician in the dropdown,
  // so it is not required in the form (the backend still validates it).
  technicianId: Yup.string()
    .trim(),

  date: Yup.string()
    .required("Date is required"),

  status: Yup.string()
    .required("Attendance status is required"),

  checkIn: Yup.string()
    .when("status", {
      is: (val) => val !== "Absent" && val !== "Leave",
      then: (schema) => schema.required("Check-In time is required"),
      otherwise: (schema) => schema,
    }),

  checkOut: Yup.string(),
});

/**
 * Lead Management Validation Schema
 */
export const leadValidationSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG)
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .required(NAME_REQUIRED_MSG),
  email: Yup.string()
    .trim()
    .max(100, EMAIL_MAX_MSG)
    .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
    .required(EMAIL_REQUIRED_MSG),
  phone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, isValidPhone)
    .required(PHONE_REQUIRED_MSG),
  value: Yup.number()
    .transform((_val, orig) => (orig === "" || orig === null ? undefined : Number(orig)))
    .typeError(VALID_NUMBER_MSG)
    .positive(POSITIVE_NUMBER_MSG)
    .max(100000000, "Lead value cannot exceed ₹10 crore")
    .required("Lead value is required"),
  address: Yup.string()
    .trim()
    .min(3, ADDRESS_MIN_MSG)
    .max(200, "Address cannot exceed 200 characters")
    .required("Address is required"),
  source: Yup.string().required("Source is required"),
  status: Yup.string().required("Status is required"),
  capacity: Yup.number()
    .transform((_val, orig) => (orig === "" || orig === null ? undefined : Number(orig)))
    .typeError("Capacity must be a number")
    .min(0, "Capacity cannot be negative")
    .max(50, "Maximum capacity is 50 kW")
    .required("Capacity is required"),
  followUp: Yup.date()
    .typeError("Please enter a valid date")
    .required("Follow-up date is required")
    .test("not-past", "Follow-up date cannot be in the past", (value) => {
      if (!value) return true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return value >= today;
    }),
  notes: Yup.string()
    .trim()
    .max(500, NOTES_MAX_MSG),
});
/**
 * Customer Management Validation Schema
 */
export const customerValidationSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG)
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .required(NAME_REQUIRED_MSG),
  email: Yup.string()
    .trim()
    .max(100, EMAIL_MAX_MSG)
    .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
    .required(EMAIL_REQUIRED_MSG),
  phone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, isValidPhone)
    .required(PHONE_REQUIRED_MSG),
  capacity: Yup.string()
    .test(
      "capacity-test",
      (params) => {
        const val = (params && params.value) || "";
        const trimmed = val.trim();
        if (!trimmed) return "";
        if (!CAPACITY_REGEX.test(trimmed)) return "Enter valid solar capacity (e.g. 5kW or 5.5)";
        const num = parseFloat(trimmed);
        return num > 50 ? "Maximum number is 50" : "";
      },
      (val) => {
        const trimmed = (val || "").trim();
        if (!trimmed) return true;
        if (!CAPACITY_REGEX.test(trimmed)) return false;
        const num = parseFloat(trimmed);
        return !isNaN(num) && num <= 50;
      }
    )
    .nullable(),
  address: Yup.string()
    .trim()
    .min(3, ADDRESS_MIN_MSG)
    .max(200, "Address cannot exceed 200 characters")
    .required("Address is required"),
  type: Yup.string().required("Customer type is required"),
  status: Yup.string().required(STATUS_REQUIRED_MSG),
});

/**
 * Quotation Validation Schema
 */
export const quotationValidationSchema = Yup.object().shape({
  client: Yup.string()
    .trim()
    .required("Project / Customer selection is required"),
  status: Yup.string().required(STATUS_REQUIRED_MSG),
  validUntil: Yup.string()
    .required("Valid Until date is required")
    .test("not-past", "Valid until date cannot be in the past", validateNotPastDate),
});

/**
 * User Management Validation Schema
 */
export const userValidationSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG)
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .required(NAME_REQUIRED_MSG),
  identifier: Yup.string()
    .trim()
    .max(100, EMAIL_MAX_MSG)
    .required("Email or username is required")
    .test("email-or-username", "Enter a valid email or username", (value) => {
      if (!value) return true;
      return EMAIL_REGEX.test(value) || /^[a-zA-Z0-9._-]{3,30}$/.test(value);
    }),
  phone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, isValidPhone)
    .required(PHONE_REQUIRED_MSG),
  role: Yup.string().required("Role is required"),
});

/**
 * Document Management Validation Schema
 */
export const documentValidationSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(2, NAME_MIN_MSG)
    .max(100, "Document name cannot exceed 100 characters")
    .required("Document name is required"),
});

/**
 * Role & Permissions Validation Schema
 */
export const roleValidationSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG)
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .required(NAME_REQUIRED_MSG),
  description: Yup.string()
    .trim()
    .min(5, DESCRIPTION_MIN_MSG)
    .max(500, DESCRIPTION_MAX_MSG)
    .required("Description is required"),
});

/**
 * Company Settings Validation Schema
 */
export const companySettingsValidationSchema = Yup.object().shape({
  name: Yup.string()
    .trim()
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG)
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .required(NAME_REQUIRED_MSG),
  logo: Yup.string()
    .max(3500000, "Logo image is too large"),
  email: Yup.string()
    .trim()
    .max(100, EMAIL_MAX_MSG)
    .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
    .required(EMAIL_REQUIRED_MSG),
  phone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, isValidPhone)
    .max(14, "Phone number cannot exceed 14 digits")
    .required(PHONE_REQUIRED_MSG),
  address: Yup.string()
    .trim()
    .min(3, ADDRESS_MIN_MSG)
    .max(250, ADDRESS_MAX_MSG)
    .required(ADDRESS_REQUIRED_MSG),
});

export default adminLoginSchema;

/**
 * Validation schema for Forgot Password
 */
export const forgotPasswordSchema = Yup.object().shape({
  email: Yup.string()
    .trim()
    .max(100, "Email cannot exceed 100 characters")
    .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
    .required(EMAIL_REQUIRED_MSG),
});

/**
 * Validation schema for Reset Password
 */
export const resetPasswordSchema = Yup.object().shape({
  password: Yup.string()
    .matches(
      PASSWORD_REGEX,
      PASSWORD_PATTERN_MSG
    )
    .required("New password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "Passwords do not match")
    .required("Please confirm your new password"),
});

/**
 * Validation schema for Change Password
 */
export const changePasswordSchema = Yup.object().shape({
  currentPassword: Yup.string()
    .required("Current password is required"),
  newPassword: Yup.string()
    .matches(
      PASSWORD_REGEX,
      "Password must be 8-32 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character."
    )
    .notOneOf([Yup.ref("currentPassword")], "New password must be different from current password")
    .required("New password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("newPassword")], "Passwords do not match")
    .oneOf([Yup.ref("password")], PASSWORD_MISMATCH_MSG)
    .required("Please confirm your new password"),
});

/**
 * Validation schema for Products (Add / Edit)
 */
export const productSchema = Yup.object().shape({
  name: Yup.string()
    .required("Product name is required")
    .min(2, NAME_MIN_MSG),
  brand: Yup.string()
    .required("Brand is required")
    .min(2, "Brand must be at least 2 characters"),
  category: Yup.string()
    .required("Category is required"),
  costPrice: Yup.number()
    .min(0, NON_NEGATIVE_MSG)
    .typeError(VALID_NUMBER_MSG),
  price: Yup.number()
    .required("Price is required")
    .positive(POSITIVE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
  stock: Yup.number()
    .required("Stock is required")
    .min(0, NON_NEGATIVE_MSG)
    .integer(WHOLE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
  minStock: Yup.number()
    .required("Min stock is required")
    .min(0, NON_NEGATIVE_MSG)
    .integer(WHOLE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
  warranty: Yup.number()
    .required("Warranty is required")
    .min(0, NON_NEGATIVE_MSG)
    .max(600, "Warranty cannot exceed 50 years")
    .integer(WHOLE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
});

/**
 * Validation schema for Vendors (Add / Edit)
 */
export const vendorSchema = Yup.object().shape({
  name: Yup.string()
    .required("Vendor name is required")
    .min(2, NAME_MIN_MSG),
  categories: Yup.array()
    .of(Yup.string())
    .min(1, "Select at least one category"),
  country: Yup.string()
    .required("Country is required")
    .min(2, "Country must be at least 2 characters"),
  contactPerson: Yup.string()
    .required("Contact person is required")
    .min(2, NAME_MIN_MSG),
  contactEmail: Yup.string()
    .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
    .required(EMAIL_REQUIRED_MSG),
  contactPhone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, isValidPhone)
    .required("Phone number is required"),
  address: Yup.string()
    .required("Address is required")
    .min(3, ADDRESS_MIN_MSG),
  paymentTerms: Yup.string()
    .required("Payment terms are required"),
  status: Yup.string()
    .required("Status is required"),
  rating: Yup.number()
    .min(0, "Rating must be between 0 and 5")
    .max(5, "Rating must be between 0 and 5")
    .typeError("Rating must be a number between 0 and 5")
    .nullable(),
  deliveryScore: Yup.number()
    .min(0, "Delivery score must be between 0 and 100")
    .max(100, "Delivery score must be between 0 and 100")
    .typeError("Delivery score must be a number")
    .nullable(),
  qualityScore: Yup.number()
    .min(0, "Quality score must be between 0 and 100")
    .max(100, "Quality score must be between 0 and 100")
    .typeError("Quality score must be a number")
    .nullable(),
  responseTime: Yup.number()
    .min(0, "Response time must be 0 or more hours")
    .typeError("Response time must be a number")
    .nullable(),
});

/**
 * Validation schema for Maintenance Ticket creation
 */
export const ticketSchema = Yup.object().shape({
  customer: Yup.string()
    .required("Customer name is required")
    .min(2, NAME_MIN_MSG),
  phone: Yup.string().test("phone", PHONE_PATTERN_MSG, (v) =>
    !v ? true : isValidPhone(v)
  ),
  system: Yup.string()
    .required("System / Product name is required"),
  description: Yup.string()
    .required("Description is required")
    .min(5, DESCRIPTION_MIN_MSG),
});

/**
 * Validation schema for AMC Contract creation
 */
export const amcSchema = Yup.object().shape({
  customer: Yup.string()
    .required("Customer name is required")
    .min(2, NAME_MIN_MSG),
  system: Yup.string()
    .required("System / Product name is required"),
  startDate: Yup.string().required("Start date is required"),
  endDate: Yup.string().required("End date is required"),
});

/**
 * Validation schema for Visit scheduling
 */
export const visitSchema = Yup.object().shape({
  visitDate: Yup.string().required("Visit date is required"),
  visitTech: Yup.string(),
  visitNotes: Yup.string(),
});

/**
 * Validation schema for Resolution notes
 */
export const resolutionSchema = Yup.object().shape({
  notes: Yup.string()
    .required("Resolution notes are required")
    .min(5, "Please provide at least 5 characters"),
});

/**
 * Validation schema for Inventory (Add / Edit)
 */
export const inventorySchema = Yup.object().shape({
  name: Yup.string()
    .required("Item name is required")
    .min(2, NAME_MIN_MSG),
  quantity: Yup.number()
    .required("Quantity is required")
    .min(0, NON_NEGATIVE_MSG)
    .integer(WHOLE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
  minStock: Yup.number()
    .required("Min stock is required")
    .min(0, NON_NEGATIVE_MSG)
    .integer(WHOLE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
  unitPrice: Yup.number()
    .required("Unit price is required")
    .positive(POSITIVE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
  supplier: Yup.string()
    .required("Supplier name is required"),

  location: Yup.string()
    .required("Location is required"),
});

/**
 * Validation schema for Warehouses (Add / Edit)
 * Mirrors the backend Joi schema in Solar/src/validations/warehouse.validation.js.
 */
export const warehouseSchema = Yup.object().shape({
  name: Yup.string()
    .required("Warehouse name is required")
    .min(2, NAME_MIN_MSG)
    .max(100, "Warehouse name cannot exceed 100 characters")
    .matches(
      /^[A-Za-z0-9][A-Za-z0-9\s&'().\-/]*$/,
      "Warehouse name can only contain letters, numbers, spaces and & ' ( ) . - /"
    ),

  address: Yup.string()
    .max(200, "Address cannot exceed 200 characters")
    .test("address-min", ADDRESS_MIN_MSG, (value) => {
      if (!value) return true;
      return value.trim().length >= 3;
    }),
  city: Yup.string()
    .max(100, "City cannot exceed 100 characters")
    .test("city-min", "City must be at least 2 characters", (value) => {
      if (!value) return true;
      return value.trim().length >= 2;
    }),
  contactPerson: Yup.string()
    .max(100, "Contact person cannot exceed 100 characters")
    .test(
      "contact-person-min",
      "Contact person must be at least 2 characters",
      (value) => {
        if (!value) return true;
        return value.trim().length >= 2;
      }
    ),
  contactPhone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, (value) => {
      if (!value) return true;
      return isValidPhone(value);
    }),
  capacity: Yup.number()
    .transform((value, original) =>
      original === "" ? undefined : value
    )
    .min(0, NON_NEGATIVE_MSG)
    .max(99999999, "Capacity seems too large")
    .typeError(VALID_NUMBER_MSG),
  status: Yup.string()
    .oneOf(["Active", "Inactive"], "Status must be Active or Inactive"),
  description: Yup.string()
    .max(500, "Description cannot exceed 500 characters")
    .test("description-min", DESCRIPTION_MIN_MSG, (value) => {
      if (!value) return true;
      return value.trim().length >= 5;
    }),
});
/**
 * Validation schema for Ticket Support (Raise / Edit ticket)
 */
export const ticketSupportSchema = Yup.object().shape({
  subject: Yup.string()
    .required("Subject is required")
    .min(3, "Subject must be at least 3 characters")
    .max(100, "Subject cannot exceed 100 characters"),
  customer: Yup.string()
    .required(NAME_REQUIRED_MSG)
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG),
  email: Yup.string()
    .max(100, EMAIL_MAX_MSG)
    .test("email", EMAIL_PATTERN_MSG, (v) =>
      !v ? true : EMAIL_REGEX.test(v)
    ),
  phone: Yup.string().test("phone", PHONE_PATTERN_MSG, (v) =>
    !v ? true : isValidPhone(v)
  ),
  description: Yup.string()
    .required("Description is required")
    .min(5, DESCRIPTION_MIN_MSG)
    .max(500, DESCRIPTION_MAX_MSG),
});

/**
 * Validation schema for EDITING an existing support ticket. Mirrors the
 * backend update schema (all fields optional), so records created via the
 * API — where email/phone may be empty — can still be edited without being
 * forced to enter values.
 */
export const ticketSupportEditSchema = Yup.object().shape({
  subject: Yup.string()
    .trim()
    .test("subject-min", "Subject must be at least 3 characters", (v) =>
      !v ? true : v.trim().length >= 3
    ),
  customer: Yup.string()
    .trim()
    .test("customer-min", NAME_MIN_MSG, (v) =>
      !v ? true : v.trim().length >= 2
    ),
  email: Yup.string()
    .trim()
    .test("email", EMAIL_PATTERN_MSG, (v) => (!v ? true : EMAIL_REGEX.test(v))),
  phone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, (v) => (!v ? true : isValidPhone(v))),
  description: Yup.string()
    .trim()
    .test("desc-min", DESCRIPTION_MIN_MSG, (v) =>
      !v ? true : v.trim().length >= 5
    ),
});

/**
 * Validation schema for EDITING an existing maintenance / service / complaint
 * ticket. All fields optional (matching the backend update schema) so tickets
 * created via the API without phone/description can still be edited.
 */
export const ticketEditSchema = Yup.object().shape({
  customer: Yup.string()
    .trim()
    .test("customer-min", NAME_MIN_MSG, (v) =>
      !v ? true : v.trim().length >= 2
    ),
  phone: Yup.string()
    .test("phone", PHONE_PATTERN_MSG, (v) => (!v ? true : isValidPhone(v))),
  system: Yup.string().trim(),
  description: Yup.string()
    .trim()
    .test("desc-min", DESCRIPTION_MIN_MSG, (v) =>
      !v ? true : v.trim().length >= 5
    ),
});

/**
 * Validation schema for Warranty (Register / Edit)
 */
export const warrantySchema = Yup.object().shape({
  model: Yup.string()
    .required("Model is required")
    .min(2, "Model must be at least 2 characters"),
  serial: Yup.string()
    .required("Serial number is required")
    .min(3, "Serial must be at least 3 characters"),
  manufacturer: Yup.string()
    .required("Manufacturer is required")
    .min(2, "Manufacturer must be at least 2 characters"),
  customer: Yup.string()
    .required("Customer is required")
    .min(2, "Customer must be at least 2 characters"),
  site: Yup.string()
    .required("Site location is required")
    .min(2, "Site must be at least 2 characters"),
  installed: Yup.string()
    .required("Installation date is required"),
  periodYears: Yup.number()
    .required("Warranty period is required")
    .min(1, "Period must be at least 1 year")
    .integer(WHOLE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
});

/**
 * Validation schema for Billing Invoice (Create / Edit)
 */
export const billingInvoiceSchema = Yup.object().shape({
  invoiceDate: Yup.string().required("Invoice date is required"),
  customerName: Yup.string()
    .required("Customer name is required")
    .min(2, NAME_MIN_MSG),
  customerId: Yup.string().max(50, "Customer ID cannot exceed 50 characters"),
  projectName: Yup.string().max(100, "Project name cannot exceed 100 characters"),
  invoiceAmount: Yup.number()
    .required("Invoice amount is required")
    .positive(POSITIVE_NUMBER_MSG)
    .max(10000000000, "Invoice amount is too large")
    .typeError(VALID_NUMBER_MSG),
  taxAmount: Yup.number()
    .required("Tax amount is required")
    .min(0, NON_NEGATIVE_MSG)
    .max(10000000000, "Tax amount is too large")
    .typeError(VALID_NUMBER_MSG),
  paymentStatus: Yup.string(),
  notes: Yup.string(),
});

/**
 * Validation schema for GST Invoice
 */
export const gstInvoiceSchema = Yup.object().shape({
  invoiceNumber: Yup.string()
    .required("Please select an invoice"),
  gstNumber: Yup.string()
    .required("GST Number is required")
    .min(15, "GST Number must be 15 characters")
    .max(15, "GST Number must be 15 characters"),
  gstPercentage: Yup.number()
    // GST percentage fixed at 18% — field commented out in form
    // .required("GST percentage is required")
    .positive(POSITIVE_NUMBER_MSG)
    .max(100, "GST percentage cannot exceed 100")
    .typeError(VALID_NUMBER_MSG),
  taxableAmount: Yup.number()
    .required("Taxable amount is required")
    .positive(POSITIVE_NUMBER_MSG)
    .max(10000000000, "Taxable amount is too large")
    .typeError(VALID_NUMBER_MSG),
});

/**
 * Validation schema for Credit Note
 */
export const creditNoteSchema = Yup.object().shape({
  invoiceNumber: Yup.string().required("Please select an invoice"),
  creditAmount: Yup.number()
    .required("Credit amount is required")
    .positive(POSITIVE_NUMBER_MSG)
    .max(10000000000, "Credit amount is too large")
    .typeError(VALID_NUMBER_MSG),
  reason: Yup.string()
    .required("Reason is required")
    .min(3, "Reason must be at least 3 characters")
    .max(500, "Reason cannot exceed 500 characters"),
});

/**
 * Validation schema for Receipt
 */
export const receiptSchema = Yup.object().shape({
  invoiceNumber: Yup.string().required("Please select an invoice"),
  paymentDate: Yup.string().required("Payment date is required"),
  paymentAmount: Yup.number()
    .required("Payment amount is required")
    .positive(POSITIVE_NUMBER_MSG)
    .max(10000000000, "Payment amount is too large")
    .typeError(VALID_NUMBER_MSG),
  paymentMethod: Yup.string(),
});

/**
 * Validation schema for Due Payment
 */
export const duePaymentSchema = Yup.object().shape({
  customerName: Yup.string()
    .required("Customer name is required")
    .min(2, NAME_MIN_MSG),
  dueDate: Yup.string().required("Due date is required"),
  outstandingAmount: Yup.number()
    .required("Outstanding amount is required")
    .positive(POSITIVE_NUMBER_MSG)
    .typeError(VALID_NUMBER_MSG),
  paymentStatus: Yup.string(),
});

/**
 * Validation schema for Government Subsidy (Add / Edit application)
 */
export const subsidySchema = Yup.object().shape({
  customerName: Yup.string()
    .required("Customer name is required")
    .min(2, NAME_MIN_MSG),
  schemeName: Yup.string()
    .required("Scheme name is required"),
  applicationDate: Yup.string()
    .required("Application date is required"),
  status: Yup.string()
    .required("Status is required"),
  customerType: Yup.string()
    .required("Customer type is required"),
  projectType: Yup.string()
    .required("Project type is required"),
  eligibleCapacity: Yup.number()
    .required("Eligible capacity is required")
    .positive(POSITIVE_NUMBER_MSG)
    .max(1000, "Eligible capacity cannot exceed 1000 kW")
    .typeError(VALID_NUMBER_MSG),
  subsidyPercent: Yup.number()
    .when("calculationMethod", {
      is: "percentage",
      then: (s) => s.required("Subsidy percentage is required").positive(POSITIVE_NUMBER_MSG),
      otherwise: (s) => s.nullable(),
    })
    .max(100, PERCENT_RANGE_MSG)
    .typeError(VALID_NUMBER_MSG),
  ratePerKw: Yup.number()
    .min(0, NON_NEGATIVE_MSG)
    .max(1000000, "Rate per kW is too large")
    .typeError(VALID_NUMBER_MSG),
  approvalStatus: Yup.string()
    .required("Approval status is required"),
  paymentStatus: Yup.string()
    .required("Payment status is required"),
  releasedAmount: Yup.number()
    .min(0, NON_NEGATIVE_MSG)
    .max(10000000000, "Released amount is too large")
    .typeError(VALID_NUMBER_MSG),
  customerId: Yup.string().max(50, "Customer ID cannot exceed 50 characters"),
  projectName: Yup.string().max(100, "Project name cannot exceed 100 characters"),
  notes: Yup.string(),
  approverName: Yup.string(),
  approvalDate: Yup.string(),
  approvalRemarks: Yup.string().max(500, "Approval remarks cannot exceed 500 characters"),
  paymentDate: Yup.string(),
  transactionRef: Yup.string().max(100, "Transaction reference cannot exceed 100 characters"),
});

// onChange handler for number inputs that have an upper limit.
//
// Without this, a plain reject-guard leaves the field stuck at the last valid
// prefix (typing "555" into a max-500 field stops at "55", which looks broken).
// Clamping snaps the value to the max the moment it is exceeded, so "555"
// becomes "500" — the cap is visible and reachable.
//
// Works with Formik's handleChange (reads e.target.name for the field name).
export const clampNumberInput = (formik, max) => (e) => {
  const v = e.target.value;
  if (v === "") {
    formik.handleChange(e);
    return;
  }
  const n = Number(v);
  if (isNaN(n) || n < 0) return;
  if (n > max) {
    formik.setFieldValue(e.target.name, String(max));
    return;
  }
  formik.handleChange(e);
};

export const followUpValidationSchema = Yup.object().shape({
  contactName: Yup.string()
    .matches(NAME_REGEX, NAME_PATTERN_MSG)
    .min(2, NAME_MIN_MSG)
    .max(50, NAME_MAX_MSG)
    .required(NAME_REQUIRED_MSG),
  contactPhone: Yup.string().test(
    "valid-phone",
    PHONE_PATTERN_MSG,
    (value) => !value || isValidPhone(value)
  ),
  contactEmail: Yup.string()
    .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
    .max(100, EMAIL_MAX_MSG),
  type: Yup.string().required("Follow-Up type is required"),
  scheduledDate: Yup.string().nullable(),
  scheduledTime: Yup.string().nullable(),
  priority: Yup.string().nullable(),
  assignedTo: Yup.string().nullable(),
  notes: Yup.string().max(1000, "Notes cannot exceed 1000 characters"),
  status: Yup.string(),
  outcome: Yup.string()
    .max(1000, "Outcome cannot exceed 1000 characters")
    .test("outcome-required", "Outcome is required when status is Completed", function (val) {
      if (this.parent.status === "Completed") {
        return !!val && val.trim().length > 0;
      }
      return true;
    }),
  nextFollowUpDate: Yup.string(),
  leadId: Yup.string(),
  customerId: Yup.string(),
  linkToType: Yup.string(),
}).test(
  "link-relation",
  "At least one of Lead or Customer link must be selected",
  function (values) {
    if (!values) return true;
    return !!(values.leadId || values.customerId);
  }
);

