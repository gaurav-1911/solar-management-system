import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config();

// Force IPv4 Google/Cloudflare DNS for MongoDB SRV lookup on Windows
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import User from "./models/user.model.js";
import Document from "./models/document.model.js";
import DocumentCategory from "./models/documentCategory.model.js";
import ProductCategory from "./models/productCategory.model.js";
import { DEFAULT_PRODUCT_CATEGORIES } from "./constants/productCategories.js";

const DEFAULT_CATEGORIES = [
    { key: "customer", label: "Customer Documents", description: "KYC, Agreements, IDs & Contracts", color: "#2563eb", icon: "👤" },
    { key: "project", label: "Project Documents", description: "Designs, Layouts & Installation Reports", color: "#9333ea", icon: "📋" },
    { key: "financial", label: "Financial Documents", description: "Invoices, Quotations & Payment Records", color: "#2f8f5b", icon: "💰" },
    { key: "technical", label: "Technical Documents", description: "Datasheets, Manuals & Specifications", color: "#0d9488", icon: "🔧" },
    { key: "warranty", label: "Warranty Documents", description: "Certificates, Claims & Service Records", color: "#ea580c", icon: "🛡️" },
    { key: "legal", label: "Legal Documents", description: "Compliance, Approvals & Government Forms", color: "#c1443c", icon: "⚖️" },
    { key: "vendor", label: "Vendor Documents", description: "Purchase Orders & Supplier Agreements", color: "#6366f1", icon: "🏭" },
    { key: "employee", label: "Employee Documents", description: "Certificates, IDs & Employment Records", color: "#0891b2", icon: "👥" }
];

// Names of the sample documents that an earlier version of this seed script
// may have inserted. The user prefers to add their own documents via the UI,
// so on every run we remove any leftovers of those exact sample records
// (user-created documents are never matched by name, so they are untouched).
const PREVIOUS_SAMPLE_DOCUMENT_NAMES = [
    "R. Patel - KYC Agreement.pdf",
    "Site Survey Report - Adani Society.xlsx",
    "5kW Rooftop Design Layout.dwg",
    "Invoice INV-2026-0142.pdf",
    "SunMax 440W Datasheet.pdf",
    "Warranty Certificate - GridFlow 5kW.pdf",
    "Bhatt Textiles - Installation Photos.zip",
    "GST Compliance Certificate.pdf",
    "AMC Contract - Patel Sons.docx",
    "VoltCell Battery Tech Specs.xlsx",
    "Employee ID - Ravi Patel.pdf",
    "Purchase Order - FerroMount Rails.pdf",
    "NOC - Rooftop Installation.pdf",
    "Maintenance Log - GridFlow Firmware.pdf"
];

// The sample records were also created with these uploader names. Matching on
// BOTH name and uploader makes the cleanup safe: a user-uploaded document would
// need to share both the exact filename AND the exact sample uploader name to
// be removed, so user-created documents are effectively never touched.
const PREVIOUS_SAMPLE_DOCUMENT_UPLOADERS = [
    "Amit Sharma",
    "Neha Kapoor",
    "Ravi Patel",
    "System",
    "Pooja Reddy",
    "Technician Team",
    "Accounts Dept",
    "Legal Team",
    "Inventory Team",
    "HR Dept",
    "Procurement",
    "Service Team"
];

const cleanupSampleDocuments = async () => {
    const result = await Document.deleteMany({
        name: { $in: PREVIOUS_SAMPLE_DOCUMENT_NAMES },
        uploadedBy: { $in: PREVIOUS_SAMPLE_DOCUMENT_UPLOADERS }
    });
    if (result.deletedCount > 0) {
        console.log(`Removed ${result.deletedCount} previously-seeded sample document(s)`);
    }
};

const seedCategories = async () => {
    for (const category of DEFAULT_CATEGORIES) {
        await DocumentCategory.updateOne(
            { key: category.key },
            { $set: { ...category, isSystem: true } },
            { upsert: true }
        );
    }
    console.log(`Seeded ${DEFAULT_CATEGORIES.length} default document categories`);
};

