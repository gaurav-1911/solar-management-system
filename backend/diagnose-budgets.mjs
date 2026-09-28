import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dotenv.config();

await mongoose.connect(process.env.MONGODB_URL, { family: 4 });

const DailyProgressLog = mongoose.model("DailyProgressLog", new mongoose.Schema({}, { strict: false }));
const ProjectApproval = mongoose.model("ProjectApproval", new mongoose.Schema({}, { strict: false }));
const Installation = mongoose.model("Installation", new mongoose.Schema({}, { strict: false }));

const approvals = await ProjectApproval.find().select("projectName customerName").lean();
const installations = await Installation.find().lean();
const logs = await DailyProgressLog.find().select("project materialUsage").lean();

const usedByProject = {};
logs.forEach((l) => {
  const key = String(l.project || "").toLowerCase();
  usedByProject[key] = usedByProject[key] || {};
  (l.materialUsage || []).forEach((u) => {
    const k = String(u.name || "").toLowerCase();
    usedByProject[key][k] = (usedByProject[key][k] || 0) + (Number(u.qty) || 0);
  });
});

const seen = new Set();
for (const a of approvals) {
  const pkey = String(a.projectName || "").toLowerCase();
  if (seen.has(pkey)) continue;
  seen.add(pkey);
  const proj = a.projectName;
  const customers = [...new Set(approvals.filter((x) => String(x.projectName).toLowerCase() === pkey).map((x) => x.customerName).filter(Boolean))];
  const insts = installations.filter((inst) => customers.some((c) => String(inst.customerName).toLowerCase() === String(c).toLowerCase()));
  const allowance = {};
  insts.forEach((inst) =>
    (inst.materials || []).forEach((m) => {
      if (m && typeof m === "object" && (m.productName || m.name) && Number(m.quantity) > 0 && m.status !== "Not Available") {
        const key = String(m.productName || m.name).toLowerCase();
        allowance[key] = (allowance[key] || 0) + (Number(m.quantity) || 0);
      }
    })
  );
  const used = usedByProject[pkey] || {};
  console.log(`\nPROJECT "${proj}" | customers=${JSON.stringify(customers)} | installations=${insts.length}`);
  console.log(`  allowance=${JSON.stringify(allowance)}`);
  console.log(`  used=${JSON.stringify(used)}`);
  const avail = Object.entries(allowance).map(([k, v]) => [k, v - (used[k] || 0)]).filter(([, r]) => r > 0);
  console.log(`  AVAILABLE=${JSON.stringify(avail)}`);
}

await mongoose.disconnect();
console.log("\nDone.");
