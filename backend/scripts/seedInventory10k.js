import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import Inventory from "../src/models/inventory.model.js";
import Product from "../src/models/product.model.js";

// ──────────────────────────────────────────────────────
// Realistic solar-industry data pools
// ──────────────────────────────────────────────────────

const CATEGORIES = ["Panels", "Inverters", "Batteries", "Accessories", "Mounting", "Wiring", "Controllers"];

const SUPPLIERS = [
    "Tata Power Solar", "Adani Solar", "Waaree Energies", "Vikram Solar",
    "Jakson Group", "Goldi Solar", "Havells India", "Luminous Power",
    "Exide Industries", "Amara Raja", "Polycab India", "Finolex Cables",
    "C&S Electric", "Anchor Electricals", "Hager India", "Schneider Electric",
    "ABB India", "Siemens India", "Delta Electronics", "SMA Solar",
    "GoodWe", "Growatt", "Fronius India", "Sungrow India",
    "Su-Kam Power", "Microtek International", "UTL Solar", "Smarten Powers",
    "ReneSola India", "Canadian Solar India", "Jinko Solar India", "Trina Solar India",
    "LONGi Solar India", "JA Solar India", "First Solar India", "REC Solar India",
    "North Hill Energy", "Orb Energy", "CleanMax Solar", "Tata Cleantech"
];

const LOCATIONS = [
    "Warehouse A - Mumbai", "Warehouse B - Delhi", "Warehouse C - Bangalore",
    "Warehouse D - Chennai", "Warehouse E - Pune", "Warehouse F - Hyderabad",
    "Warehouse G - Kolkata", "Warehouse H - Ahmedabad", "Warehouse I - Jaipur",
    "Warehouse J - Lucknow", "Warehouse K - Chandigarh", "Warehouse L - Kochi",
    "Warehouse M - Indore", "Warehouse N - Nagpur", "Warehouse O - Bhopal",
    "Hub - Noida", "Hub - Gurugram", "Hub - Thane", "Hub - Whitefield",
    "Central Depot - Navi Mumbai", "Regional Depot - Surat", "Regional Depot - Visakhapatnam",
    "Field Office - Goa", "Field Office - Mysore", "Transit Point - Patna"
];

// Per-category product name templates
const PRODUCT_NAMES = {
    Panels: [
        "Mono PERC {watt}W Panel", "Bifacial {watt}W Panel", "Half-Cut {watt}W Panel",
        "Poly Crystalline {watt}W Panel", "TOPCon {watt}W Panel", "HJT {watt}W Panel",
        "Thin Film {watt}W Panel", "Flexible {watt}W Panel", "Portable {watt}W Panel",
        "High-Efficiency {watt}W Panel"
    ],
    Inverters: [
        "{kw}kW String Inverter", "{kw}kW Hybrid Inverter", "{kw}kW Off-Grid Inverter",
        "{kw}kW On-Grid Inverter", "{kw}kW Micro Inverter", "{kw}kW PCU",
        "{kw}kW Solar Inverter", "{kw}kW Grid-Tie Inverter", "{kw}kW Battery Inverter",
        "{kw}kW Multi-Mode Inverter"
    ],
    Batteries: [
        "{ah}Ah Tubular Battery", "{ah}Ah LiFePO4 Battery", "{ah}Ah Lead-Acid Battery",
        "{ah}Ah Gel Battery", "{ah}Ah Deep Cycle Battery", "{ah}Ah SMF Battery",
        "{ah}Ah OPzV Battery", "{ah}Ah AGM Battery", "{ah}Ah Lithium Battery",
        "{ah}Ah Solar Battery"
    ],
    Controllers: [
        "{amp}A MPPT Charge Controller", "{amp}A PWM Charge Controller",
        "{amp}A Solar Controller", "{amp}A DC-DC Converter", "{amp}A Regulator",
        "{amp}A Smart Controller", "{amp}A Auto Controller", "{amp}A Digital Controller"
    ],
    Mounting: [
        "Aluminum Rail Mount Kit", "Roof Mount Bracket Set", "Ground Mount Structure",
        "Tile Roof Hook Kit", "Metal Roof Clamp Set", "Ballast Mount System",
        "Pole Mount Bracket", "Carport Mounting Kit", "Solar Standoff Mount",
        "Adjustable Tilt Mount", "Wind Load Mount Frame", "Heavy Duty Mount Rail"
    ],
    Wiring: [
        "{size}mm² Solar Cable {len}m", "DC Cable {len}m", "AC Cable {len}m",
        "MC4 Connector Pair", "MC4 Branch Connector", "Solar Junction Box",
        "Cable Tray {len}m", "Cable Tie Pack (100)", "Waterproof Connector Kit",
        "Underground Cable {len}m", "Flexible Conduit {len}m", "Cable Gland Set"
    ],
    Accessories: [
        "SPD Surge Protector", "DC Isolator Switch", "AC Isolator Switch",
        "Distribution Box", "Earth Leakage Relay", "Miniature Circuit Breaker",
        "Fuse Holder + Fuse", "Cable Lug Kit", "Earthing Kit",
        "Lightning Arrestor", "Monitoring WiFi Dongle", "Generation Meter",
        "Bidirectional Meter", "Digital Energy Meter", "Safety Signage Pack",
        "Conduit Fittings Kit", "Wire Marker Kit", "Panel Cleaning Brush Set"
    ]
};

