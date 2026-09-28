import Settings from "../models/settings.model.js";
import { validateUpdateSettings } from "../validations/settings.validation.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

export const getSettings = async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        res.status(200).json({
            success: true,
            message: "Settings fetched successfully",
            data: settings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateSettings = async (req, res) => {
    try {
        const { error, value } = validateUpdateSettings.validate(req.body);
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create(value);
        } else {
            settings = await Settings.findOneAndUpdate(
                {},
                { $set: value },
                { new: true, runValidators: true }
            );
        }

        try { logActivity({ module: "settings", action: "updated", recordId: settings._id, recordLabel: "System Settings", req, summary: "System settings updated" }); } catch (_) {}
        res.status(200).json({
            success: true,
            message: "Settings updated successfully",
            data: settings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
