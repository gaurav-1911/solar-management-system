import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useFormik } from "formik";
import { Dropdown, PageLoader, useToast } from "../../../components/common";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import StatCard from "../StatCard/StatCard";
import { companySettingsValidationSchema } from "../../../utils/AdminValidation";
import { settingsAPI } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import "./Settings.css";

/* ================================ DATA ================================ */

const TABS = [
  { key: "company", label: "Company Profile", icon: "building" },
  { key: "tax", label: "GST & Tax", icon: "receipt" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "roles", label: "Roles & Permissions", icon: "shield" },
  { key: "regional", label: "Regional", icon: "globe" },
  { key: "integrations", label: "Integrations", icon: "plug" },
];

const CURRENCIES = ["INR (₹)", "USD ($)", "EUR (€)", "GBP (£)", "AED (د.إ)"];
const TIMEZONES = [
  "Asia/Kolkata (IST, UTC+5:30)",
  "Asia/Dubai (GST, UTC+4)",
  "America/New_York (EST, UTC-5)",
  "Europe/London (GMT, UTC+0)",
  "Asia/Singapore (SGT, UTC+8)",
];
const LANGUAGES = ["English", "Hindi", "Arabic", "French", "Spanish"];
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY"];
const GST_RATES = ["5%", "12%", "18%", "28%"];
const DEFAULT_ROLES = ["Admin", "Manager", "Engineer", "Sales", "Technician", "Viewer"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const NUMBER_FORMATS = [{ value: "Indian (1,23,456)", label: "Indian (1,23,456)" }, { value: "International (123,456)", label: "International (123,456)" }, { value: "European (123.456)", label: "European (123.456)" }];
const SMS_PROVIDERS = [{ value: "MSG91", label: "MSG91" }, { value: "Twilio", label: "Twilio" }, { value: "Textlocal", label: "Textlocal" }, { value: "Fast2SMS", label: "Fast2SMS" }];
const EMAIL_PROVIDERS = [{ value: "SMTP (Custom)", label: "SMTP (Custom)" }, { value: "Gmail SMTP", label: "Gmail SMTP" }, { value: "SendGrid", label: "SendGrid" }, { value: "Amazon SES", label: "Amazon SES" }];

/* ================================ DEFAULTS ================================ */

const COMPANY_DEFAULTS = {
  name: "Suryoday Solar Pvt. Ltd.",
  logo: "",
  gstin: "24AABCS1234C1Z5",
  state: "Gujarat",
  address: "Plot 14, Sachin GIDC, Surat, Gujarat – 394230",
  phone: "9876543210",
  email: "info@suryodaysolar.com",
  website: "www.suryodaysolar.com",
  tagline: "Powering Tomorrow with Solar Energy",
};

const TAX_DEFAULTS = {
  defaultGstRate: "18%",
  cgstEnabled: true,
  sgstEnabled: true,
  igstEnabled: true,
  gstOnProducts: "18%",
  gstOnServices: "18%",
  gstOnInstallation: "18%",
  hsnCode: "998719",
  sacCode: "998719",
  taxInvoicePrefix: "INV",
  creditNotePrefix: "CN",
  autoGstCalc: true,
  reverseCharge: false,
};

const NOTIFICATIONS_DEFAULTS = {
  emailEnabled: true,
  smsEnabled: true,
  whatsappEnabled: false,
  emailInvoice: true,
  emailPayment: true,
  emailReminder: true,
  emailWarranty: false,
  smsInvoice: false,
  smsPayment: true,
  smsReminder: true,
  smsOtp: true,
  waInvoice: false,
  waPayment: true,
  waReminder: false,
  reminderDays: "3",
  overdueEscalation: "7",
  templatePrefix: "SOLAR",
};

const ROLES_DEFAULTS = {
  defaultRole: "Technician",
  invoiceApproval: "Admin",
  paymentApproval: "Manager",
  warrantyApproval: "Admin",
  leadAssignment: "Sales",
  documentAccess: "Admin",
  settingsAccess: "Admin",
  reportExport: "Manager",
  userManage: "Admin",
  inventoryAccess: "Engineer",
};

const REGIONAL_DEFAULTS = {
  currency: "INR (₹)",
  timezone: "Asia/Kolkata (IST, UTC+5:30)",
  language: "English",
  dateFormat: "DD/MM/YYYY",
  fiscalYearStart: "April",
  numberFormat: "Indian (1,23,456)",
  defaultState: "Gujarat",
  autoTz: true,
};

const INTEGRATIONS_DEFAULTS = {
  razorpayKey: "rzp_live_xxxxxxxxxxxxxxxx",
  razorpaySecret: "",
  razorpayConnected: true,
  smsProvider: "MSG91",
  smsApiKey: "xxxxxxx",
  smsConnected: true,
  whatsappApiUrl: "https://graph.facebook.com/v17.0/",
  whatsappToken: "",
  whatsappPhoneId: "",
  whatsappConnected: false,
  emailProvider: "SMTP (Custom)",
  emailHost: "smtp.suryodaysolar.com",
  emailPort: "587",
  emailUser: "noreply@suryodaysolar.com",
  emailPass: "",
  emailConnected: true,
  gstApiEnabled: true,
  gstApiKey: "gst-api-key-xxxxx",
};

// eslint-disable-next-line no-unused-vars
const ALL_DEFAULTS = {
  company: COMPANY_DEFAULTS,
  tax: TAX_DEFAULTS,
  notifications: NOTIFICATIONS_DEFAULTS,
  roles: ROLES_DEFAULTS,
  regional: REGIONAL_DEFAULTS,
  integrations: INTEGRATIONS_DEFAULTS,
};

/* ================================ FIELD LIMITS ================================ */

const FIELD_LIMITS = {
  name: 50, gstin: 15, state: 40, address: 200, phone: 14, email: 80, website: 80, tagline: 120,
  hsnCode: 8, sacCode: 8, taxInvoicePrefix: 10, creditNotePrefix: 10,
  templatePrefix: 20,
  defaultState: 40,
  razorpayKey: 64, razorpaySecret: 64, smsApiKey: 64, whatsappApiUrl: 120, whatsappToken: 200, whatsappPhoneId: 20,
  emailHost: 80, emailPort: 5, emailUser: 80, emailPass: 80, gstApiKey: 64,
};

/* ================================ FIELD VALIDATORS ================================ */

const overMax = (v, max) => (String(v ?? "").length > max ? "Maximum " + max + " characters allowed" : "");

const TAX_VALIDATORS = {
  hsnCode: (v) => overMax(v, FIELD_LIMITS.hsnCode),
  sacCode: (v) => overMax(v, FIELD_LIMITS.sacCode),
  taxInvoicePrefix: (v) => overMax(v, FIELD_LIMITS.taxInvoicePrefix),
  creditNotePrefix: (v) => overMax(v, FIELD_LIMITS.creditNotePrefix),
};

const NOTIFICATIONS_VALIDATORS = {
  reminderDays: (v) => (v === "" || v == null ? "Reminder days is required" : Number(v) < 1 || Number(v) > 30 ? "Must be between 1 and 30 days" : ""),
  overdueEscalation: (v) => (v === "" || v == null ? "Escalation days is required" : Number(v) < 1 || Number(v) > 60 ? "Must be between 1 and 60 days" : ""),
  templatePrefix: (v) => overMax(v, FIELD_LIMITS.templatePrefix),
};

const REGIONAL_VALIDATORS = {
  defaultState: (v) => overMax(v, FIELD_LIMITS.defaultState),
};

const INTEGRATIONS_VALIDATORS = {
  razorpayKey: (v) => overMax(v, FIELD_LIMITS.razorpayKey),
  razorpaySecret: (v) => overMax(v, FIELD_LIMITS.razorpaySecret),
  smsApiKey: (v) => overMax(v, FIELD_LIMITS.smsApiKey),
  whatsappApiUrl: (v) => overMax(v, FIELD_LIMITS.whatsappApiUrl),
  whatsappToken: (v) => overMax(v, FIELD_LIMITS.whatsappToken),
  whatsappPhoneId: (v) => overMax(v, FIELD_LIMITS.whatsappPhoneId),
  emailHost: (v) => overMax(v, FIELD_LIMITS.emailHost),
  emailPort: (v) => (!v || !/^\d+$/.test(v) ? "Port must be a number" : Number(v) < 1 || Number(v) > 65535 ? "Port must be between 1 and 65535" : ""),
  emailUser: (v) => overMax(v, FIELD_LIMITS.emailUser),
  emailPass: (v) => overMax(v, FIELD_LIMITS.emailPass),
  gstApiKey: (v) => overMax(v, FIELD_LIMITS.gstApiKey),
};

/* ================================ SVG ICONS ================================ */

const icons = {
  building: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" />
      <path d="M12 10h.01" /><path d="M12 14h.01" />
      <path d="M16 10h.01" /><path d="M16 14h.01" />
      <path d="M8 10h.01" /><path d="M8 14h.01" />
    </svg>
  ),
  receipt: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M14 8h-4" /><path d="M16 12h-6" /><path d="M11 16h-1" />
    </svg>
  ),
  bell: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  shield: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  globe: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  ),
  plug: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
    </svg>
  ),
  save: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),

  reset: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  discard: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),

  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  upload: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
};