// Inserts any default product categories that are missing. Uses $setOnInsert so
// re-running the seed NEVER overwrites edits the user made in the Product
// Catalog UI and NEVER resurrects a category the user deleted — only genuinely
// missing ones are added. They are ordinary records, fully editable/deletable.
const seedProductCategories = async () => {
    for (const category of DEFAULT_PRODUCT_CATEGORIES) {
        await ProductCategory.updateOne(
            { key: category.key },
            { $setOnInsert: { ...category } },
            { upsert: true }
        );
    }
    console.log(`Ensured ${DEFAULT_PRODUCT_CATEGORIES.length} default product categories exist`);
};

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL, { family: 4 });
        console.log("MongoDB Connected for seeding...");

        // Admin credentials — override via ADMIN_EMAIL / ADMIN_USERNAME / ADMIN_PASSWORD in .env
        const adminEmail = (process.env.ADMIN_EMAIL || "admin@solar.com").trim().toLowerCase();
        const adminUsername = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
        const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123";

        if (!adminEmail || !adminPassword) {
            throw new Error("Admin email and password are required");
        }

        if (adminPassword.length < 6) {
            throw new Error("Admin password must be at least 6 characters long");
        }

        if (!process.env.ADMIN_PASSWORD) {
            console.warn("⚠️  Using default admin password. Set ADMIN_PASSWORD in your .env before deploying.");
        }

        const existingAdmin = await User.findOne({ email: adminEmail });

        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        const defaultUsers = [
            {
                name: "Super Admin",
                username: adminUsername,
                email: adminEmail,
                password: hashedPassword,
                phone: "+91 98765 00001",
                role: "super_admin",
                department: "admin",
                designation: "Chief Administrator",
                employeeId: "EMP-001",
                status: "active"
            },
            {
                name: "Ravi Patel",
                username: "technician",
                email: "technician@solar.com",
                password: hashedPassword,
                phone: "+91 98765 00002",
                role: "technician",
                department: "technical",
                designation: "Senior Field Technician",
                employeeId: "EMP-002",
                reportsTo: "Super Admin",
                status: "active"
            },
            {
                name: "Amit Sharma",
                username: "sales.manager",
                email: "sales.manager@solar.com",
                password: hashedPassword,
                phone: "+91 98765 00003",
                role: "sales_manager",
                department: "sales",
                designation: "Sales Manager",
                employeeId: "EMP-003",
                reportsTo: "Super Admin",
                status: "active"
            },
            {
                name: "Priya Mehta",
                username: "accountant",
                email: "accountant@solar.com",
                password: hashedPassword,
                phone: "+91 98765 00004",
                role: "accountant",
                department: "finance",
                designation: "Senior Accountant",
                employeeId: "EMP-004",
                reportsTo: "Super Admin",
                status: "active"
            },
            {
                name: "Neha Kapoor",
                username: "support.team",
                email: "support.team@solar.com",
                password: hashedPassword,
                phone: "+91 98765 00005",
                role: "support_team",
                department: "support",
                designation: "Support Lead",
                employeeId: "EMP-005",
                reportsTo: "Super Admin",
                status: "active"
            }
        ];

        for (const uData of defaultUsers) {
            const existing = await User.findOne({
                $or: [{ email: uData.email }, { username: uData.username }]
            });
            if (existing) {
                Object.assign(existing, uData);
                await existing.save();
            } else {
                await User.create(uData);
            }
        }
        console.log(`Seeded/updated ${defaultUsers.length} default user accounts.`);

        await seedCategories();
        await seedProductCategories();
        await cleanupSampleDocuments();

        await mongoose.connection.close();
        console.log("MongoDB connection closed");
        process.exit(0);
    } catch (error) {
        console.error("Seeding failed:", error.message);
        process.exit(1);
    }
};

seedAdmin();
