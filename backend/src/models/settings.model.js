import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
    {
        name: { type: String, default: "" },
        // Base64 data-URL of the uploaded company logo (e.g. data:image/png;base64,...)
        logo: { type: String, default: "" },
        gstin: { type: String, default: "" },
        state: { type: String, default: "" },
        address: { type: String, default: "" },
        phone: { type: String, default: "" },
        email: { type: String, default: "" },
        website: { type: String, default: "" },
        tagline: { type: String, default: "" }
    },
    { _id: false }
);

const taxSchema = new mongoose.Schema(
    {
        defaultGstRate: { type: String, default: "18%" },
        cgstEnabled: { type: Boolean, default: true },
        sgstEnabled: { type: Boolean, default: true },
        igstEnabled: { type: Boolean, default: true },
        gstOnProducts: { type: String, default: "18%" },
        gstOnServices: { type: String, default: "18%" },
        gstOnInstallation: { type: String, default: "18%" },
        hsnCode: { type: String, default: "" },
        sacCode: { type: String, default: "" },
        taxInvoicePrefix: { type: String, default: "INV" },
        creditNotePrefix: { type: String, default: "CN" },
        autoGstCalc: { type: Boolean, default: true },
        reverseCharge: { type: Boolean, default: false }
    },
    { _id: false }
);

const notificationsSchema = new mongoose.Schema(
    {
        emailEnabled: { type: Boolean, default: true },
        smsEnabled: { type: Boolean, default: true },
        whatsappEnabled: { type: Boolean, default: false },
        emailInvoice: { type: Boolean, default: true },
        emailPayment: { type: Boolean, default: true },
        emailReminder: { type: Boolean, default: true },
        emailWarranty: { type: Boolean, default: false },
        smsInvoice: { type: Boolean, default: false },
        smsPayment: { type: Boolean, default: true },
        smsReminder: { type: Boolean, default: true },
        smsOtp: { type: Boolean, default: true },
        waInvoice: { type: Boolean, default: false },
        waPayment: { type: Boolean, default: true },
        waReminder: { type: Boolean, default: false },
        reminderDays: { type: String, default: "3" },
        overdueEscalation: { type: String, default: "7" },
        templatePrefix: { type: String, default: "SOLAR" }
    },
    { _id: false }
);

const rolesConfigSchema = new mongoose.Schema(
    {
        defaultRole: { type: String, default: "Technician" },
        invoiceApproval: { type: String, default: "Admin" },
        paymentApproval: { type: String, default: "Manager" },
        warrantyApproval: { type: String, default: "Admin" },
        leadAssignment: { type: String, default: "Sales" },
        documentAccess: { type: String, default: "Admin" },
        settingsAccess: { type: String, default: "Admin" },
        reportExport: { type: String, default: "Manager" },
        userManage: { type: String, default: "Admin" },
        inventoryAccess: { type: String, default: "Engineer" }
    },
    { _id: false }
);

const regionalSchema = new mongoose.Schema(
    {
        currency: { type: String, default: "INR (₹)" },
        timezone: { type: String, default: "Asia/Kolkata (IST, UTC+5:30)" },
        language: { type: String, default: "English" },
        dateFormat: { type: String, default: "DD/MM/YYYY" },
        fiscalYearStart: { type: String, default: "April" },
        numberFormat: { type: String, default: "Indian (1,23,456)" },
        defaultState: { type: String, default: "Gujarat" },
        autoTz: { type: Boolean, default: true }
    },
    { _id: false }
);

const integrationsSchema = new mongoose.Schema(
    {
        razorpayKey: { type: String, default: "" },
        razorpaySecret: { type: String, default: "" },
        razorpayConnected: { type: Boolean, default: false },
        smsProvider: { type: String, default: "" },
        smsApiKey: { type: String, default: "" },
        smsConnected: { type: Boolean, default: false },
        whatsappApiUrl: { type: String, default: "" },
        whatsappToken: { type: String, default: "" },
        whatsappPhoneId: { type: String, default: "" },
        whatsappConnected: { type: Boolean, default: false },
        emailProvider: { type: String, default: "" },
        emailHost: { type: String, default: "" },
        emailPort: { type: String, default: "" },
        emailUser: { type: String, default: "" },
        emailPass: { type: String, default: "" },
        emailConnected: { type: Boolean, default: false },
        gstApiEnabled: { type: Boolean, default: false },
        gstApiKey: { type: String, default: "" }
    },
    { _id: false }
);

const settingsSchema = new mongoose.Schema(
    {
        company: {
            type: companySchema,
            default: () => ({})
        },
        tax: {
            type: taxSchema,
            default: () => ({})
        },
        notifications: {
            type: notificationsSchema,
            default: () => ({})
        },
        roles: {
            type: rolesConfigSchema,
            default: () => ({})
        },
        regional: {
            type: regionalSchema,
            default: () => ({})
        },
        integrations: {
            type: integrationsSchema,
            default: () => ({})
        }
    },
    {
        timestamps: true
    }
);

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
