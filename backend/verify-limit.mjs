const BASE = "http://localhost:5000/api";
async function req(path, opts = {}, token) {
  const res = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const text = await res.text();
  console.log(`${opts.method || "GET"} ${path} -> ${res.status} | ${text.slice(0, 220)}`);
  let body = null; try { body = JSON.parse(text); } catch {}
  return { status: res.status, body };
}
const login = await req("/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@solar.com", password: "Admin@123" }) });
const token = login.body?.data?.token || login.body?.token;
const base = {
  date: "2026-08-06", project: "dairy farm solar", technician: "Limit Tech", workPerformed: "limit test", status: "In Progress", progress: 10,
  materials: "Tata Power Solar x66", qty: 66, materialUsage: [{ name: "Tata Power Solar", qty: 66 }],
  workers: 1, delayStatus: "No", weather: "Sunny", supervisorName: "S", approvalStatus: "Approved",
};
const created = await req("/daily-progress", { method: "POST", body: JSON.stringify(base) }, token);
const id = created.body?.data?._id;
if (id) await req(`/daily-progress/${id}`, { method: "DELETE" }, token);
