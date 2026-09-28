const BASE = "http://localhost:5000/api";

async function req(path, opts = {}, token) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  console.log(`\n${opts.method || "GET"} ${path} -> ${res.status} (${text.length}b)`);
  console.log(text.slice(0, 260));
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body };
}

const login = await req("/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@solar.com", password: "Admin@123" }) });
const token = login.body?.data?.token || login.body?.token;
console.log("TOKEN:", token ? "OK" : "NONE");

console.log("\n========== EDGE CASES (previously 500) ==========");
await req("/daily-progress/project-materials?project=dairy%20farm%20solar&excludeLogId=undefined", {}, token);
await req("/daily-progress/project-materials?project=dairy%20farm%20solar&excludeLogId=not-a-valid-id", {}, token);
await req("/daily-progress/not-a-valid-id", { method: "PUT", body: JSON.stringify({ progress: 5 }) }, token);
await req("/daily-progress/not-a-valid-id", { method: "DELETE" }, token);

console.log("\n========== USER FLOW: create 30 -> edit add 5 -> 35 ==========");
const base = {
  date: "2026-08-06", project: "dairy farm solar", technician: "Verify Technician",
  workPerformed: "Verification test", status: "In Progress", progress: 10,
  materials: "Tata Power Solar x30", qty: 30,
  materialUsage: [{ name: "Tata Power Solar", qty: 30 }],
  workers: 2, delayStatus: "No", delayReason: "", weather: "Sunny", weatherDesc: "",
  gpsLat: "", gpsLng: "", supervisorName: "Verify Supervisor", approvalStatus: "Approved",
  approvalRemarks: "", completedTasks: "", pendingTasks: "", nextDayPlan: "", issuesFound: "", customerRemarks: "",
};

const created = await req("/daily-progress", { method: "POST", body: JSON.stringify(base) }, token);
const id = created.body?.data?._id;
if (!id) { console.log("CREATE FAILED"); process.exit(1); }

const mat = await req(`/daily-progress/project-materials?project=dairy%20farm%20solar&excludeLogId=${id}`, {}, token);
console.log("\n[EDIT MODE remaining should be FULL allowance (65) since this log is excluded]:", JSON.stringify(mat.body?.data?.materials));

const upd = { ...base, materials: "Tata Power Solar x35", qty: 35, materialUsage: [{ name: "Tata Power Solar", qty: 35 }] };
await req(`/daily-progress/${id}`, { method: "PUT", body: JSON.stringify(upd) }, token);

// Over-budget attempt should still be rejected (limit enforcement intact)
const over = { ...base, materials: "Tata Power Solar x40", qty: 40, materialUsage: [{ name: "Tata Power Solar", qty: 40 }] };
await req(`/daily-progress/${id}`, { method: "PUT", body: JSON.stringify(over) }, token);

// New entry with remaining 5 should still work after the 35 log exists
const leftover = { ...base, materials: "Tata Power Solar x5", qty: 5, materialUsage: [{ name: "Tata Power Solar", qty: 5 }] };
const created2 = await req("/daily-progress", { method: "POST", body: JSON.stringify(leftover) }, token);
const id2 = created2.body?.data?._id;
if (id2) await req(`/daily-progress/${id2}`, { method: "DELETE" }, token);

await req(`/daily-progress/${id}`, { method: "DELETE" }, token);
console.log("\n=== DONE ===");
