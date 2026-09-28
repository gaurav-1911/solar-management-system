import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";
import Attendance from "./src/models/attendance.model.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dotenv.config();

const dayKey = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split("T")[0];
};

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log("Connected");

    const records = await Attendance.find().sort({ createdAt: 1 }).lean();
    console.log(`Attendance records: ${records.length}`);

    // Group by technicianId + calendar day; keep the first (earliest) record
    const seen = new Map();
    let removed = 0;

    for (const rec of records) {
        const key = `${rec.technicianId || "?"}_${dayKey(rec.date)}`;
        if (seen.has(key)) {
            await Attendance.deleteOne({ _id: rec._id });
            removed++;
            console.log(`Removed duplicate: ${rec.technicianName || rec.technicianId} on ${dayKey(rec.date)} (${rec._id})`);
        } else {
            seen.set(key, rec._id);
        }
    }

    console.log(`Duplicates removed: ${removed}`);

    // Create the unique compound index (idempotent — safe to re-run)
    await Attendance.init();
    console.log("Unique index on (technicianId, date) ensured");

    await mongoose.disconnect();
    console.log("Done");
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
