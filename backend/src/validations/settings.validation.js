import Joi from "joi";

const companySchema = Joi.object({
    name: Joi.string().trim().max(50).messages({ "string.max": "Company name cannot exceed 50 characters" }).allow("").optional(),
    logo: Joi.string().max(3500000).messages({ "string.max": "Logo image is too large" }).allow("").optional(),
    gstin: Joi.string().trim().max(15).messages({ "string.max": "GSTIN cannot exceed 15 characters" }).allow("").optional(),
    state: Joi.string().trim().max(40).messages({ "string.max": "State cannot exceed 40 characters" }).allow("").optional(),
    address: Joi.string().trim().max(200).messages({ "string.max": "Address cannot exceed 200 characters" }).allow("").optional(),
    phone: Joi.string().trim().max(14).messages({ "string.max": "Phone number cannot exceed 14 digits" }).allow("").optional(),
    email: Joi.string().trim().max(80).messages({ "string.max": "Email cannot exceed 80 characters" }).allow("").optional(),
    website: Joi.string().trim().max(80).messages({ "string.max": "Website cannot exceed 80 characters" }).allow("").optional(),
    tagline: Joi.string().trim().max(120).messages({ "string.max": "Tagline cannot exceed 120 characters" }).allow("").optional()
});

const taxSchema = Joi.object({
    defaultGstRate: Joi.string().trim().max(10).messages({ "string.max": "Default GST rate cannot exceed 10 characters" }).allow("").optional(),
    cgstEnabled: Joi.boolean().optional(),
    sgstEnabled: Joi.boolean().optional(),
    igstEnabled: Joi.boolean().optional(),
    gstOnProducts: Joi.string().trim().max(10).messages({ "string.max": "GST on products cannot exceed 10 characters" }).allow("").optional(),
    gstOnServices: Joi.string().trim().max(10).messages({ "string.max": "GST on services cannot exceed 10 characters" }).allow("").optional(),
    gstOnInstallation: Joi.string().trim().max(10).messages({ "string.max": "GST on installation cannot exceed 10 characters" }).allow("").optional(),
    hsnCode: Joi.string().trim().max(8).messages({ "string.max": "HSN code cannot exceed 8 characters" }).allow("").optional(),
    sacCode: Joi.string().trim().max(8).messages({ "string.max": "SAC code cannot exceed 8 characters" }).allow("").optional(),
    taxInvoicePrefix: Joi.string().trim().max(10).messages({ "string.max": "Invoice prefix cannot exceed 10 characters" }).allow("").optional(),
    creditNotePrefix: Joi.string().trim().max(10).messages({ "string.max": "Credit note prefix cannot exceed 10 characters" }).allow("").optional(),
    autoGstCalc: Joi.boolean().optional(),
    reverseCharge: Joi.boolean().optional()
});

const notificationsSchema = Joi.object({
    emailEnabled: Joi.boolean().optional(),
    smsEnabled: Joi.boolean().optional(),
    whatsappEnabled: Joi.boolean().optional(),
    emailInvoice: Joi.boolean().optional(),
    emailPayment: Joi.boolean().optional(),
    emailReminder: Joi.boolean().optional(),
    emailWarranty: Joi.boolean().optional(),
    smsInvoice: Joi.boolean().optional(),
    smsPayment: Joi.boolean().optional(),
    smsReminder: Joi.boolean().optional(),
    smsOtp: Joi.boolean().optional(),
    waInvoice: Joi.boolean().optional(),
    waPayment: Joi.boolean().optional(),
    waReminder: Joi.boolean().optional(),
    reminderDays: Joi.string().trim().max(2).messages({ "string.max": "Reminder days cannot exceed 2 digits" }).pattern(/^\d*$/, "Reminder days must be a number").custom((value, helpers) => {
        if (value !== "" && (Number(value) < 1 || Number(value) > 30)) {
            return helpers.message("Reminder days must be between 1 and 30");
        }
        return value;
    }, "Reminder days range check").allow("").optional(),
    overdueEscalation: Joi.string().trim().max(2).messages({ "string.max": "Escalation days cannot exceed 2 digits" }).pattern(/^\d*$/, "Escalation days must be a number").custom((value, helpers) => {
        if (value !== "" && (Number(value) < 1 || Number(value) > 60)) {
            return helpers.message("Escalation days must be between 1 and 60");
        }
        return value;
    }, "Escalation days range check").allow("").optional(),
    templatePrefix: Joi.string().trim().max(20).messages({ "string.max": "Template prefix cannot exceed 20 characters" }).allow("").optional()
});

