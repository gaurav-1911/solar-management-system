import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";
import Customer from "./src/models/customer.model.js";
import Lead from "./src/models/lead.model.js";
import SiteSurvey from "./src/models/siteSurvey.model.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dotenv.config();

const isSequential = (id) => /^CUS-\d+$/.test(id || "");

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log("Connected");

    const customers = await Customer.find().lean();

    let max = 0;
    for (const c of customers) {
        const m = c.customerId && c.customerId.match(/^CUS-(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }

    const legacy = customers
        .filter((c) => !isSequential(c.customerId))
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    console.log(`Customers: ${customers.length}, sequential max = ${max}, legacy to fix = ${legacy.length}`);

    let next = max + 1; 
    for (const cust of legacy) {
        const newId = `CUS-${String(next).padStart(3, "0")}`;
        next++;

        await Customer.updateOne({ _id: cust._id }, { $set: { customerId: newId } });
        if (cust.leadId) {
            await Lead.updateOne({ leadId: cust.leadId }, { $set: { customerId: newId } });
            await SiteSurvey.updateMany({ leadId: cust.leadId }, { $set: { customerId: newId } });
        }
        console.log(`${cust.name || "(unnamed)"}: ${cust.customerId || "(none)"} -> ${newId} (leadId ${cust.leadId || "-"})`);
    }

    await mongoose.disconnect();
    console.log("Done");
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
