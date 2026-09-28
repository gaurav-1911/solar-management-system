import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";
import Quotation from "./src/models/quotation.model.js";
import ProjectApproval from "./src/models/projectApproval.model.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log("Connected");

    const quotations = await Quotation.find()
        .sort({ createdAt: 1 })
        .lean();

    console.log(`Quotations: ${quotations.length}`);

    let next = 1;
    for (const q of quotations) {
        const newId = `Q-${String(next).padStart(3, "0")}`;
        next++;

        // Legacy quotationId (pre-field) was derived from the ObjectId (Q-XXXX);
        // project approvals linked to it store that same derived value.
        const idStr = q._id ? q._id.toString() : "";
        const legacyId = idStr ? `Q-${idStr.substring(idStr.length - 4).toUpperCase()}` : "";
        const oldId = q.quotationId || legacyId;

        if (oldId === newId) {
            console.log(`${newId}: unchanged`);
            continue;
        }

        await Quotation.updateOne({ _id: q._id }, { $set: { quotationId: newId } });

        // Keep linked project approvals in sync with the new quotation ID
        if (oldId) {
            const res = await ProjectApproval.updateMany(
                { quotationId: oldId },
                { $set: { quotationId: newId } }
            );
            const updated = res.modifiedCount ?? res.nModified ?? 0;
            console.log(`${oldId} -> ${newId} (${q.client || "-"}), approvals updated: ${updated}`);
        } else {
            console.log(`(none) -> ${newId} (${q.client || "-"})`);
        }
    }

    await mongoose.disconnect();
    console.log("Done");
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
