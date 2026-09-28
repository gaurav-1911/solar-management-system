import https from "https";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");
try {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
} catch (e) {}

https.get("https://api.ipify.org?format=json", (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    try {
      const parsed = JSON.parse(data);
      console.log("YOUR_CURRENT_PUBLIC_IP:", parsed.ip);
    } catch (e) {
      console.log("RAW_IP_RESPONSE:", data);
    }
  });
}).on("error", (err) => {
  console.error("IP Fetch Error:", err.message);
});
