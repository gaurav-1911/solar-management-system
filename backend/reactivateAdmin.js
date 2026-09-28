import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";
import User from "./src/models/user.model.js";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dotenv.config();

// Recovery tool for the self-deactivation lockout: restores an account whose
// status was accidentally set to "inactive", which blocks every API request
// with "Account is inactive. Access denied." from the auth middleware.
//
// Usage:
//   node reactivateAdmin.js <email | username | _id>
//   e.g. node reactivateAdmin.js admin@solar.local
const identifier = (process.argv[2] || "").trim();

const run = async () => {
    if (!identifier) {
        console.error("Usage: node reactivateAdmin.js <email | username | _id>");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URL, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log("MongoDB Connected...");

    const user = await User.findOne({
        $or: [
            { email: identifier.toLowerCase() },
            { username: identifier.toLowerCase() },
            ...(mongoose.Types.ObjectId.isValid(identifier)
                ? [{ _id: identifier }]
                : [])
        ]
    });

    if (!user) {
        console.error(`No user found for "${identifier}"`);
        await mongoose.disconnect();
        process.exit(1);
    }

    if (user.status === "active") {
        console.log(`${user.email} is already active — nothing to do.`);
    } else {
        await User.updateOne({ _id: user._id }, { $set: { status: "active" } });
        console.log(
            `Reactivated ${user.name || user.email} (${user.email}) — status: "${user.status}" -> "active"`
        );
    }

    await mongoose.disconnect();
    console.log("Done");
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
