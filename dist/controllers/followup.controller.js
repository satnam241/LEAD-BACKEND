"use strict";
// import { Request, Response } from "express";
// import Lead from "../models/lead.model";
// //import FollowUpLog from "../models/followUpLog.model";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFollowUpStats = exports.rescheduleFollowUp = exports.resolveFollowUp = exports.acknowledgeFollowUp = exports.getOverdueFollowUps = exports.getDueFollowUps = exports.getUpcomingFollowUps = exports.listFollowUps = exports.cancelFollowUp = exports.scheduleFollowUp = void 0;
const lead_model_1 = __importDefault(require("../models/lead.model"));
const followupLog_model_1 = __importDefault(require("../models/followupLog.model"));
const mongoose_1 = __importDefault(require("mongoose"));
// 🔥 Better recurrence handling
const computeNextDate = (recurrence, from) => {
    const base = from ? new Date(from) : new Date();
    switch (recurrence) {
        case "tomorrow":
            base.setDate(base.getDate() + 1);
            break;
        case "3days":
            base.setDate(base.getDate() + 3);
            break;
        case "weekly":
            base.setDate(base.getDate() + 7);
            break;
        default:
            break;
    }
    return base;
};
// ✅ Schedule Follow-up
const scheduleFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { recurrence, date, message, whatsappOptIn } = req.body;
        const lead = await lead_model_1.default.findById(id);
        if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }
        if (!date && !recurrence) {
            return res.status(400).json({
                success: false,
                error: "Either date or recurrence is required",
            });
        }
        let followDate;
        if (date) {
            followDate = new Date(date);
        }
        else {
            followDate = computeNextDate(recurrence);
        }
        lead.followUp = {
            date: followDate,
            recurrence: recurrence || "once",
            message: message || null,
            whatsappOptIn: !!whatsappOptIn,
            active: true,
            // 🆕 reset overdue tracking on reschedule
            overdueStatus: "pending",
            acknowledgedAt: null,
            rescheduledAt: null,
            resolvedAt: null,
        };
        await lead.save();
        return res.json({
            success: true,
            message: "Follow-up scheduled successfully",
            data: lead.followUp,
        });
    }
    catch (err) {
        console.error("Schedule follow-up error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.scheduleFollowUp = scheduleFollowUp;
// ✅ Cancel Follow-up
const cancelFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const lead = await lead_model_1.default.findById(id);
        if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }
        lead.followUp = {
            date: null,
            recurrence: null,
            message: null,
            whatsappOptIn: false,
            active: false,
            overdueStatus: "pending",
            acknowledgedAt: null,
            rescheduledAt: null,
            resolvedAt: null,
        };
        await lead.save();
        return res.json({ success: true, message: "Follow-up cancelled" });
    }
    catch (err) {
        console.error("Cancel follow-up error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.cancelFollowUp = cancelFollowUp;
// ✅ List All Active Follow-ups
const listFollowUps = async (_req, res) => {
    try {
        const followUps = await lead_model_1.default.find({
            "followUp.active": true,
            "followUp.date": { $ne: null },
        })
            .select("fullName phone email followUp")
            .sort({ "followUp.date": 1 });
        return res.json({ success: true, data: followUps });
    }
    catch (err) {
        console.error("List follow-ups error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.listFollowUps = listFollowUps;
// ✅ Upcoming Follow-ups
const getUpcomingFollowUps = async (req, res) => {
    try {
        const now = new Date();
        const { search, fromDate, toDate } = req.query;
        const filter = {
            "followUp.active": true,
            "followUp.date": { $gte: now },
        };
        if (fromDate || toDate) {
            filter["followUp.date"] = {
                ...(fromDate && { $gte: new Date(fromDate) }),
                ...(toDate && { $lte: new Date(toDate) }),
            };
        }
        if (search) {
            const regex = new RegExp(search, "i");
            filter.$or = [{ fullName: regex }, { phone: regex }, { email: regex }];
        }
        const leads = await lead_model_1.default.find(filter)
            .select("fullName phone email followUp")
            .sort({ "followUp.date": 1 })
            .lean();
        const validRecurrences = ["once", "tomorrow", "3days", "weekly"];
        const data = leads.map((lead) => {
            let recurrence = lead.followUp?.recurrence;
            if (!validRecurrences.includes(recurrence))
                recurrence = "once";
            return { ...lead, followUp: { ...lead.followUp, recurrence } };
        });
        return res.json({ success: true, count: data.length, data });
    }
    catch (err) {
        console.error("Upcoming follow-ups error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getUpcomingFollowUps = getUpcomingFollowUps;
// ✅ Due Today Follow-ups
const getDueFollowUps = async (_req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const due = await lead_model_1.default.find({
            "followUp.active": true,
            "followUp.date": { $gte: startOfDay, $lte: endOfDay },
        })
            .select("fullName phone email followUp")
            .sort({ "followUp.date": 1 });
        return res.json({ success: true, data: due });
    }
    catch (err) {
        console.error("Due follow-ups error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getDueFollowUps = getDueFollowUps;
// ✅ Overdue Follow-ups — enhanced (delete nahi, status track karo)
const getOverdueFollowUps = async (_req, res) => {
    try {
        const now = new Date();
        const overdue = await lead_model_1.default.find({
            "followUp.date": { $lt: now },
            "followUp.overdueStatus": { $ne: "resolved" }, // resolved wale hide karo
        })
            .select("fullName phone email followUp status createdAt")
            .sort({ "followUp.date": 1 });
        // Kitne time se overdue hai — human readable label
        const data = overdue.map((lead) => {
            const overdueMs = now.getTime() - new Date(lead.followUp.date).getTime();
            const mins = Math.floor(overdueMs / 60000);
            const hours = Math.floor(mins / 60);
            const days = Math.floor(hours / 24);
            const overdueLabel = days > 0 ? `${days}d overdue` :
                hours > 0 ? `${hours}h overdue` :
                    `${mins}m overdue`;
            return {
                _id: lead._id,
                fullName: lead.fullName,
                phone: lead.phone,
                email: lead.email,
                status: lead.status,
                followUp: lead.followUp,
                overdueLabel,
                overdueMs,
            };
        });
        return res.json({ success: true, count: data.length, data });
    }
    catch (err) {
        console.error("Overdue follow-ups error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getOverdueFollowUps = getOverdueFollowUps;
// ✅ Acknowledge — "dekh liya"
const acknowledgeFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const lead = await lead_model_1.default.findByIdAndUpdate(id, {
            $set: {
                "followUp.overdueStatus": "acknowledged",
                "followUp.acknowledgedAt": new Date(),
            },
        }, { new: true });
        if (!lead)
            return res.status(404).json({ success: false, error: "Lead not found" });
        return res.json({ success: true, message: "Acknowledged", data: lead.followUp });
    }
    catch (err) {
        console.error("Acknowledge error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.acknowledgeFollowUp = acknowledgeFollowUp;
// ✅ Resolve — follow-up complete, FollowUpLog mein entry
const resolveFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { note, type = "whatsapp" } = req.body;
        const lead = await lead_model_1.default.findById(id);
        if (!lead)
            return res.status(404).json({ success: false, error: "Lead not found" });
        // Deactivate + mark resolved
        await lead_model_1.default.findByIdAndUpdate(id, {
            $set: {
                "followUp.active": false,
                "followUp.overdueStatus": "resolved",
                "followUp.resolvedAt": new Date(),
            },
        });
        const rawId = req.params.id;
        const leadId = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!mongoose_1.default.Types.ObjectId.isValid(leadId)) {
            return res.status(400).json({ error: "Invalid lead ID" });
        }
        // Log banao
        await followupLog_model_1.default.create({
            leadId: new mongoose_1.default.Types.ObjectId(leadId),
            message: note || lead.followUp?.message || "Follow-up completed",
            type,
            status: "sent",
            scheduledAt: lead.followUp?.date,
            sentAt: new Date(),
        });
        return res.json({ success: true, message: "Follow-up resolved and logged" });
    }
    catch (err) {
        console.error("Resolve error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.resolveFollowUp = resolveFollowUp;
// ✅ Reschedule — kal ke liye ya custom date
const rescheduleFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { newDate } = req.body;
        // Default: kal 10 baje
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        const scheduledDate = newDate ? new Date(newDate) : tomorrow;
        const lead = await lead_model_1.default.findByIdAndUpdate(id, {
            $set: {
                "followUp.date": scheduledDate,
                "followUp.active": true,
                "followUp.overdueStatus": "rescheduled",
                "followUp.rescheduledAt": new Date(),
            },
        }, { new: true });
        if (!lead)
            return res.status(404).json({ success: false, error: "Lead not found" });
        return res.json({
            success: true,
            message: `Rescheduled to ${scheduledDate.toLocaleDateString("en-IN")}`,
            data: lead.followUp,
        });
    }
    catch (err) {
        console.error("Reschedule error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.rescheduleFollowUp = rescheduleFollowUp;
// ✅ Stats — dashboard counts
const getFollowUpStats = async (_req, res) => {
    try {
        const now = new Date();
        const [overdue, upcoming, resolved] = await Promise.all([
            lead_model_1.default.countDocuments({
                "followUp.active": true,
                "followUp.date": { $lt: now },
                "followUp.overdueStatus": { $ne: "resolved" },
            }),
            lead_model_1.default.countDocuments({
                "followUp.active": true,
                "followUp.date": { $gte: now },
            }),
            lead_model_1.default.countDocuments({
                "followUp.overdueStatus": "resolved",
            }),
        ]);
        return res.json({ success: true, data: { overdue, upcoming, resolved } });
    }
    catch (err) {
        console.error("Stats error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getFollowUpStats = getFollowUpStats;
//# sourceMappingURL=followup.controller.js.map