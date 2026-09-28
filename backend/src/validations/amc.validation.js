import Joi from "joi";

const AMC_PLANS = [
    "Basic — 2 visits/yr", "Standard — 4 visits/yr", "Premium — 6 visits/yr",
    "Annual", "Premium", "Basic"
];

const historySchema = Joi.array().items(
    Joi.object({
        action: Joi.string().trim().allow(""),
        detail: Joi.string().trim().allow(""),
        date: Joi.date().allow(null)
    })
).allow(null);

export const createAmcSchema = Joi.object({
    amcId: Joi.string().trim().allow(""),

    customer: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Customer name is required" }),

    customerId: Joi.string().trim().allow("").default(""),

    system: Joi.string().trim().required()
        .messages({ "string.empty": "System name is required" }),

    plan: Joi.string().valid(...AMC_PLANS).required(),

    startDate: Joi.date().required()
        .messages({ "date.base": "Start date is required" }),

    endDate: Joi.date().required()
        .messages({ "date.base": "End date is required" }),

    amount: Joi.number().min(0).default(0),

    status: Joi.string().valid("Active", "Expiring Soon", "Expired", "active", "expiring", "expired").default("Active"),

    lastService: Joi.date().allow(null).default(null),

    nextService: Joi.date().allow(null).default(null),

    visits: Joi.number().min(0).default(0),

    totalVisits: Joi.number().min(0).default(0),

    visitsUsed: Joi.number().min(0).default(0),

    history: historySchema
});

export const updateAmcSchema = Joi.object({
    amcId: Joi.string().trim().allow(""),

    customer: Joi.string().trim().min(2),

    customerId: Joi.string().trim().allow(""),

    system: Joi.string().trim(),

    plan: Joi.string().valid(...AMC_PLANS),

    startDate: Joi.date(),

    endDate: Joi.date(),

    amount: Joi.number().min(0),

    status: Joi.string().valid("Active", "Expiring Soon", "Expired", "active", "expiring", "expired"),

    lastService: Joi.date().allow(null),

    nextService: Joi.date().allow(null),

    visits: Joi.number().min(0),

    totalVisits: Joi.number().min(0),

    visitsUsed: Joi.number().min(0),

    history: historySchema
});
