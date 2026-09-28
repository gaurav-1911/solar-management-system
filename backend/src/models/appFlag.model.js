import mongoose from "mongoose";

// Lightweight key/value flags used for one-time application bootstrap steps
// (e.g. "default product categories already seeded"). Kept separate from the
// Settings blob so seeding markers never collide with user-facing settings.
const appFlagSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            default: true
        }
    },
    {
        timestamps: true
    }
);

const AppFlag = mongoose.model("AppFlag", appFlagSchema);

export default AppFlag;
