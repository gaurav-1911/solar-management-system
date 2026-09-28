import Customer from "../models/customer.model.js";
import Lead from "../models/lead.model.js";
import Quotation from "../models/quotation.model.js";

export const getCustomerScope = async (userEmail) => {
    const email = String(userEmail || "").trim().toLowerCase();
    if (!email) return null;
    const [customers, leads] = await Promise.all([
        Customer.find({ email }).select("name customerId").lean(),
        Lead.find({ email }).select("name leadId").lean()
    ]);
    const names = [...new Set([
        ...customers.map((c) => c.name),
        ...leads.map((l) => l.name)
    ].filter(Boolean))];
    return {
        names,
        customerIds: customers.map((c) => c.customerId).filter(Boolean),
        leadIds: leads.map((l) => l.leadId).filter(Boolean),
        email
    };
};

/**
 * Merge ownership $or clauses into a query filter, combining with any existing
 * $or (e.g. from search) so BOTH apply. When no clauses resolve, the filter
 * matches nothing — a logged-in user never sees another user's data.
 */
export const mergeOwnershipFilter = (filter, orClauses) => {
    const clauses = (orClauses || []).filter(Boolean);
    if (!clauses.length) {
        filter._id = { $exists: false };
        return;
    }
    if (filter.$or) {
        filter.$and = [{ $or: clauses }, { $or: filter.$or }];
        delete filter.$or;
    } else {
        filter.$or = clauses;
    }
};

export const isDocOwnedByCustomer = (doc, scope) => {
    if (!doc || !scope) return false;
    if (scope.email && doc.email && String(doc.email).trim().toLowerCase() === scope.email) {
        return true;
    }
    if (scope.names.length) {
        const docName = doc.customerName || doc.customer || doc.entity || "";
        if (scope.names.includes(docName)) return true;
    }
    if (scope.customerIds.length && doc.customerId && scope.customerIds.includes(doc.customerId)) {
        return true;
    }
    if (scope.leadIds.length && doc.leadId && scope.leadIds.includes(doc.leadId)) {
        return true;
    }
    return false;
};

export const getSalesScope = async (salesName) => {
    const name = String(salesName || "").trim();
    if (!name) return null;

    const leads = await Lead.find({ assigned: name })
        .select("leadId customerId email")
        .lean();
    const leadIds = leads.map((l) => l.leadId).filter(Boolean);
    const leadCustomerIds = leads.map((l) => l.customerId).filter(Boolean);
    const leadEmails = leads
        .map((l) => String(l.email || "").trim().toLowerCase())
        .filter(Boolean);

    const customerOr = [];
    if (leadCustomerIds.length) customerOr.push({ customerId: { $in: leadCustomerIds } });
    if (leadEmails.length) customerOr.push({ email: { $in: leadEmails } });
    const customers = customerOr.length
        ? await Customer.find({ $or: customerOr }).select("customerId name email").lean()
        : [];

    const customerIds = [...new Set([
        ...leadCustomerIds,
        ...customers.map((c) => c.customerId).filter(Boolean)
    ])];
    const customerNames = [...new Set(customers.map((c) => c.name).filter(Boolean))];
    const emails = [...new Set([
        ...leadEmails,
        ...customers.map((c) => String(c.email || "").trim().toLowerCase()).filter(Boolean)
    ])];

    const quotationOr = [];
    if (leadIds.length) quotationOr.push({ leadId: { $in: leadIds } });
    if (customerIds.length) quotationOr.push({ customerId: { $in: customerIds } });
    const quotations = quotationOr.length
        ? await Quotation.find({ $or: quotationOr }).select("quotationId").lean()
        : [];
    const quotationIds = quotations.map((q) => q.quotationId).filter(Boolean);

    return { name, leadIds, customerIds, customerNames, emails, quotationIds };
};


export const isDocOwnedBySales = (doc, scope) => {
    if (!doc || !scope) return false;
    if (scope.leadIds.length && doc.leadId && scope.leadIds.includes(doc.leadId)) return true;
    if (scope.customerIds.length && doc.customerId && scope.customerIds.includes(doc.customerId)) return true;
    if (scope.emails.length && doc.email && scope.emails.includes(String(doc.email).trim().toLowerCase())) return true;
    if (scope.customerNames.length) {
        const docName = doc.customerName || doc.customer || doc.entity || doc.client || "";
        if (scope.customerNames.includes(docName)) return true;
    }
    if (scope.quotationIds.length && doc.quotationId && scope.quotationIds.includes(doc.quotationId)) return true;
    return false;
};


export const mergeSalesOwnershipFilter = (filter, scope) => {
    if (!scope) {
        filter._id = { $exists: false };
        return;
    }
    const clauses = [];
    if (scope.leadIds.length) clauses.push({ leadId: { $in: scope.leadIds } });
    if (scope.customerIds.length) clauses.push({ customerId: { $in: scope.customerIds } });
    if (scope.customerNames.length) clauses.push({ customerName: { $in: scope.customerNames } });
    if (scope.emails.length) clauses.push({ email: { $in: scope.emails } });
    if (scope.quotationIds.length) clauses.push({ quotationId: { $in: scope.quotationIds } });
    mergeOwnershipFilter(filter, clauses);
};


export const isDocOwnedByTechnician = (doc, techName) => {
    if (!doc || !techName) return false;
    const normalized = String(techName).trim().toLowerCase();
    if (doc.email && String(doc.email).trim().toLowerCase() === normalized) {
        return true;
    }
    const candidates = [
        doc.technicianName,
        doc.engineerName,
        doc.assignedTech,
        doc.assignedAgent,
        doc.technician
    ];
    return candidates.some((v) => v && String(v).trim().toLowerCase() === normalized);
};


export const mergeTechnicianOwnershipFilter = (filter, techName) => {
    const normalized = String(techName || "").trim();
    if (!normalized) {
        filter._id = { $exists: false };
        return;
    }
    const clauses = [
        { technicianName: normalized },
        { engineerName: normalized },
        { assignedTech: normalized },
        { assignedAgent: normalized },
        { technician: normalized }
    ];
    if (filter.$or) {
        filter.$and = [{ $or: clauses }, { $or: filter.$or }];
        delete filter.$or;
    } else {
        filter.$or = clauses;
    }
};
