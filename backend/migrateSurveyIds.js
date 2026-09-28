import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";
import SiteSurvey from "./src/models/siteSurvey.model.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log("Connected");

    const surveys = await SiteSurvey.find({ surveyId: { $exists: true, $ne: null } })
        .sort({ createdAt: 1 })
        .lean();

    console.log(`Surveys: ${surveys.length}`);

    let next = 1;
    for (const s of surveys) {
        const newId = `SVY-${String(next).padStart(3, "0")}`;
        next++;
        if (s.surveyId === newId) {
            console.log(`${s.surveyId}: unchanged`);
            continue;
        }
        await SiteSurvey.updateOne({ _id: s._id }, { $set: { surveyId: newId } });
        console.log(`${s.surveyId} -> ${newId} (${s.customerName || "-"})`);
    }

    await mongoose.disconnect();
    console.log("Done");
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
