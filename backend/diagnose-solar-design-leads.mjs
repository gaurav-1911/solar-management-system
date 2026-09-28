import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const connect = () =>
  mongoose.connect(process.env.MONGODB_URL, { family: 4, serverSelectionTimeoutMS: 15000 });

const counts = async () => {
  await connect();
  const db = mongoose.connection.db;

  const leads = db.collection("leads");
  const surveys = db.collection("sitesurveys");
  const designs = db.collection("solardesigns");

  console.log("=== COUNTS ===");
  console.log("leads:", await leads.countDocuments());
  console.log("site surveys:", await surveys.countDocuments());
  console.log("solar designs:", await designs.countDocuments());

  console.log("\n=== LEADS (sample 10) ===");
  console.log(JSON.stringify(await leads.find({}).limit(10).project({ leadId: 1, name: 1, _id: 0 }).toArray(), null, 2));

  console.log("\n=== SURVEYS BY visitStatus ===");
  console.log(JSON.stringify(await surveys.aggregate([{ $group: { _id: "$visitStatus", count: { $sum: 1 } } }]).toArray(), null, 2));

  console.log("\n=== SURVEYS (sample 15) ===");
  console.log(JSON.stringify(await surveys.find({}).limit(15).project({ surveyId: 1, leadId: 1, customerId: 1, visitStatus: 1, customerName: 1, projectName: 1, _id: 0 }).toArray(), null, 2));

  console.log("\n=== COMPLETED SURVEYS ===");
  const completed = await surveys.find({ visitStatus: "Completed" }).toArray();
  console.log("completed count:", completed.length);
  const completedLeadIds = [...new Set(completed.map((s) => s.leadId).filter(Boolean))];
  console.log("unique leadIds on completed surveys:", JSON.stringify(completedLeadIds, null, 2));

  console.log("\n=== MATCH CHECK ===");
  const allLeadIds = (await leads.find({}).project({ leadId: 1, _id: 0 }).toArray()).map((l) => l.leadId).filter(Boolean);
  const leadIdSet = new Set(allLeadIds);
  const matched = completedLeadIds.filter((id) => leadIdSet.has(id));
  const unmatched = completedLeadIds.filter((id) => !leadIdSet.has(id));
  console.log("completed-survey leadIds that EXIST in leads:", JSON.stringify(matched));
  console.log("completed-survey leadIds NOT in leads:", JSON.stringify(unmatched));

  console.log("\n=== DESIGNS (leadIds) ===");
  console.log(JSON.stringify(await designs.find({}).project({ designId: 1, leadId: 1, _id: 0 }).toArray(), null, 2));

  const designLeadIds = await designs.find({}).project({ leadId: 1, _id: 0 }).toArray();
  const eligible = matched.filter((id) => !designLeadIds.some((d) => d.leadId === id));
  console.log("\n=== ELIGIBLE LEADS (completed survey, exists as lead, no design yet) ===");
  console.log(JSON.stringify(eligible, null, 2));

  await mongoose.connection.close();
  process.exit(0);
};

counts().catch((err) => {
  console.error("DIAGNOSTIC FAILED:", err.message);
  process.exit(1);
});
