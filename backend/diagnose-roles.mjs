import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const connect = () =>
  mongoose.connect(process.env.MONGODB_URL, { family: 4, serverSelectionTimeoutMS: 15000 });

const ACTIONS = ["view", "create", "edit", "delete", "export"];

const analyze = async () => {
  await connect();
  const db = mongoose.connection.db;
  const roles = db.collection("roles");

  console.log("=== ROLES COLLECTION ===");
  const all = await roles.find({}).sort({ name: 1 }).toArray();
  console.log("total role documents:", all.length);

  for (const r of all) {
    const perms = r.permissions || {};
    const entries = Object.entries(perms);
    const granted = entries.reduce(
      (sum, [, actions]) => sum + ACTIONS.filter((a) => actions?.[a]).length,
      0
    );
    console.log("\n--------------------------------------------------");
    console.log("_id      :", r._id.toString());
    console.log("name     :", JSON.stringify(r.name));
    console.log("isSystem :", r.isSystem);
    console.log("status   :", r.status);
    console.log("color    :", r.color);
    console.log("userCount:", r.userCount);
    console.log("modules  :", entries.length, "| granted actions:", granted);
    // Show a couple of key modules so we can spot "full access everywhere"
    const sample = ["dashboard", "leads", "customers", "users", "billing", "documents"];
    for (const m of sample) {
      const a = perms[m];
      console.log(`  ${m}:`, a ? JSON.stringify(a) : "(missing)");
    }
  }

  console.log("\n=== SUMMARY ===");
  const names = all.map((r) => r.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  console.log("duplicate names (exact):", JSON.stringify(dupes));
  const lower = names.map((n) => String(n).toLowerCase());
  const dupeLower = lower.filter((n, i) => lower.indexOf(n) !== i);
  console.log("duplicate names (case-insensitive):", JSON.stringify(dupeLower));

  await mongoose.connection.close();
  process.exit(0);
};

analyze().catch((err) => {
  console.error("DIAGNOSTIC FAILED:", err.message);
  process.exit(1);
});
