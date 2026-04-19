"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteActivity = exports.updateActivity = exports.getActivities = exports.addActivity = void 0;
const activity_model_1 = __importDefault(require("../models/activity.model"));
// 🟢 Add new activity
const addActivity = async (req, res) => {
    try {
        const { userId, adminId, text } = req.body;
        if (!userId || !text)
            return res.status(400).json({ error: "userId and text required" });
        const activity = await activity_model_1.default.create({
            userId,
            adminId: adminId || "admin",
            text,
        });
        res.status(201).json(activity);
    }
    catch (error) {
        console.error("Error adding activity:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.addActivity = addActivity;
// 🟢 Get all activities for specific user
const getActivities = async (req, res) => {
    try {
        const { userId } = req.params;
        const { startDate, endDate } = req.query;
        let query = { userId };
        // ✅ Optional date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate)
                query.createdAt.$gte = new Date(startDate);
            if (endDate)
                query.createdAt.$lte = new Date(endDate);
        }
        const activities = await activity_model_1.default.find(query).sort({ createdAt: -1 });
        res.json(activities);
    }
    catch (error) {
        console.error("Error fetching activities:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getActivities = getActivities;
// 🟢 Update activity (edit text)
const updateActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        if (!text)
            return res.status(400).json({ error: "Text is required" });
        const updated = await activity_model_1.default.findByIdAndUpdate(id, { text, updatedAt: new Date() }, { new: true });
        if (!updated)
            return res.status(404).json({ error: "Activity not found" });
        res.json(updated);
    }
    catch (error) {
        console.error("Error updating activity:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.updateActivity = updateActivity;
// 🗑️ Delete activity
const deleteActivity = async (req, res) => {
    try {
        const { id } = req.params;
        await activity_model_1.default.findByIdAndDelete(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error deleting activity:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.deleteActivity = deleteActivity;
//# sourceMappingURL=activity.controller.js.map