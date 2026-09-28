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
  console.log(text.slice(0, 400));
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body };
}

const login = await req("/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@solar.com", password: "Admin@123" }) });
const token = login.body?.data?.token || login.body?.token;
console.log("TOKEN:", token ? token.slice(0, 24) + "..." : "NONE");

await req("/daily-progress/project-materials?project=dairy%20farm%20solar", {}, token);

const base = {
  date: "2026-08-06", project: "dairy farm solar", technician: "Test Technician",
  workPerformed: "Reproduction test", status: "In Progress", progress: 10,
  materials: "Tata Power Solar x30", qty: 30,
  materialUsage: [{ name: "Tata Power Solar", qty: 30 }],
  workers: 2, delayStatus: "No", delayReason: "", weather: "Sunny", weatherDesc: "",
  gpsLat: "", gpsLng: "", supervisorName: "Test Supervisor", approvalStatus: "Approved",
  approvalRemarks: "", completedTasks: "", pendingTasks: "", nextDayPlan: "", issuesFound: "", customerRemarks: "",
};

const created = await req("/daily-progress", { method: "POST", body: JSON.stringify(base) }, token);
const id = created.body?.data?._id;
console.log("CREATED ID:", id);
if (!id) { process.exit(1); }

await req(`/daily-progress/project-materials?project=dairy%20farm%20solar&excludeLogId=${id}`, {}, token);

const upd = { ...base, materials: "Tata Power Solar x35", qty: 35, materialUsage: [{ name: "Tata Power Solar", qty: 35 }] };
await req(`/daily-progress/${id}`, { method: "PUT", body: JSON.stringify(upd) }, token);

await req(`/daily-progress/${id}`, { method: "DELETE" }, token);
console.log("\n=== DONE ===");
