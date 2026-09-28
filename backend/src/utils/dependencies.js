/**
 * [FLOW-06] Dependency tracking between modules.
 *
 * Before deleting any entity, check for linked records across modules.
 * Returns an object with `canDelete` (boolean), `dependencies` (array of
 * { module, count, label }), and a human-readable `message`.
 *
 * Usage in a controller:
 *   const check = await checkDependencies("lead", { leadId: record.leadId });
 *   if (!check.canDelete) {
 *       return res.status(400).json({ success: false, message: check.message });
 *   }
 */

import Quotation from "../models/quotation.model.js";
import Installation from "../models/installation.model.js";
import ProjectApproval from "../models/projectApproval.model.js";
import SiteSurvey from "../models/siteSurvey.model.js";
import SolarDesign from "../models/solarDesign.model.js";
import Testing from "../models/testing.model.js";
import CommissioningAndHandover from "../models/commissioningAndHandover.model.js";
import FollowUp from "../models/followUp.model.js";
import DailyProgressLog from "../models/dailyProgressLog.model.js";
import AMC from "../models/amc.model.js";
import Invoice from "../models/invoice.model.js";
import MaintenanceTicket from "../models/maintenanceTicket.model.js";
import Subsidy from "../models/subsidy.model.js";
import Warranty from "../models/warranty.model.js";
import WarrantyClaim from "../models/warrantyClaim.model.js";
import Lead from "../models/lead.model.js";
import Customer from "../models/customer.model.js";
import Activity from "../models/activity.model.js";

/**
 * Check dependencies for a LEAD before deletion.
 * A lead can be linked to quotations, installations, approvals, surveys, etc.
 */
async function checkLeadDependencies(ids) {
    const { leadId, customerId } = ids;
    if (!leadId) return { canDelete: true, dependencies: [], message: "" };

    const deps = [];
    const checks = [
        { model: Quotation, label: "Quotation", query: { leadId } },
        { model: Installation, label: "Installation", query: { leadId } },
        { model: ProjectApproval, label: "Project Approval", query: { leadId } },
        { model: SiteSurvey, label: "Site Survey", query: { leadId } },
        { model: SolarDesign, label: "Solar Design", query: { leadId } },
        { model: Testing, label: "Testing", query: { leadId } },
        { model: CommissioningAndHandover, label: "Commissioning", query: { leadId } },
        { model: FollowUp, label: "Follow-up", query: { leadId } },
        { model: DailyProgressLog, label: "Daily Progress Log", query: { leadId } },
        { model: Invoice, label: "Invoice", query: { leadId } },
        { model: Subsidy, label: "Subsidy", query: { leadId } },
    ];

    // A lead that is linked to a customer (converted from a lead, or the
    // auto-created lead that accompanies a manually added customer) must not be
    // deletable — the customer depends on it. Query the customer by its
    // CUS-xxx id which both records share.
    if (customerId) {
        checks.push({ model: Customer, label: "Customer", query: { customerId } });
    }

    const results = await Promise.all(
        checks.map(async ({ model, label, query }) => {
            const count = await model.countDocuments(query);
            return count > 0 ? { module: label, count } : null;
        })
    );

    results.filter(Boolean).forEach((r) => deps.push(r));
    return buildResult(deps);
}

/**
 * Check dependencies for a CUSTOMER before deletion.
 */
async function checkCustomerDependencies(ids) {
    const { customerId, name, email } = ids;
    const deps = [];

    // Build customer matching filter
    const customerFilter = {};
    if (customerId) customerFilter.customerId = customerId;
    if (name) customerFilter.customer = name;
    if (email) customerFilter.email = email;

    const orFilter = [];
    if (customerId) orFilter.push({ customerId });
    if (name) orFilter.push({ customer: name }, { customerName: name });
    if (email) orFilter.push({ email });

    if (orFilter.length === 0) return { canDelete: true, dependencies: [], message: "" };

    const baseFilter = { $or: orFilter };

    const checks = [
        { model: Quotation, label: "Quotation" },
        { model: Installation, label: "Installation" },
        { model: ProjectApproval, label: "Project Approval" },
        { model: SiteSurvey, label: "Site Survey" },
        { model: AMC, label: "AMC" },
        { model: MaintenanceTicket, label: "Maintenance Ticket" },
        { model: Lead, label: "Lead" },
        { model: Invoice, label: "Invoice" },
        { model: Warranty, label: "Warranty" },
    ];

    const results = await Promise.all(
        checks.map(async ({ model, label }) => {
            const count = await model.countDocuments(baseFilter);
            return count > 0 ? { module: label, count } : null;
        })
    );

    results.filter(Boolean).forEach((r) => deps.push(r));
    return buildResult(deps);
}

/**
 * Check dependencies for an INSTALLATION before deletion.
 */
async function checkInstallationDependencies(ids) {
    const { installationId, leadId } = ids;
    const deps = [];

    const filter = {};
    if (installationId) filter.installationId = installationId;
    if (leadId) filter.leadId = leadId;

    if (Object.keys(filter).length === 0) return { canDelete: true, dependencies: [], message: "" };

    const checks = [
        { model: Testing, label: "Testing", query: { leadId } },
        { model: CommissioningAndHandover, label: "Commissioning", query: { leadId } },
        { model: DailyProgressLog, label: "Daily Progress Log", query: { leadId } },
    ];

    const results = await Promise.all(
        checks.map(async ({ model, label, query }) => {
            if (!query.leadId) return null;
            const count = await model.countDocuments(query);
            return count > 0 ? { module: label, count } : null;
        })
    );

    results.filter(Boolean).forEach((r) => deps.push(r));
    return buildResult(deps);
}

/**
 * Check dependencies for a QUOTATION before deletion.
 */
async function checkQuotationDependencies(ids) {
    const { quotationId, leadId } = ids;
    const deps = [];

    const checks = [
        { model: Installation, label: "Installation", query: { leadId } },
        { model: CommissioningAndHandover, label: "Commissioning", query: { leadId } },
        { model: ProjectApproval, label: "Project Approval", query: { leadId } },
    ];

    const results = await Promise.all(
        checks.map(async ({ model, label, query }) => {
            if (!query.leadId) return null;
            const count = await model.countDocuments(query);
            return count > 0 ? { module: label, count } : null;
        })
    );

    results.filter(Boolean).forEach((r) => deps.push(r));
    return buildResult(deps);
}

/**
 * Build a human-readable result from a dependency list.
 */
function buildResult(deps) {
    if (deps.length === 0) {
        return { canDelete: true, dependencies: [], message: "" };
    }

    const parts = deps.map((d) => `${d.count} ${d.module}${d.count > 1 ? "s" : ""}`);
    const message = `Cannot delete: this record is linked to ${parts.join(", ")}. Delete or unlink these records first.`;

    return { canDelete: false, dependencies: deps, message };
}

/**
 * Main entry point — dispatches to the correct checker based on entity type.
 * @param {"lead"|"customer"|"installation"|"quotation"} entityType
 * @param {Object} ids - Identifiers to check (e.g. { leadId, customerId })
 */
export const checkDependencies = async (entityType, ids) => {
    switch (entityType) {
        case "lead":
            return checkLeadDependencies(ids);
        case "customer":
            return checkCustomerDependencies(ids);
        case "installation":
            return checkInstallationDependencies(ids);
        case "quotation":
            return checkQuotationDependencies(ids);
        default:
            return { canDelete: true, dependencies: [], message: "" };
    }
};