const rolesConfigSchema = Joi.object({
    defaultRole: Joi.string().trim().max(20).messages({ "string.max": "Default role cannot exceed 20 characters" }).allow("").optional(),
    invoiceApproval: Joi.string().trim().max(20).messages({ "string.max": "Invoice approval cannot exceed 20 characters" }).allow("").optional(),
    paymentApproval: Joi.string().trim().max(20).messages({ "string.max": "Payment approval cannot exceed 20 characters" }).allow("").optional(),
    warrantyApproval: Joi.string().trim().max(20).messages({ "string.max": "Warranty approval cannot exceed 20 characters" }).allow("").optional(),
    leadAssignment: Joi.string().trim().max(20).messages({ "string.max": "Lead assignment cannot exceed 20 characters" }).allow("").optional(),
    documentAccess: Joi.string().trim().max(20).messages({ "string.max": "Document access cannot exceed 20 characters" }).allow("").optional(),
    settingsAccess: Joi.string().trim().max(20).messages({ "string.max": "Settings access cannot exceed 20 characters" }).allow("").optional(),
    reportExport: Joi.string().trim().max(20).messages({ "string.max": "Report export cannot exceed 20 characters" }).allow("").optional(),
    userManage: Joi.string().trim().max(20).messages({ "string.max": "User management cannot exceed 20 characters" }).allow("").optional(),
    inventoryAccess: Joi.string().trim().max(20).messages({ "string.max": "Inventory access cannot exceed 20 characters" }).allow("").optional()
});

const regionalSchema = Joi.object({
    currency: Joi.string().trim().max(20).messages({ "string.max": "Currency cannot exceed 20 characters" }).allow("").optional(),
    timezone: Joi.string().trim().max(60).messages({ "string.max": "Timezone cannot exceed 60 characters" }).allow("").optional(),
    language: Joi.string().trim().max(30).messages({ "string.max": "Language cannot exceed 30 characters" }).allow("").optional(),
    dateFormat: Joi.string().trim().max(20).messages({ "string.max": "Date format cannot exceed 20 characters" }).allow("").optional(),
    fiscalYearStart: Joi.string().trim().max(20).messages({ "string.max": "Fiscal year cannot exceed 20 characters" }).allow("").optional(),
    numberFormat: Joi.string().trim().max(30).messages({ "string.max": "Number format cannot exceed 30 characters" }).allow("").optional(),
    defaultState: Joi.string().trim().max(40).messages({ "string.max": "Default state cannot exceed 40 characters" }).allow("").optional(),
    autoTz: Joi.boolean().optional()
});

const integrationsSchema = Joi.object({
    razorpayKey: Joi.string().trim().max(64).messages({ "string.max": "Razorpay key cannot exceed 64 characters" }).allow("").optional(),
    razorpaySecret: Joi.string().trim().max(64).messages({ "string.max": "Razorpay secret cannot exceed 64 characters" }).allow("").optional(),
    razorpayConnected: Joi.boolean().optional(),
    smsProvider: Joi.string().trim().max(20).messages({ "string.max": "SMS provider cannot exceed 20 characters" }).allow("").optional(),
    smsApiKey: Joi.string().trim().max(64).messages({ "string.max": "SMS API key cannot exceed 64 characters" }).allow("").optional(),
    smsConnected: Joi.boolean().optional(),
    whatsappApiUrl: Joi.string().trim().max(120).messages({ "string.max": "WhatsApp API URL cannot exceed 120 characters" }).allow("").optional(),
    whatsappToken: Joi.string().trim().max(200).messages({ "string.max": "WhatsApp token cannot exceed 200 characters" }).allow("").optional(),
    whatsappPhoneId: Joi.string().trim().max(20).messages({ "string.max": "WhatsApp phone ID cannot exceed 20 characters" }).allow("").optional(),
    whatsappConnected: Joi.boolean().optional(),
    emailProvider: Joi.string().trim().max(20).messages({ "string.max": "Email provider cannot exceed 20 characters" }).allow("").optional(),
    emailHost: Joi.string().trim().max(80).messages({ "string.max": "SMTP host cannot exceed 80 characters" }).allow("").optional(),
    emailPort: Joi.string().trim().max(5).messages({ "string.max": "SMTP port cannot exceed 5 digits" }).pattern(/^\d*$/, "SMTP port must be a number").custom((value, helpers) => {
        if (value !== "" && (Number(value) < 1 || Number(value) > 65535)) {
            return helpers.message("SMTP port must be between 1 and 65535");
        }
        return value;
    }, "SMTP port range check").allow("").optional(),
    emailUser: Joi.string().trim().max(80).messages({ "string.max": "SMTP username cannot exceed 80 characters" }).allow("").optional(),
    emailPass: Joi.string().trim().max(80).messages({ "string.max": "SMTP password cannot exceed 80 characters" }).allow("").optional(),
    emailConnected: Joi.boolean().optional(),
    gstApiEnabled: Joi.boolean().optional(),
    gstApiKey: Joi.string().trim().max(64).messages({ "string.max": "GST API key cannot exceed 64 characters" }).allow("").optional()
});

export const validateUpdateSettings = Joi.object({
    company: companySchema.optional(),
    tax: taxSchema.optional(),
    notifications: notificationsSchema.optional(),
    roles: rolesConfigSchema.optional(),
    regional: regionalSchema.optional(),
    integrations: integrationsSchema.optional()
});

export const validateUpsertSettings = Joi.object({
    company: companySchema.optional(),
    tax: taxSchema.optional(),
    notifications: notificationsSchema.optional(),
    roles: rolesConfigSchema.optional(),
    regional: regionalSchema.optional(),
    integrations: integrationsSchema.optional()
});
