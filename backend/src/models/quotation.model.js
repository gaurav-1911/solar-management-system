import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
    {
        qty: {
            type: Number,
            default: 1,
            min: [0, "Quantity cannot be negative"],
            max: [1000000, "Quantity cannot exceed 1,000,000"]
        },
        price: {
            type: Number,
            default: 0,
            min: [0, "Price cannot be negative"],
            max: [100000000, "Price cannot exceed ₹10 crore per item"]
        },
        label: {
            type: String,
            default: "",
            trim: true,
            maxlength: [100, "Item label cannot exceed 100 characters"]
        }
    },
    { _id: false }
);

const quotationSchema = new mongoose.Schema(
    {
        quotationId: {
            type: String,
            // sparse: legacy documents created before this field existed have no
            // quotationId, and a non-sparse unique index would reject building on
            // multiple null values. Run migrateQuotationIds.js to backfill IDs.
            index: { unique: true, sparse: true },
            trim: true
        },
        // Distinguishes regular quotations from material request quotations.
        type: {
            type: String,
            enum: ["Quotation", "Material Request", "Remaining Products"],
            default: "Quotation"
        },
        installationId: {
            type: String,
            default: "",
            trim: true
        },
        // Track items added via material requests inside an existing quotation.
        requestedItems: [{
            productName: { type: String, default: "" },
            category: { type: String, default: "" },
            brand: { type: String, default: "" },
            qty: { type: Number, default: 0 },
            price: { type: Number, default: 0 },
            label: { type: String, default: "" },
            status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" }
        }],
        client: {
            type: String,
            required: [true, "Client name is required"],
            trim: true,
            minlength: [2, "Client name must be at least 2 characters"]
        },
        projectName: {
            type: String,
            default: "",
            trim: true
        },
        status: {
            type: String,
            required: [true, "Status is required"],
            enum: [
                "Draft",
                "Pending Approval",
                "Sent",
                "Negotiating",
                "Approved",
                "Rejected"
            ],
            default: "Draft"
        },
        total: {
            type: Number,
            default: 0,
            min: [0, "Total cannot be negative"],
            max: [10000000000, "Total is out of range"]
        },
        gst: {
            type: Number,
            default: 0,
            min: [0, "GST cannot be negative"],
            max: [10000000000, "GST is out of range"]
        },
        grandTotal: {
            type: Number,
            default: 0,
            min: [0, "Grand total cannot be negative"],
            max: [10000000000, "Grand total is out of range"]
        },
        validUntil: {
            type: Date,
            default: null
        },
        version: {
            type: Number,
            default: 1,
            min: [1, "Version must be at least 1"],
            max: [1000, "Version cannot exceed 1000"]
        },
        approvedBy: {
            type: String,
            default: "Pending",
            trim: true,
            maxlength: [50, "Approved by cannot exceed 50 characters"]
        },
        leadId: {
            type: String,
            trim: true,
            // One quotation per lead — sparse so documents without a lead are
            // skipped by the unique index and never collide.
            index: { unique: true, sparse: true }
        },
        designId: {
            type: String,
            default: "",
            trim: true,
            index: true
        },
        // System capacity (kW) pulled from the linked Solar Design's
        // recommendedCapacity — displayed as read-only in the quotation form
        // and used to compute the estimated subsidy information.
        capacity: {
            type: Number,
            default: null,
            min: [0, "Capacity cannot be negative"]
        },
        // Subsidy estimate shown to the customer for informational purposes.
        // This does NOT affect the grand total — it only informs the customer
        // about potential government subsidies they may be eligible for.
        // Same slab calculation is used for all schemes.
        subsidyInfo: {
            schemeName: {
                type: String,
                default: "PM Surya Ghar Yojana",
                trim: true
            },
            eligibleCapacity: {
                type: Number,
                default: null
            },
            subsidyAmount: {
                type: Number,
                default: 0,
                min: 0
            },
            calculationMethod: {
                type: String,
                enum: ["slab"],
                default: "slab"
            },
            slabs: [{
                label: { type: String, default: "" },
                range: { type: String, default: "" },
                rate: { type: Number, default: 0 },
                amount: { type: Number, default: 0 }
            }],
            capApplied: {
                type: Boolean,
                default: false
            },
            maxCap: {
                type: Number,
                default: 78000
            },
            note: {
                type: String,
                default: "",
                trim: true
            }
        },
        customerId: {
            type: String,
            default: "",
            trim: true
        },
        siteSurveyId: {
            type: String,
            default: "",
            trim: true
        },
        items: {
            type: Map,
            of: itemSchema,
            default: {}
        },
        // Customer response when quotation is sent via email
        customerResponse: {
            action: {
                type: String,
                enum: [null, "Approved", "Rejected", "Negotiating"],
                default: null
            },
            signature: {
                type: String, // base64 data-URL of drawn signature
                default: ""
            },
            reason: {
                type: String, // rejection or negotiation reason
                default: "",
                trim: true
            },
            respondedAt: {
                type: Date,
                default: null
            }
        },
        // Version history tracking snapshots across negotiations & price updates
        versions: [{
            version: {
                type: Number,
                required: true
            },
            items: {
                type: Map,
                of: itemSchema,
                default: {}
            },
            total: {
                type: Number,
                default: 0
            },
            gst: {
                type: Number,
                default: 0
            },
            grandTotal: {
                type: Number,
                default: 0
            },
            status: {
                type: String,
                default: "Draft"
            },
            validUntil: {
                type: Date,
                default: null
            },
            customerResponse: {
                action: {
                    type: String,
                    enum: [null, "Approved", "Rejected", "Negotiating"],
                    default: null
                },
                signature: {
                    type: String,
                    default: ""
                },
                reason: {
                    type: String,
                    default: ""
                },
                respondedAt: {
                    type: Date,
                    default: null
                }
            },
            createdAt: {
                type: Date,
                default: Date.now
            },
            notes: {
                type: String,
                default: ""
            }
        }],
        // Track email sending status
        emailSentAt: {
            type: Date,
            default: null
        },
        // Track which version was last emailed to the customer
        emailSentVersion: {
            type: Number,
            default: 0,
            min: [0, "Email sent version cannot be negative"]
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

quotationSchema.index({ createdAt: -1 });
quotationSchema.index({ customerId: 1 });
quotationSchema.index({ status: 1, createdAt: -1 });

const Quotation = mongoose.model("Quotation", quotationSchema);

export default Quotation;
