import mongoose from "mongoose";
import dns from "dns";
import logger from "../utils/logger.js";

// Enable IPv4 ordering and public DNS resolvers for Windows SRV lookups
dns.setDefaultResultOrder("ipv4first");
try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const connectDB = async (retryCount = 0) => {
    try {
        const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI;
        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            family: 4,
        });

        logger.info(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
        return true;
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            logger.warn(
                `⚠️  MongoDB connection attempt ${retryCount + 1}/${MAX_RETRIES} failed: ${error.message}`
            );
            logger.info(`   Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            return connectDB(retryCount + 1);
        }
        logger.error(`❌ MongoDB failed to connect after ${MAX_RETRIES} attempts: ${error.message}`);
        return false;
    }
};

export default connectDB;