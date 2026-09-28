import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import seedRoles from "./src/seeders/role.seeder.js";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URL, {
    family: 4,
    serverSelectionTimeoutMS: 15000,
  });
  await seedRoles();
  await mongoose.connection.close();
  console.log("System role permissions canonicalized.");
  process.exit(0);
};

run().catch((err) => {
  console.error("FIX FAILED:", err.message);
  process.exit(1);
});
