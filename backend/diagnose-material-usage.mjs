import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) { console.log("NO MONGODB_URL"); process.exit(1); }

await mongoose.connect(MONGODB_URL, { family: 4 });
console.log("Connected to:", mongoose.connection.host);

const DailyProgressLog = mongoose.model("DailyProgressLog", new mongoose.Schema({}, { strict: false }));
const ProjectApproval = mongoose.model("ProjectApproval", new mongoose.Schema({}, { strict: false }));
const Installation = mongoose.model("Installation", new mongoose.Schema({}, { strict: false }));

const logs = await DailyProgressLog.find().select("logId project materialUsage date createdAt").sort({ createdAt: 1 }).lean();
console.log("\n=== DAILY PROGRESS LOGS ===");
logs.forEach((l) => console.log(`- ${l._id} | ${l.logId} | project="${l.project}" | usage=${JSON.stringify(l.materialUsage || [])}`));

const approvals = await ProjectApproval.find().select("projectName customerName").lean();
console.log("\n=== PROJECT APPROVALS ===");
approvals.slice(0, 40).forEach((a) => console.log(`- project="${a.projectName}" | customer="${a.customerName}"`));

const installations = await Installation.find().lean();
console.log("\n=== RESOLVED BUDGETS ===");
const logProjects = [...new Set(logs.map((l) => l.project).filter(Boolean))];
for (const project of logProjects) {
    const approvalsFor = approvals.filter((a) => String(a.projectName).toLowerCase() === String(project).toLowerCase());
    const customers = [...new Set(approvalsFor.map((a) => a.customerName).filter(Boolean))];
    const insts = installations.filter((inst) => customers.some((c) => String(inst.customerName).toLowerCase() === String(c).toLowerCase()));
    const allowance = {};
    insts.forEach((inst) =>
        (inst.materials || []).forEach((m) => {
            if (m && typeof m === "object" && (m.productName || m.name) && Number(m.quantity) > 0 && m.status !== "Not Available") {
                const matName = m.productName || m.name;
                const key = String(matName).toLowerCase();
                allowance[key] = (allowance[key] || 0) + (Number(m.quantity) || 0);
            }
        })
    );
    console.log(`\nProject "${project}":`);
    console.log(`  approvals=${approvalsFor.length} customers=${JSON.stringify(customers)} installations=${insts.length}`);
    console.log(`  allowance=${JSON.stringify(allowance)}`);
    insts.forEach((inst) => {
        console.log(`  installation ${inst.installationId} customer="${inst.customerName}" materials=` + JSON.stringify((inst.materials || []).slice(0, 6)));
    });
}

await mongoose.disconnect();
console.log("\nDone.");
