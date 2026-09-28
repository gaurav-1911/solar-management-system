
const scopeByCustomer = (req) => {
    if (req.user?.role !== "customer") return null;

    const clauses = [];
    const name = req.customerName;
    const id   = req.customerId;
    const email = req.user.email;

    if (name) {
        clauses.push({ customer: name });
        clauses.push({ customerName: name });
        clauses.push({ client: name });
    }
    if (id) {
        clauses.push({ customerId: id });
    }
    if (email) {
        clauses.push({ email: email });
    }

    if (clauses.length === 0) return { _id: { $exists: false } };

    return { $or: clauses };
};

export const applyCustomerScope = (filter, req) => {
    const customerFilter = scopeByCustomer(req);
    if (!customerFilter) return;
    const existing = { ...filter };
    Object.keys(filter).forEach((k) => delete filter[k]);
    filter.$and = [existing, customerFilter];
};

export default scopeByCustomer;
