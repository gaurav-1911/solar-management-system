import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

dotenv.config();

const uri = process.env.MONGODB_URL;

console.log("Connecting to MongoDB Atlas with DNS config...");

mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, family: 4 })
  .then((conn) => console.log("🎉 SUCCESS! MONGODB CONNECTED:", conn.connection.host))
  .catch((err) => console.error("❌ CONNECTION ERROR:", err.message))
  .finally(() => setTimeout(() => process.exit(0), 1000));