const WATT_OPTIONS = [100, 165, 200, 270, 330, 335, 400, 440, 500, 540, 550, 580, 600, 610, 670];
const KW_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5, 8, 10, 12, 15, 20, 25, 30, 50];
const AH_OPTIONS = [40, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500];
const AMP_OPTIONS = [10, 15, 20, 30, 40, 50, 60, 80, 100, 120];
const CABLE_SIZES = [2.5, 4, 6, 10, 16, 25, 35];
const CABLE_LENS = [5, 10, 15, 20, 25, 30, 50, 75, 100, 150, 200];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max, decimals = 2) => +(min + Math.random() * (max - min)).toFixed(decimals);

// ──────────────────────────────────────────────────────
// Generate a single inventory item
// ──────────────────────────────────────────────────────
function generateItem(index) {
    const category = pick(CATEGORIES);
    const supplier = pick(SUPPLIERS);
    const location = pick(LOCATIONS);

    // Build a realistic product name
    let name;
    const templates = PRODUCT_NAMES[category];
    const tmpl = pick(templates);
    name = tmpl
        .replace("{watt}", pick(WATT_OPTIONS))
        .replace("{kw}", pick(KW_OPTIONS))
        .replace("{ah}", pick(AH_OPTIONS))
        .replace("{amp}", pick(AMP_OPTIONS))
        .replace("{size}", pick(CABLE_SIZES))
        .replace("{len}", pick(CABLE_LENS));

    // Make name unique by appending a suffix when needed
    name = `${name} - ${supplier.split(" ")[0]} ${randInt(100, 999)}`;

    // Price ranges vary by category
    let unitPrice;
    switch (category) {
        case "Panels":      unitPrice = randFloat(2500, 28000); break;
        case "Inverters":   unitPrice = randFloat(4000, 65000); break;
        case "Batteries":   unitPrice = randFloat(3000, 45000); break;
        case "Controllers": unitPrice = randFloat(800, 12000);  break;
        case "Mounting":    unitPrice = randFloat(200, 5000);   break;
        case "Wiring":      unitPrice = randFloat(50, 3000);    break;
        case "Accessories": unitPrice = randFloat(50, 8000);    break;
        default:            unitPrice = randFloat(100, 5000);
    }

    const quantity = randInt(0, 500);
    const minStock = randInt(5, 50);

    // Spread restocked dates over the last 2 years for report variety
    const daysAgo = randInt(0, 730);
    const lastRestocked = new Date(Date.now() - daysAgo * 86400000);

    // Generate sequential invId (will be overwritten by bulk insert)
    const invId = `INV-${String(index + 1).padStart(4, "0")}`;
    const sku = invId;

    return {
        invId,
        name,
        category,
        sku,
        quantity,
        minStock,
        unitPrice,
        supplier,
        location,
        lastRestocked,
        createdAt: lastRestocked,
        updatedAt: lastRestocked
    };
}

// ──────────────────────────────────────────────────────
// Main seeder
// ──────────────────────────────────────────────────────
const BATCH_SIZE = 1000;
const TOTAL = 10000;