/* ================================ MAIN MODULE ================================ */

export default function Settings() {
  const { canDo } = useAuth();
  const canEdit = canDo("settings", "edit");
  const [activeTab, setActiveTab] = useState("company");
  const { success, error, warning } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmVariant, setConfirmVariant] = useState("danger");
  const [settingsData, setSettingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  /* ── Load saved settings from the backend (fall back to static defaults) ── */
  const fetchSettings = useCallback(async () => {
    try {
      const res = await settingsAPI.getAll();
      setSettingsData(res.data.data || null);
      setLoadError(false);
    } catch {
      setSettingsData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const applySaved = useCallback((category, values) => {
    setSettingsData((prev) => ({ ...(prev || {}), [category]: values }));
  }, []);

  function openConfirm(title, message, variant, action) {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmVariant(variant);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  }

  const [confirmLoading, setConfirmLoading] = useState(false);
  async function handleConfirm() {
    if (!confirmAction || confirmLoading) return;
    setConfirmLoading(true);
    try {
      await confirmAction();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
      setConfirmAction(null);
    }
  }

  /* ── KPI Stats (computed from saved settings, falling back to defaults) ── */
  const saved = settingsData || {};
  const savedIntegrations = { ...INTEGRATIONS_DEFAULTS, ...(saved.integrations || {}) };
  const savedNotifications = { ...NOTIFICATIONS_DEFAULTS, ...(saved.notifications || {}) };
  const savedRegional = { ...REGIONAL_DEFAULTS, ...(saved.regional || {}) };
  const activeIntegrations = [savedIntegrations.razorpayConnected, savedIntegrations.smsConnected, savedIntegrations.emailConnected, savedIntegrations.gstApiEnabled].filter(Boolean).length;
  const notificationChannels = [savedNotifications.emailEnabled, savedNotifications.smsEnabled, savedNotifications.whatsappEnabled].filter(Boolean).length;
  const totalSections = TABS.length;

  /* ── SVG Icons for StatCards ── */
  const iconSections = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
  const iconIntegrations = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
    </svg>
  );
  const iconNotifications = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
  const iconRoles = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
  const iconRegional = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );

  return (
    <div className="set-module">
      <header className="set-header">
        <div>
          <h1 className="set-title">System Settings</h1>
          <p className="set-subtitle">
            Configure company-wide settings, taxation, notifications, regional
            preferences, and integrations — all from one place.
          </p>
        </div>
      </header>

      {/* ── KPI Stats Grid (Dashboard-style with top border) ── */}
      <div className="set-stats-grid">
        <StatCard
          title="Config Sections"
          value={totalSections.toLocaleString()}
          change={0}
          icon={iconSections}
          color="blue"
        />
        <StatCard
          title="Active Integrations"
          value={`${activeIntegrations} / 4`}
          change={0}
          icon={iconIntegrations}
          color="green"
        />
        <StatCard
          title="Notification Channels"
          value={`${notificationChannels} / 3`}
          change={0}
          icon={iconNotifications}
          color="purple"
        />
        <StatCard
          title="Default Roles"
          value={DEFAULT_ROLES.length.toLocaleString()}
          change={0}
          icon={iconRoles}
          color="orange"
        />
      </div>

      <nav className="set-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`set-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="set-tab-icon">
              {icons[tab.icon]}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      {loadError && (
        <div className="set-load-error" role="alert">
          <span>⚠️</span>
          <span>Couldn't load saved settings — showing defaults. Saving now may overwrite saved values.</span>
          <button type="button" onClick={() => { setLoading(true); setLoadError(false); fetchSettings(); }}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <PageLoader minHeight="300px" />
      ) : (
        <>
          <CompanyPanel success={success} error={error} warning={warning} openConfirm={openConfirm} hidden={activeTab !== "company"} initial={saved.company} onSaved={(d) => applySaved("company", d)} canEdit={canEdit} />
          <TaxPanel success={success} error={error} warning={warning} openConfirm={openConfirm} hidden={activeTab !== "tax"} initial={saved.tax} onSaved={(d) => applySaved("tax", d)} canEdit={canEdit} />
          <NotificationsPanel success={success} error={error} warning={warning} openConfirm={openConfirm} hidden={activeTab !== "notifications"} initial={saved.notifications} onSaved={(d) => applySaved("notifications", d)} canEdit={canEdit} />
          <RolesPanel success={success} error={error} warning={warning} openConfirm={openConfirm} hidden={activeTab !== "roles"} initial={saved.roles} onSaved={(d) => applySaved("roles", d)} canEdit={canEdit} />
          <RegionalPanel success={success} error={error} warning={warning} openConfirm={openConfirm} hidden={activeTab !== "regional"} initial={saved.regional} onSaved={(d) => applySaved("regional", d)} canEdit={canEdit} />
          <IntegrationsPanel success={success} error={error} warning={warning} openConfirm={openConfirm} hidden={activeTab !== "integrations"} initial={saved.integrations} onSaved={(d) => applySaved("integrations", d)} canEdit={canEdit} />
        </>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmVariant === "danger" ? "Delete" : "Confirm"}
        variant={confirmVariant}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        loading={confirmLoading}
      />
    </div>
  );
}

/* ================================ HOOK: useTabForm ================================ */

function useTabForm(defaults, factoryDefaults = defaults, validators = null) {
  const [form, setForm] = useState({ ...defaults });
  const initialRef = useRef(defaults);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const touchedRef = useRef({});

  const setField = useCallback((key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return next;
    });
    if (validators && validators[key] && touchedRef.current[key]) {
      setErrors((e) => ({ ...e, [key]: validators[key](value) || "" }));
    }
  }, [validators]);

  const setFieldFromEvent = useCallback((key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    if (validators && validators[key] && touchedRef.current[key]) {
      setErrors((e) => ({ ...e, [key]: validators[key](e.target.value) || "" }));
    }
  }, [validators]);

  const toggleField = useCallback((key) => () => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const validateField = useCallback((key, value) => {
    if (!validators || !validators[key]) return;
    const v = value !== undefined ? value : form[key];
    touchedRef.current = { ...touchedRef.current, [key]: true };
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors((e) => ({ ...e, [key]: validators[key](v) || "" }));
  }, [validators, form]);

  const validateAll = useCallback(() => {
    if (!validators) return true;
    const errs = {};
    Object.keys(validators).forEach((k) => {
      const msg = validators[k](form[k]);
      if (msg) errs[k] = msg;
    });
    setErrors(errs);
    const allTouched = Object.keys(validators).reduce((acc, k) => ({ ...acc, [k]: true }), {});
    touchedRef.current = { ...touchedRef.current, ...allTouched };
    setTouched((t) => ({ ...t, ...allTouched }));
    return Object.keys(errs).length === 0;
  }, [validators, form]);

  useEffect(() => {
    const changed = JSON.stringify(form) !== JSON.stringify(initialRef.current);
    setDirty(changed);
  }, [form]);

  const reset = useCallback(() => {
    setForm({ ...factoryDefaults });
    initialRef.current = factoryDefaults;
    setDirty(false);
    setErrors({});
    touchedRef.current = {};
    setTouched({});
  }, [factoryDefaults]);

  const markClean = useCallback(() => {
    initialRef.current = { ...form };
    setDirty(false);
  }, [form]);

  return { form, setField, setFieldFromEvent, toggleField, dirty, reset, markClean, errors, touched, validateField, validateAll };
}

/* ================================ FIELD META (error + max limit) ================================ */

function SetFieldMeta({ error }) {
  return error ? (
    <div className="set-field-meta">
      <span className="set-field-error">{error}</span>
    </div>
  ) : null;
}

/* ================================ Company Panel ================================ */

function CompanyPanel({ success, error, warning, openConfirm, hidden, initial, onSaved, canEdit = true }) {
  const formik = useFormik({
    initialValues: { ...COMPANY_DEFAULTS, ...(initial || {}) },
    validationSchema: companySettingsValidationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        const res = await settingsAPI.update({ company: values });
        onSaved?.(res.data.data?.company || values);
        success("Company profile saved successfully");
      } catch (err) {
        error(err.response?.data?.message || "Failed to save company settings");
      } finally {
        setSubmitting(false);
      }
    },
  });

  /* ── Logo upload (image → base64 data URL) ── */
  const logoInputRef = useRef(null);
  const [logoPreview, setLogoPreview] = useState(formik.values.logo || "");

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    if (!file.type || !file.type.startsWith("image/")) {
      error("Please choose an image file (PNG, JPG, SVG or WebP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      error("Logo image must be 2 MB or smaller");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      formik.setFieldValue("logo", dataUrl);
      setLogoPreview(dataUrl);
      success("Logo selected — click Save Profile to apply it");
    };
    reader.onerror = () => error("Could not read the selected image. Please try again.");
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    formik.setFieldValue("logo", "");
    setLogoPreview("");
  }

  function handleDiscard() {
    openConfirm("Discard Changes", "Are you sure you want to discard all unsaved changes?", "danger", () => {
      formik.resetForm();
      // formik.initialValues is the saved/loaded logo (formik.values is stale before the reset render)
      setLogoPreview(formik.initialValues.logo || "");
    });
  }

  return (
    <div className="set-panel" hidden={hidden}>
      <form noValidate onSubmit={formik.handleSubmit}>
        <div className="set-panel__header">
          <div className="set-panel__header-icon set-panel__header-icon--pine">
            {icons.building}
          </div>
          <div>
            <h2>Company Profile &amp; Branding</h2>
            <p className="set-panel-desc">
              Configure your company identity — logo, brand colors, contact details,
              and letterhead information used across all documents.
            </p>
          </div>
        </div>

        <div className="set-logo-row">
          <div className="set-logo-col">
            <div
              className={`set-logo-preview ${logoPreview ? "has-logo" : ""}`}
              onClick={() => logoInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  logoInputRef.current?.click();
                }
              }}
              title={logoPreview ? "Click to replace logo" : "Click to upload logo"}
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Company logo" />
              ) : (
                formik.values.name ? formik.values.name.charAt(0) : "S"
              )}
              <span className="set-logo-badge">{icons.upload}</span>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              hidden
              onChange={handleLogoChange}
            />
            <p className="field-hint">{logoPreview ? "Logo preview" : "Click to upload logo"}</p>
            <div className="set-logo-actions">
              <button type="button" className="set-logo-btn" onClick={() => logoInputRef.current?.click()}>
                {icons.upload}
                {logoPreview ? "Change" : "Upload"}
              </button>
              {logoPreview && (
                <button type="button" className="set-logo-btn set-logo-btn--danger" onClick={handleRemoveLogo}>
                  {icons.trash}
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="set-form-grid" style={{ flex: 1 }}>
            <div className="set-field">
              <label>Company Name <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="name"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Company name"
                className={formik.touched.name && formik.errors.name ? "input-has-error" : ""}
                maxLength={FIELD_LIMITS.name}
              />
              <SetFieldMeta error={formik.touched.name && formik.errors.name ? formik.errors.name : ""} />
            </div>
            <div className="set-field">
              <label>GSTIN</label>
              <input
                type="text"
                name="gstin"
                value={formik.values.gstin}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                style={{ fontFamily: "var(--font-family)" }}
                placeholder="24AABCS1234C1Z5"
                maxLength={FIELD_LIMITS.gstin}
              />
              <SetFieldMeta error={formik.touched.gstin && formik.errors.gstin ? formik.errors.gstin : ""} />
            </div>
            <div className="set-field set-field--full">
              <label>Registered Address <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="address"
                value={formik.values.address}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Full registered address"
                className={formik.touched.address && formik.errors.address ? "input-has-error" : ""}
                maxLength={FIELD_LIMITS.address}
              />
              <SetFieldMeta error={formik.touched.address && formik.errors.address ? formik.errors.address : ""} />
            </div>
            <div className="set-field">
              <label>State</label>
              <input
                type="text"
                name="state"
                value={formik.values.state}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="State"
                maxLength={FIELD_LIMITS.state}
              />
              <SetFieldMeta error={formik.touched.state && formik.errors.state ? formik.errors.state : ""} />
            </div>
            <div className="set-field">
              <label>Phone <span style={{ color: "#ef4444" }}>*</span></label>
              <div className="phone-input-group">
                <span className="phone-prefix">+91</span>
                <input
                  type="text"
                  name="phone"
                  value={formik.values.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 14);
                    formik.setFieldValue("phone", val);
                  }}
                  onBlur={formik.handleBlur}
                  placeholder="98765 43210"
                  className={formik.touched.phone && formik.errors.phone ? "input-has-error" : ""}
                  maxLength={FIELD_LIMITS.phone}
                />
              </div>
              <SetFieldMeta error={formik.touched.phone && formik.errors.phone ? formik.errors.phone : ""} />
            </div>
            <div className="set-field">
              <label>Email <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="info@company.com"
                className={formik.touched.email && formik.errors.email ? "input-has-error" : ""}
                maxLength={FIELD_LIMITS.email}
              />
              <SetFieldMeta error={formik.touched.email && formik.errors.email ? formik.errors.email : ""} />
            </div>
            <div className="set-field">
              <label>Website</label>
              <input
                type="text"
                name="website"
                value={formik.values.website}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="www.company.com"
                maxLength={FIELD_LIMITS.website}
              />
              <SetFieldMeta error={formik.touched.website && formik.errors.website ? formik.errors.website : ""} />
            </div>
            <div className="set-field set-field--full">
              <label>Tagline</label>
              <input
                type="text"
                name="tagline"
                value={formik.values.tagline}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Your company tagline"
                maxLength={FIELD_LIMITS.tagline}
              />
              <SetFieldMeta error={formik.touched.tagline && formik.errors.tagline ? formik.errors.tagline : ""} />
            </div>
          </div>
        </div>

        <div className="set-footer">
          <div className="set-footer-actions">
            <button type="button" className="btn btn--ghost btn--icon" onClick={handleDiscard}>
              {icons.discard}
              Discard
            </button>
            {canEdit && (
              <button type="submit" className="btn btn--primary btn--icon">
                {icons.save}
                Save Profile
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/* ================================ Tax Panel ================================ */

function TaxPanel({ success, error, warning, openConfirm, hidden, initial, onSaved, canEdit = true }) {
  const { form, setField, setFieldFromEvent, toggleField, dirty, reset, markClean, errors, validateField, validateAll } = useTabForm({ ...TAX_DEFAULTS, ...(initial || {}) }, TAX_DEFAULTS, TAX_VALIDATORS);

  async function handleSave() {
    if (!validateAll()) { warning("Please fix the highlighted fields before saving"); return; }
    if (!form.defaultGstRate) { error("Default GST rate is required"); return; }
    try {
      const res = await settingsAPI.update({ tax: form });
      markClean();
      onSaved?.(res.data.data?.tax || form);
      success("Tax configuration saved successfully");
    } catch (err) {
      error(err.response?.data?.message || "Failed to save tax settings");
    }
  }

  function handleDiscard() {
    if (!dirty) { warning("No changes to discard"); return; }
    openConfirm("Discard Changes", "Are you sure you want to discard all unsaved tax settings?", "danger", reset);
  }

  function handleResetDefaults() {
    openConfirm("Reset to Defaults", "This will reset all tax settings to factory defaults.", "danger", reset);
  }

  return (
    <div className="set-panel" hidden={hidden}>
      <div className="set-panel__header">
        <div className="set-panel__header-icon set-panel__header-icon--gold">
          {icons.receipt}
        </div>
        <div>
          <h2>GST &amp; Tax Configuration</h2>
          <p className="set-panel-desc">
            Manage GST rates, invoice prefixes, tax breakdown rules, and
            HSN/SAC codes for products and services.
          </p>
        </div>
      </div>

      <div className="set-form-grid">
        <div className="set-field">
          <label>Default GST Rate</label>
          <Dropdown value={form.defaultGstRate} onChange={(val) => setField("defaultGstRate", val)} options={GST_RATES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>HSN / SAC Code</label>
          <input
            value={form.hsnCode}
            onChange={setFieldFromEvent("hsnCode")}
            onBlur={() => validateField("hsnCode")}
            maxLength={FIELD_LIMITS.hsnCode}
            className={errors.hsnCode ? "input-has-error" : ""}
            style={{ fontFamily: "var(--font-family)" }}
          />
          <SetFieldMeta error={errors.hsnCode} />
        </div>
        <div className="set-field">
          <label>GST on Products</label>
          <Dropdown value={form.gstOnProducts} onChange={(val) => setField("gstOnProducts", val)} options={GST_RATES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>GST on Services</label>
          <Dropdown value={form.gstOnServices} onChange={(val) => setField("gstOnServices", val)} options={GST_RATES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>GST on Installation</label>
          <Dropdown value={form.gstOnInstallation} onChange={(val) => setField("gstOnInstallation", val)} options={GST_RATES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Invoice Prefix</label>
          <input
            value={form.taxInvoicePrefix}
            onChange={setFieldFromEvent("taxInvoicePrefix")}
            onBlur={() => validateField("taxInvoicePrefix")}
            maxLength={FIELD_LIMITS.taxInvoicePrefix}
            className={errors.taxInvoicePrefix ? "input-has-error" : ""}
            style={{ fontFamily: "var(--font-family)" }}
          />
          <SetFieldMeta error={errors.taxInvoicePrefix} />
        </div>
        <div className="set-field">
          <label>Credit Note Prefix</label>
          <input
            value={form.creditNotePrefix}
            onChange={setFieldFromEvent("creditNotePrefix")}
            onBlur={() => validateField("creditNotePrefix")}
            maxLength={FIELD_LIMITS.creditNotePrefix}
            className={errors.creditNotePrefix ? "input-has-error" : ""}
            style={{ fontFamily: "var(--font-family)" }}
          />
          <SetFieldMeta error={errors.creditNotePrefix} />
        </div>
      </div>

      <div className="set-toggle-list">
        <div className="set-toggle-row">
          <div className="set-toggle-info">
            <span>Auto CGST/SGST Breakdown</span>
            <span>Automatically split GST into CGST and SGST for intra-state transactions</span>
          </div>
          <label className="set-switch">
            <input type="checkbox" checked={form.autoGstCalc} onChange={toggleField("autoGstCalc")} />
            <span className="set-switch__track" />
          </label>
        </div>
        <div className="set-toggle-row">
          <div className="set-toggle-info">
            <span>IGST for Inter-State</span>
            <span>Apply IGST instead of CGST+SGST for inter-state transactions</span>
          </div>
          <label className="set-switch">
            <input type="checkbox" checked={form.igstEnabled} onChange={toggleField("igstEnabled")} />
            <span className="set-switch__track" />
          </label>
        </div>
        <div className="set-toggle-row">
          <div className="set-toggle-info">
            <span>Reverse Charge Mechanism</span>
            <span>Enable reverse charge for applicable services under GST rules</span>
          </div>
          <label className="set-switch">
            <input type="checkbox" checked={form.reverseCharge} onChange={toggleField("reverseCharge")} />
            <span className="set-switch__track" />
          </label>
        </div>
      </div>

      <div className="set-footer">
        <div className="set-footer-actions">
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleResetDefaults}>
            {icons.reset}
            Reset Defaults
          </button>
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleDiscard}>
            {icons.discard}
            Discard
          </button>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--icon" onClick={handleSave}>
              {icons.save}
            Save Tax Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================ Notifications Panel ================================ */

function NotificationsPanel({ success, error, warning, openConfirm, hidden, initial, onSaved, canEdit = true }) {
  // eslint-disable-next-line no-unused-vars
  const { form, setField, setFieldFromEvent, toggleField, dirty, reset, markClean, errors, validateField, validateAll } = useTabForm({ ...NOTIFICATIONS_DEFAULTS, ...(initial || {}) }, NOTIFICATIONS_DEFAULTS, NOTIFICATIONS_VALIDATORS);

  const stats = useMemo(() => ({
    email: form.emailEnabled,
    sms: form.smsEnabled,
    whatsapp: form.whatsappEnabled,
    reminder: form.reminderDays,
  }), [form.emailEnabled, form.smsEnabled, form.whatsappEnabled, form.reminderDays]);

  async function handleSave() {
    if (!validateAll()) { warning("Please fix the highlighted fields before saving"); return; }
    try {
      const res = await settingsAPI.update({ notifications: form });
      markClean();
      onSaved?.(res.data.data?.notifications || form);
      success("Notification settings saved successfully");
    } catch (err) {
      error(err.response?.data?.message || "Failed to save notification settings");
    }
  }

  function handleDiscard() {
    if (!dirty) { warning("No changes to discard"); return; }
    openConfirm("Discard Changes", "Are you sure you want to discard all unsaved notification settings?", "danger", reset);
  }

  function handleResetDefaults() {
    openConfirm("Reset to Defaults", "This will reset all notification settings to factory defaults.", "danger", reset);
  }

  return (
    <div className="set-panel" hidden={hidden}>
      <div className="set-panel__header">
        <div className="set-panel__header-icon set-panel__header-icon--pine">
          {icons.bell}
        </div>
        <div>
          <h2>Notification Settings</h2>
          <p className="set-panel-desc">
            Configure email, SMS, and WhatsApp notification channels, templates,
            and automated alert rules.
          </p>
        </div>
      </div>

      <section className="set-stats">
        <div className="set-stat">
          <span className="set-stat__value">{stats.email ? "On" : "Off"}</span>
          <span className="set-stat__label">Email Channel</span>
        </div>
        <div className="set-stat set-stat--gold">
          <span className="set-stat__value">{stats.sms ? "On" : "Off"}</span>
          <span className="set-stat__label">SMS Channel</span>
        </div>
        <div className="set-stat set-stat--success">
          <span className="set-stat__value">{stats.whatsapp ? "On" : "Off"}</span>
          <span className="set-stat__label">WhatsApp Channel</span>
        </div>
        <div className="set-stat">
          <span className="set-stat__value">{stats.reminder} days</span>
          <span className="set-stat__label">Payment Reminder</span>
        </div>
      </section>

      <div className="set-toggle-list">
        <div className="set-toggle-row">
          <div className="set-toggle-info">
            <span>Email Notifications</span>
            <span>Send invoices, payment receipts, and reminders via email</span>
          </div>
          <label className="set-switch">
            <input type="checkbox" checked={form.emailEnabled} onChange={toggleField("emailEnabled")} />
            <span className="set-switch__track" />
          </label>
        </div>
        <div className="set-toggle-row">
          <div className="set-toggle-info">
            <span>SMS Notifications</span>
            <span>Send payment confirmations, OTPs, and urgent alerts via SMS</span>
          </div>
          <label className="set-switch">
            <input type="checkbox" checked={form.smsEnabled} onChange={toggleField("smsEnabled")} />
            <span className="set-switch__track" />
          </label>
        </div>
        <div className="set-toggle-row">
          <div className="set-toggle-info">
            <span>WhatsApp Notifications</span>
            <span>Send payment reminders and invoice copies via WhatsApp Business API</span>
          </div>
          <label className="set-switch">
            <input type="checkbox" checked={form.whatsappEnabled} onChange={toggleField("whatsappEnabled")} />
            <span className="set-switch__track" />
          </label>
        </div>
      </div>

      <div className="set-section-box">
        <h3>Email Event Triggers</h3>
        <div className="set-toggle-list">
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Invoice Generated</span><span>Send invoice PDF when a new invoice is created</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.emailInvoice} onChange={toggleField("emailInvoice")} /><span className="set-switch__track" /></label>
          </div>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Payment Received</span><span>Send receipt when customer payment is recorded</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.emailPayment} onChange={toggleField("emailPayment")} /><span className="set-switch__track" /></label>
          </div>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Payment Reminder</span><span>Send automatic reminders before due date</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.emailReminder} onChange={toggleField("emailReminder")} /><span className="set-switch__track" /></label>
          </div>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Warranty Expiry Alert</span><span>Notify admin when product warranty is about to expire</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.emailWarranty} onChange={toggleField("emailWarranty")} /><span className="set-switch__track" /></label>
          </div>
        </div>
      </div>

      {form.smsEnabled && (
        <div className="set-section-box">
          <h3>SMS Event Triggers</h3>
          <div className="set-toggle-list">
            <div className="set-toggle-row">
              <div className="set-toggle-info"><span>Invoice Generated</span><span>Send SMS notification when a new invoice is created</span></div>
              <label className="set-switch"><input type="checkbox" checked={form.smsInvoice} onChange={toggleField("smsInvoice")} /><span className="set-switch__track" /></label>
            </div>
            <div className="set-toggle-row">
              <div className="set-toggle-info"><span>Payment Received</span><span>Send SMS confirmation when payment is recorded</span></div>
              <label className="set-switch"><input type="checkbox" checked={form.smsPayment} onChange={toggleField("smsPayment")} /><span className="set-switch__track" /></label>
            </div>
            <div className="set-toggle-row">
              <div className="set-toggle-info"><span>Payment Reminder</span><span>Send SMS reminders before due date</span></div>
              <label className="set-switch"><input type="checkbox" checked={form.smsReminder} onChange={toggleField("smsReminder")} /><span className="set-switch__track" /></label>
            </div>
            <div className="set-toggle-row">
              <div className="set-toggle-info"><span>OTP Delivery</span><span>Send one-time passwords via SMS for login verification</span></div>
              <label className="set-switch"><input type="checkbox" checked={form.smsOtp} onChange={toggleField("smsOtp")} /><span className="set-switch__track" /></label>
            </div>
          </div>
        </div>
      )}

      {form.whatsappEnabled && (
        <div className="set-section-box">
          <h3>WhatsApp Event Triggers</h3>
          <div className="set-toggle-list">
            <div className="set-toggle-row">
              <div className="set-toggle-info"><span>Invoice Copy</span><span>Send invoice document via WhatsApp</span></div>
              <label className="set-switch"><input type="checkbox" checked={form.waInvoice} onChange={toggleField("waInvoice")} /><span className="set-switch__track" /></label>
            </div>
            <div className="set-toggle-row">
              <div className="set-toggle-info"><span>Payment Confirmation</span><span>Send payment receipt via WhatsApp</span></div>
              <label className="set-switch"><input type="checkbox" checked={form.waPayment} onChange={toggleField("waPayment")} /><span className="set-switch__track" /></label>
            </div>
            <div className="set-toggle-row">
              <div className="set-toggle-info"><span>Payment Reminder</span><span>Send due-date reminders via WhatsApp</span></div>
              <label className="set-switch"><input type="checkbox" checked={form.waReminder} onChange={toggleField("waReminder")} /><span className="set-switch__track" /></label>
            </div>
          </div>
        </div>
      )}

      <div className="set-form-grid" style={{ marginTop: 20 }}>
        <div className="set-field">
          <label>Reminder Before (Days)</label>
          <input
            type="number"
            min="1"
            max="30"
            value={form.reminderDays}
            onChange={setFieldFromEvent("reminderDays")}
            onBlur={() => validateField("reminderDays")}
            className={errors.reminderDays ? "input-has-error" : ""}
          />
          <SetFieldMeta error={errors.reminderDays} />
        </div>
        <div className="set-field">
          <label>Overdue Escalation After (Days)</label>
          <input
            type="number"
            min="1"
            max="60"
            value={form.overdueEscalation}
            onChange={setFieldFromEvent("overdueEscalation")}
            onBlur={() => validateField("overdueEscalation")}
            className={errors.overdueEscalation ? "input-has-error" : ""}
          />
          <SetFieldMeta error={errors.overdueEscalation} />
        </div>
        <div className="set-field">
          <label>Message Template Prefix</label>
          <input
            value={form.templatePrefix}
            onChange={setFieldFromEvent("templatePrefix")}
            onBlur={() => validateField("templatePrefix")}
            maxLength={FIELD_LIMITS.templatePrefix}
            className={errors.templatePrefix ? "input-has-error" : ""}
            style={{ fontFamily: "var(--font-family)" }}
          />
          <SetFieldMeta error={errors.templatePrefix} />
          <span className="field-hint">Prefix used in all notification message templates</span>
        </div>
      </div>

      <div className="set-footer">
        <div className="set-footer-actions">
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleResetDefaults}>
            {icons.reset}
            Reset Defaults
          </button>
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleDiscard}>
            {icons.discard}
            Discard
          </button>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--icon" onClick={handleSave}>
              {icons.save}
              Save Notification Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================ Roles Panel ================================ */

function RolesPanel({ success, error, warning, openConfirm, hidden, initial, onSaved, canEdit = true }) {
  const { form, setField, dirty, reset, markClean } = useTabForm({ ...ROLES_DEFAULTS, ...(initial || {}) }, ROLES_DEFAULTS);

  async function handleSave() {
    try {
      const res = await settingsAPI.update({ roles: form });
      markClean();
      onSaved?.(res.data.data?.roles || form);
      success("Role permission settings saved successfully");
    } catch (err) {
      error(err.response?.data?.message || "Failed to save role settings");
    }
  }

  function handleDiscard() {
    if (!dirty) { warning("No changes to discard"); return; }
    openConfirm("Discard Changes", "Are you sure you want to discard all unsaved permission changes?", "danger", reset);
  }

  function handleResetDefaults() {
    openConfirm("Reset to Defaults", "This will reset all role permissions to factory defaults. This affects all new user assignments.", "danger", reset);
  }

  return (
    <div className="set-panel" hidden={hidden}>
      <div className="set-panel__header">
        <div className="set-panel__header-icon set-panel__header-icon--pine">
          {icons.shield}
        </div>
        <div>
          <h2>Role &amp; Permission Defaults</h2>
          <p className="set-panel-desc">
            Define default role assignments and access control rules for each
            module. These settings determine who can view, edit, or approve
            critical operations.
          </p>
        </div>
      </div>

      <div className="set-form-grid">
        <div className="set-field">
          <label>Default New User Role</label>
          <Dropdown value={form.defaultRole} onChange={(val) => setField("defaultRole", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
          <span className="field-hint">Automatically assigned when a new user is created</span>
        </div>
        <div className="set-field">
          <label>Invoice Approval Authority</label>
          <Dropdown value={form.invoiceApproval} onChange={(val) => setField("invoiceApproval", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Payment Approval Authority</label>
          <Dropdown value={form.paymentApproval} onChange={(val) => setField("paymentApproval", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Warranty Claim Approval</label>
          <Dropdown value={form.warrantyApproval} onChange={(val) => setField("warrantyApproval", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Lead Assignment Authority</label>
          <Dropdown value={form.leadAssignment} onChange={(val) => setField("leadAssignment", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Document Access Level</label>
          <Dropdown value={form.documentAccess} onChange={(val) => setField("documentAccess", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>System Settings Access</label>
          <Dropdown value={form.settingsAccess} onChange={(val) => setField("settingsAccess", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Report Export Authority</label>
          <Dropdown value={form.reportExport} onChange={(val) => setField("reportExport", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>User Management Authority</label>
          <Dropdown value={form.userManage} onChange={(val) => setField("userManage", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Inventory Access Level</label>
          <Dropdown value={form.inventoryAccess} onChange={(val) => setField("inventoryAccess", val)} options={DEFAULT_ROLES.map((r) => ({ value: r, label: r }))} variant="form" />
        </div>
      </div>

      <div className="set-footer">
        <div className="set-footer-actions">
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleResetDefaults}>
            {icons.reset}
            Reset Defaults
          </button>
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleDiscard}>
            {icons.discard}
            Discard
          </button>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--icon" onClick={handleSave}>
              {icons.save}
              Save Permission Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================ Regional Panel ================================ */

function RegionalPanel({ success, error, warning, openConfirm, hidden, initial, onSaved, canEdit = true }) {
  const { form, setField, setFieldFromEvent, toggleField, dirty, reset, markClean, errors, validateField, validateAll } = useTabForm({ ...REGIONAL_DEFAULTS, ...(initial || {}) }, REGIONAL_DEFAULTS, REGIONAL_VALIDATORS);

  async function handleSave() {
    if (!validateAll()) { warning("Please fix the highlighted fields before saving"); return; }
    if (!form.currency) { error("Currency is required"); return; }
    try {
      const res = await settingsAPI.update({ regional: form });
      markClean();
      onSaved?.(res.data.data?.regional || form);
      success("Regional settings saved successfully");
    } catch (err) {
      error(err.response?.data?.message || "Failed to save regional settings");
    }
  }

  function handleDiscard() {
    if (!dirty) { warning("No changes to discard"); return; }
    openConfirm("Discard Changes", "Are you sure you want to discard all unsaved regional settings?", "danger", reset);
  }

  function handleResetDefaults() {
    openConfirm("Reset to Defaults", "This will reset all regional settings to factory defaults (Indian locale).", "danger", reset);
  }

  return (
    <div className="set-panel" hidden={hidden}>
      <div className="set-panel__header">
        <div className="set-panel__header-icon set-panel__header-icon--gold">
          {icons.globe}
        </div>
        <div>
          <h2>Regional Settings</h2>
          <p className="set-panel-desc">
            Configure currency, timezone, language, date formats, and fiscal year
            preferences according to your business requirements.
          </p>
        </div>
      </div>

      <div className="set-form-grid">
        <div className="set-field">
          <label>Currency</label>
          <Dropdown value={form.currency} onChange={(val) => setField("currency", val)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Timezone</label>
          <Dropdown value={form.timezone} onChange={(val) => setField("timezone", val)} options={TIMEZONES.map((t) => ({ value: t, label: t }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Language</label>
          <Dropdown value={form.language} onChange={(val) => setField("language", val)} options={LANGUAGES.map((l) => ({ value: l, label: l }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Date Format</label>
          <Dropdown value={form.dateFormat} onChange={(val) => setField("dateFormat", val)} options={DATE_FORMATS.map((d) => ({ value: d, label: d }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Fiscal Year Start</label>
          <Dropdown value={form.fiscalYearStart} onChange={(val) => setField("fiscalYearStart", val)} options={MONTHS.map((m) => ({ value: m, label: m }))} variant="form" />
        </div>
        <div className="set-field">
          <label>Number Format</label>
          <Dropdown value={form.numberFormat} onChange={(val) => setField("numberFormat", val)} options={NUMBER_FORMATS} variant="form" />
        </div>
        <div className="set-field">
          <label>Default State</label>
          <input
            value={form.defaultState}
            onChange={setFieldFromEvent("defaultState")}
            onBlur={() => validateField("defaultState")}
            maxLength={FIELD_LIMITS.defaultState}
            className={errors.defaultState ? "input-has-error" : ""}
          />
          <SetFieldMeta error={errors.defaultState} />
          <span className="field-hint">Pre-filled for GST calculations and IGST determination</span>
        </div>
      </div>

      <div className="set-toggle-list">
        <div className="set-toggle-row">
          <div className="set-toggle-info">
            <span>Auto-detect Timezone</span>
            <span>Automatically set timezone based on user browser location</span>
          </div>
          <label className="set-switch">
            <input type="checkbox" checked={form.autoTz} onChange={toggleField("autoTz")} />
            <span className="set-switch__track" />
          </label>
        </div>
      </div>

      <div className="set-footer">
        <div className="set-footer-actions">
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleResetDefaults}>
            {icons.reset}
            Reset Defaults
          </button>
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleDiscard}>
            {icons.discard}
            Discard
          </button>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--icon" onClick={handleSave}>
              {icons.save}
              Save Regional Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================ Integrations Panel ================================ */

function IntegrationsPanel({ success, error, warning, openConfirm, hidden, initial, onSaved, canEdit = true }) {
  const { form, setField, setFieldFromEvent, toggleField, dirty, reset, markClean, errors, validateField, validateAll } = useTabForm({ ...INTEGRATIONS_DEFAULTS, ...(initial || {}) }, INTEGRATIONS_DEFAULTS, INTEGRATIONS_VALIDATORS);

  async function handleSave() {
    if (!validateAll()) { warning("Please fix the highlighted fields before saving"); return; }
    try {
      const res = await settingsAPI.update({ integrations: form });
      markClean();
      onSaved?.(res.data.data?.integrations || form);
      success("Integration settings saved successfully");
    } catch (err) {
      error(err.response?.data?.message || "Failed to save integration settings");
    }
  }

  function handleDiscard() {
    if (!dirty) { warning("No changes to discard"); return; }
    openConfirm("Discard Changes", "Are you sure you want to discard all unsaved integration settings?", "danger", reset);
  }

  function handleResetDefaults() {
    openConfirm("Reset to Defaults", "This will disconnect all integrations and reset API keys. You will need to reconfigure them.", "danger", reset);
  }

  function StatusBadge({ connected }) {
    return (
      <span className={`set-integration-status set-integration-status--${connected ? "connected" : "disconnected"}`}>
        <span className="set-integration-status__dot" />
        {connected ? "Connected" : "Disconnected"}
      </span>
    );
  }

  return (
    <div className="set-panel" hidden={hidden}>
      <div className="set-panel__header">
        <div className="set-panel__header-icon set-panel__header-icon--pine">
          {icons.plug}
        </div>
        <div>
          <h2>System Integrations</h2>
          <p className="set-panel-desc">
            Connect payment gateways, SMS providers, WhatsApp APIs, email
            services, and government APIs to power your platform.
          </p>
        </div>
      </div>

      {/* Razorpay */}
      <div className="set-section-box">
        <div className="set-section-header">
          <h3>Razorpay Payment Gateway</h3>
          <StatusBadge connected={form.razorpayConnected} />
        </div>
        <p className="set-section-desc">Accept online payments via UPI, cards, net banking, and wallets.</p>
        <div className="set-form-grid">
          <div className="set-field">
            <label>API Key (Live)</label>
            <input
              value={form.razorpayKey}
              onChange={setFieldFromEvent("razorpayKey")}
              onBlur={() => validateField("razorpayKey")}
              maxLength={FIELD_LIMITS.razorpayKey}
              className={errors.razorpayKey ? "input-has-error" : ""}
              style={{ fontFamily: "var(--font-family)" }}
            />
            <SetFieldMeta error={errors.razorpayKey} />
          </div>
          <div className="set-field">
            <label>API Secret</label>
            <input
              type="password"
              value={form.razorpaySecret}
              onChange={setFieldFromEvent("razorpaySecret")}
              onBlur={() => validateField("razorpaySecret")}
              maxLength={FIELD_LIMITS.razorpaySecret}
              className={errors.razorpaySecret ? "input-has-error" : ""}
              placeholder="Enter secret key"
            />
            <SetFieldMeta error={errors.razorpaySecret} />
          </div>
        </div>
        <div className="set-toggle-list" style={{ marginTop: 12 }}>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Enable Razorpay</span><span>Activate online payment collection via Razorpay</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.razorpayConnected} onChange={toggleField("razorpayConnected")} /><span className="set-switch__track" /></label>
          </div>
        </div>
      </div>

      {/* SMS */}
      <div className="set-section-box">
        <div className="set-section-header">
          <h3>SMS Gateway (MSG91)</h3>
          <StatusBadge connected={form.smsConnected} />
        </div>
        <p className="set-section-desc">Send transactional and OTP SMS messages to customers and staff.</p>
        <div className="set-form-grid">
          <div className="set-field">
            <label>SMS Provider</label>
            <Dropdown value={form.smsProvider} onChange={(val) => setField("smsProvider", val)} options={SMS_PROVIDERS} variant="form" />
          </div>
          <div className="set-field">
            <label>API Key</label>
            <input
              type="password"
              value={form.smsApiKey}
              onChange={setFieldFromEvent("smsApiKey")}
              onBlur={() => validateField("smsApiKey")}
              maxLength={FIELD_LIMITS.smsApiKey}
              className={errors.smsApiKey ? "input-has-error" : ""}
              placeholder="Enter SMS API key"
            />
            <SetFieldMeta error={errors.smsApiKey} />
          </div>
        </div>
        <div className="set-toggle-list" style={{ marginTop: 12 }}>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Enable SMS</span><span>Activate SMS notifications and OTP delivery</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.smsConnected} onChange={toggleField("smsConnected")} /><span className="set-switch__track" /></label>
          </div>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="set-section-box">
        <div className="set-section-header">
          <h3>WhatsApp Business API</h3>
          <StatusBadge connected={form.whatsappConnected} />
        </div>
        <p className="set-section-desc">Send invoice copies, payment reminders, and updates via WhatsApp.</p>
        <div className="set-form-grid">
          <div className="set-field set-field--full">
            <label>API Base URL</label>
            <input
              value={form.whatsappApiUrl}
              onChange={setFieldFromEvent("whatsappApiUrl")}
              onBlur={() => validateField("whatsappApiUrl")}
              maxLength={FIELD_LIMITS.whatsappApiUrl}
              className={errors.whatsappApiUrl ? "input-has-error" : ""}
              style={{ fontFamily: "var(--font-family)" }}
            />
            <SetFieldMeta error={errors.whatsappApiUrl} />
          </div>
          <div className="set-field">
            <label>Access Token</label>
            <input
              type="password"
              value={form.whatsappToken}
              onChange={setFieldFromEvent("whatsappToken")}
              onBlur={() => validateField("whatsappToken")}
              maxLength={FIELD_LIMITS.whatsappToken}
              className={errors.whatsappToken ? "input-has-error" : ""}
              placeholder="Enter token"
            />
            <SetFieldMeta error={errors.whatsappToken} />
          </div>
          <div className="set-field">
            <label>Phone Number ID</label>
            <input
              value={form.whatsappPhoneId}
              onChange={setFieldFromEvent("whatsappPhoneId")}
              onBlur={() => validateField("whatsappPhoneId")}
              maxLength={FIELD_LIMITS.whatsappPhoneId}
              className={errors.whatsappPhoneId ? "input-has-error" : ""}
              placeholder="e.g. 1234567890"
            />
            <SetFieldMeta error={errors.whatsappPhoneId} />
          </div>
        </div>
        <div className="set-toggle-list" style={{ marginTop: 12 }}>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Enable WhatsApp</span><span>Activate WhatsApp Business messaging</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.whatsappConnected} onChange={toggleField("whatsappConnected")} /><span className="set-switch__track" /></label>
          </div>
        </div>
      </div>

      {/* Email */}
      <div className="set-section-box">
        <div className="set-section-header">
          <h3>Email Service (SMTP)</h3>
          <StatusBadge connected={form.emailConnected} />
        </div>
        <p className="set-section-desc">Configure SMTP for sending invoices, receipts, and notification emails.</p>
        <div className="set-form-grid">
          <div className="set-field">
            <label>Email Provider</label>
            <Dropdown value={form.emailProvider} onChange={(val) => setField("emailProvider", val)} options={EMAIL_PROVIDERS} variant="form" />
          </div>
          <div className="set-field">
            <label>SMTP Host</label>
            <input
              value={form.emailHost}
              onChange={setFieldFromEvent("emailHost")}
              onBlur={() => validateField("emailHost")}
              maxLength={FIELD_LIMITS.emailHost}
              className={errors.emailHost ? "input-has-error" : ""}
            />
            <SetFieldMeta error={errors.emailHost} />
          </div>
          <div className="set-field">
            <label>SMTP Port</label>
            <input
              value={form.emailPort}
              onChange={setFieldFromEvent("emailPort")}
              onBlur={() => validateField("emailPort")}
              maxLength={FIELD_LIMITS.emailPort}
              className={errors.emailPort ? "input-has-error" : ""}
            />
            <SetFieldMeta error={errors.emailPort} />
          </div>
          <div className="set-field">
            <label>Username / Email</label>
            <input
              value={form.emailUser}
              onChange={setFieldFromEvent("emailUser")}
              onBlur={() => validateField("emailUser")}
              maxLength={FIELD_LIMITS.emailUser}
              className={errors.emailUser ? "input-has-error" : ""}
            />
            <SetFieldMeta error={errors.emailUser} />
          </div>
          <div className="set-field">
            <label>Password</label>
            <input
              type="password"
              value={form.emailPass}
              onChange={setFieldFromEvent("emailPass")}
              onBlur={() => validateField("emailPass")}
              maxLength={FIELD_LIMITS.emailPass}
              className={errors.emailPass ? "input-has-error" : ""}
              placeholder="Enter SMTP password"
            />
            <SetFieldMeta error={errors.emailPass} />
          </div>
        </div>
        <div className="set-toggle-list" style={{ marginTop: 12 }}>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Enable Email</span><span>Activate email delivery for all system notifications</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.emailConnected} onChange={toggleField("emailConnected")} /><span className="set-switch__track" /></label>
          </div>
        </div>
      </div>

      {/* GST API */}
      <div className="set-section-box">
        <div className="set-section-header">
          <h3>GST Government API</h3>
          <StatusBadge connected={form.gstApiEnabled} />
        </div>
        <p className="set-section-desc">Auto-verify GSTIN numbers and fetch taxpayer details from the GST portal.</p>
        <div className="set-form-grid">
          <div className="set-field set-field--full">
            <label>API Key</label>
            <input
              value={form.gstApiKey}
              onChange={setFieldFromEvent("gstApiKey")}
              onBlur={() => validateField("gstApiKey")}
              maxLength={FIELD_LIMITS.gstApiKey}
              className={errors.gstApiKey ? "input-has-error" : ""}
              style={{ fontFamily: "var(--font-family)" }}
            />
            <SetFieldMeta error={errors.gstApiKey} />
          </div>
        </div>
        <div className="set-toggle-list" style={{ marginTop: 12 }}>
          <div className="set-toggle-row">
            <div className="set-toggle-info"><span>Enable GST Verification</span><span>Automatically verify GSTIN and fetch business details during invoice creation</span></div>
            <label className="set-switch"><input type="checkbox" checked={form.gstApiEnabled} onChange={toggleField("gstApiEnabled")} /><span className="set-switch__track" /></label>
          </div>
        </div>
      </div>

      <div className="set-footer">
        <div className="set-footer-actions">
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleResetDefaults}>
            {icons.reset}
            Reset Defaults
          </button>
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleDiscard}>
            {icons.discard}
            Discard
          </button>
          {canEdit && (
            <button type="button" className="btn btn--primary btn--icon" onClick={handleSave}>
              {icons.save}
              Save Integration Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