async function seed() {
    console.time("⏱ Total seed time");

    try {
        await mongoose.connect(process.env.MONGODB_URL, {
            family: 4,
            serverSelectionTimeoutMS: 10000
        });
        console.log("✅ Connected to MongoDB");

        // Optional: clear existing inventory first
        const existingCount = await Inventory.countDocuments();
        if (existingCount > 0) {
            console.log(`⚠️  Found ${existingCount} existing inventory items.`);
            console.log("   Clearing old inventory data...");
            await Inventory.deleteMany({});
            console.log("   ✅ Old inventory cleared.");
        }

        console.log(`\n🔄 Seeding ${TOTAL.toLocaleString()} inventory items in batches of ${BATCH_SIZE}...\n`);

        let inserted = 0;

        for (let batchStart = 0; batchStart < TOTAL; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL);
            const batch = [];

            for (let i = batchStart; i < batchEnd; i++) {
                batch.push(generateItem(i));
            }

            await Inventory.insertMany(batch, { ordered: false });
            inserted += batch.length;

            const pct = ((inserted / TOTAL) * 100).toFixed(1);
            process.stdout.write(`   📦 ${inserted.toLocaleString()}/${TOTAL.toLocaleString()} items (${pct}%)\r`);
        }

        console.log(`\n\n✅ Successfully inserted ${inserted.toLocaleString()} inventory items`);

        // Also create linked Products for a portion (20%) to test product-inventory sync
        const PRODUCT_RATIO = 0.2;
        const productCount = Math.floor(TOTAL * PRODUCT_RATIO);
        console.log(`\n🔄 Creating ${productCount.toLocaleString()} linked products (${PRODUCT_RATIO * 100}%)...`);

        // Fetch a sample of inventory items to link
        const sampleItems = await Inventory.find()
            .sort({ _id: -1 })
            .limit(productCount)
            .lean();

        const productBatch = sampleItems.map((item, idx) => ({
            productId: `PRD-${String(idx + 1).padStart(4, "0")}`,
            name: item.name,
            brand: item.supplier || "Unknown",
            category: mapCategory(item.category),
            costPrice: item.unitPrice,
            price: item.unitPrice * randFloat(1.1, 1.4),
            stock: item.quantity,
            minStock: item.minStock,
            warranty: randInt(6, 60),
            inventoryItemId: item._id,
            inventoryRef: item._id,
            specs: {}
        }));

        // Clear old products first
        await Product.deleteMany({});
        for (let i = 0; i < productBatch.length; i += BATCH_SIZE) {
            const batch = productBatch.slice(i, i + BATCH_SIZE);
            await Product.insertMany(batch, { ordered: false });
        }
        console.log(`✅ Created ${productCount.toLocaleString()} linked products`);

        // Print summary
        const finalInvCount = await Inventory.countDocuments();
        const finalProdCount = await Product.countDocuments();
        console.log("\n═══════════════════════════════════════");
        console.log("  📊 SEED SUMMARY");
        console.log("═══════════════════════════════════════");
        console.log(`  Inventory Items : ${finalInvCount.toLocaleString()}`);
        console.log(`  Products        : ${finalProdCount.toLocaleString()}`);

        // Category breakdown
        const categoryStats = await Inventory.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 }, totalValue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } } } },
            { $sort: { count: -1 } }
        ]);
        console.log("\n  📦 Category Breakdown:");
        for (const cat of categoryStats) {
            console.log(`     ${cat._id.padEnd(14)} : ${String(cat.count).padStart(5)} items  |  ₹${cat.totalValue.toLocaleString("en-IN")} total value`);
        }

        // Location breakdown (top 5)
        const locationStats = await Inventory.aggregate([
            { $group: { _id: "$location", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        console.log("\n  📍 Top 5 Locations:");
        for (const loc of locationStats) {
            console.log(`     ${loc._id.padEnd(35)} : ${loc.count.toLocaleString()} items`);
        }

        // Price range
        const priceStats = await Inventory.aggregate([
            { $group: { _id: null, min: { $min: "$unitPrice" }, max: { $max: "$unitPrice" }, avg: { $avg: "$unitPrice" } } }
        ]);
        if (priceStats.length) {
            const p = priceStats[0];
            console.log(`\n  💰 Price Range: ₹${p.min.toLocaleString("en-IN")} — ₹${p.max.toLocaleString("en-IN")} (avg: ₹${Math.round(p.avg).toLocaleString("en-IN")})`);
        }

        // Low stock items
        const lowStock = await Inventory.countDocuments({ $expr: { $lte: ["$quantity", "$minStock"] } });
        console.log(`  ⚠️  Low Stock Items: ${lowStock.toLocaleString()}`);

        console.log("═══════════════════════════════════════\n");

        await mongoose.connection.close();
        console.log("🔌 MongoDB connection closed.");
        console.timeEnd("⏱ Total seed time");
        process.exit(0);

    } catch (error) {
        console.error("\n❌ Seed failed:", error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

function mapCategory(invCategory) {
    const map = {
        Panels: "solar-panels",
        Inverters: "inverters",
        Batteries: "batteries",
        Controllers: "charge-controllers",
        Mounting: "mounting-structures",
        Wiring: "cables",
        Accessories: "connectors"
    };
    return map[invCategory] || "accessories";
}

seed();
