"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFollowUpStats = exports.rescheduleFollowUp = exports.resolveFollowUp = exports.acknowledgeFollowUp = exports.getOverdueFollowUps = exports.getDueFollowUps = exports.getUpcomingFollowUps = exports.listFollowUps = exports.cancelFollowUp = exports.scheduleFollowUp = void 0;
const lead_model_1 = __importDefault(require("../models/lead.model"));
const followupLog_model_1 = __importDefault(require("../models/followupLog.model"));
const admin_model_1 = __importDefault(require("../models/admin.model"));
const tenant_model_1 = __importDefault(require("../models/tenant.model"));
const googleCalendar_service_1 = require("../services/googleCalendar.service");
const mongoose_1 = __importDefault(require("mongoose"));
const adminAuth_1 = require("../middleware/adminAuth");
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
    }
    return base;
};
// Helper to resolve Google Calendar refresh token for tenant or admin
async function getRefreshTokenForRequest(req) {
    try {
        if (req.tenantId) {
            const tenant = await tenant_model_1.default.findById(req.tenantId).lean();
            if (tenant?.googleConfig?.refreshToken && tenant.googleConfig?.isConnected) {
                return tenant.googleConfig.refreshToken;
            }
        }
        const admin = await admin_model_1.default.findById(req.adminId).lean();
        if (admin?.googleCalendar?.refreshToken && admin.googleCalendar?.isConnected) {
            return admin.googleCalendar.refreshToken;
        }
    }
    catch { }
    return null;
}
// ── Schedule Follow-up ────────────────────────────────────────────────────────
const scheduleFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { recurrence, date, message, whatsappOptIn } = req.body;
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const lead = await lead_model_1.default.findOne({ _id: id, ...tenantFilter });
        if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }
        if (!date && !recurrence) {
            return res.status(400).json({
                success: false,
                error: "Either date or recurrence is required",
            });
        }
        const followDate = date ? new Date(date) : computeNextDate(recurrence);
        await lead_model_1.default.findOneAndUpdate({ _id: id, ...tenantFilter }, {
            $set: {
                "followUp.date": followDate,
                "followUp.recurrence": recurrence || "once",
                "followUp.message": message || null,
                "followUp.whatsappOptIn": !!whatsappOptIn,
                "followUp.active": true,
                "followUp.overdueStatus": "pending",
                "followUp.acknowledgedAt": null,
                "followUp.rescheduledAt": null,
                "followUp.resolvedAt": null,
                "followUp.notifiedAt": null,
                ...(message ? { note: message } : {}),
            },
        }, { new: true });
        // Google Calendar sync
        try {
            const refreshToken = await getRefreshTokenForRequest(req);
            if (refreshToken) {
                const updatedLead = await lead_model_1.default.findById(id);
                if (updatedLead) {
                    const event = await (0, googleCalendar_service_1.createCalendarEvent)(refreshToken, updatedLead);
                    if (event?.id) {
                        await lead_model_1.default.findByIdAndUpdate(id, { $set: { "followUp.googleEventId": event.id } });
                    }
                }
            }
        }
        catch (calErr) {
            console.error("Google Calendar sync error (non-fatal):", calErr);
        }
        const finalLead = await lead_model_1.default.findById(id);
        return res.json({
            success: true,
            message: "Follow-up scheduled successfully",
            data: finalLead?.followUp,
        });
    }
    catch (err) {
        console.error("Schedule error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.scheduleFollowUp = scheduleFollowUp;
// ── Cancel Follow-up ──────────────────────────────────────────────────────────
const cancelFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const lead = await lead_model_1.default.findOne({ _id: id, ...tenantFilter });
        if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }
        // Google Calendar delete
        try {
            const refreshToken = await getRefreshTokenForRequest(req);
            if (lead.followUp?.googleEventId && refreshToken) {
                await (0, googleCalendar_service_1.deleteCalendarEvent)(refreshToken, lead.followUp.googleEventId);
                console.log("CALENDAR DELETED");
            }
        }
        catch (err) {
            console.log("DELETE ERROR", err);
        }
        await lead_model_1.default.findOneAndUpdate({ _id: id, ...tenantFilter }, {
            $set: {
                "followUp.date": null,
                "followUp.recurrence": null,
                "followUp.message": null,
                "followUp.whatsappOptIn": false,
                "followUp.active": false,
                "followUp.overdueStatus": "pending",
                "followUp.acknowledgedAt": null,
                "followUp.rescheduledAt": null,
                "followUp.resolvedAt": null,
                "followUp.googleEventId": null,
                "followUp.notifiedAt": null,
            },
        }, { new: true });
        return res.json({ success: true, message: "Follow-up cancelled" });
    }
    catch (err) {
        console.error("Cancel error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.cancelFollowUp = cancelFollowUp;
// ── List All Active Follow-ups ────────────────────────────────────────────────
const listFollowUps = async (req, res) => {
    try {
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const followUps = await lead_model_1.default.find({
            ...tenantFilter,
            "followUp.active": true,
            "followUp.date": { $ne: null },
        })
            .select("fullName phone email followUp note assignedTo assignedBy")
            .sort({ "followUp.date": 1 });
        return res.json({ success: true, data: followUps });
    }
    catch (err) {
        console.error("List follow-ups error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.listFollowUps = listFollowUps;
// ── Upcoming Follow-ups ───────────────────────────────────────────────────────
const getUpcomingFollowUps = async (req, res) => {
    try {
        const now = new Date();
        const { search, fromDate, toDate } = req.query;
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const filter = {
            ...tenantFilter,
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
            .select("fullName phone email followUp note assignedTo assignedBy")
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
// ── Due Today Follow-ups ──────────────────────────────────────────────────────
const getDueFollowUps = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const due = await lead_model_1.default.find({
            ...tenantFilter,
            "followUp.active": true,
            "followUp.date": { $gte: startOfDay, $lte: endOfDay },
        })
            .select("fullName phone email followUp note assignedTo assignedBy")
            .sort({ "followUp.date": 1 });
        return res.json({ success: true, data: due });
    }
    catch (err) {
        console.error("Due follow-ups error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getDueFollowUps = getDueFollowUps;
// ── Overdue Follow-ups ────────────────────────────────────────────────────────
const getOverdueFollowUps = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const overdue = await lead_model_1.default.find({
            ...tenantFilter,
            "followUp.date": { $ne: null, $lt: startOfDay },
            "followUp.overdueStatus": { $ne: "resolved" },
        })
            .select("fullName phone email followUp note assignedTo assignedBy status createdAt")
            .sort({ "followUp.date": 1 });
        const data = overdue.map((lead) => {
            const overdueMs = startOfDay.getTime() - new Date(lead.followUp.date).getTime();
            const mins = Math.floor(overdueMs / 60000);
            const hours = Math.floor(mins / 60);
            const days = Math.max(1, Math.floor(hours / 24));
            const overdueLabel = `${days}d overdue`;
            return {
                _id: lead._id,
                fullName: lead.fullName,
                phone: lead.phone,
                email: lead.email,
                status: lead.status,
                note: lead.note,
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
// ── Acknowledge Follow-up ─────────────────────────────────────────────────────
const acknowledgeFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const lead = await lead_model_1.default.findOneAndUpdate({ _id: id, ...tenantFilter }, {
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
// ── Resolve Follow-up ─────────────────────────────────────────────────────────
const resolveFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { note, type = "whatsapp" } = req.body;
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const lead = await lead_model_1.default.findOne({ _id: id, ...tenantFilter });
        if (!lead)
            return res.status(404).json({ success: false, error: "Lead not found" });
        await lead_model_1.default.findOneAndUpdate({ _id: id, ...tenantFilter }, {
            $set: {
                "followUp.active": false,
                "followUp.overdueStatus": "resolved",
                "followUp.resolvedAt": new Date(),
                ...(note ? { note } : {}),
            },
        });
        const rawId = req.params.id;
        const leadId = Array.isArray(rawId) ? rawId[0] : rawId;
        if (mongoose_1.default.Types.ObjectId.isValid(leadId)) {
            await followupLog_model_1.default.create({
                leadId: new mongoose_1.default.Types.ObjectId(leadId),
                message: note || lead.followUp?.message || "Follow-up completed",
                type,
                status: "sent",
                scheduledAt: lead.followUp?.date,
                sentAt: new Date(),
            });
        }
        return res.json({ success: true, message: "Follow-up resolved and logged" });
    }
    catch (err) {
        console.error("Resolve error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.resolveFollowUp = resolveFollowUp;
// ── Reschedule Follow-up ──────────────────────────────────────────────────────
const rescheduleFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { newDate } = req.body;
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        const scheduledDate = newDate ? new Date(newDate) : tomorrow;
        const lead = await lead_model_1.default.findOneAndUpdate({ _id: id, ...tenantFilter }, {
            $set: {
                "followUp.date": scheduledDate,
                "followUp.active": true,
                "followUp.overdueStatus": "rescheduled",
                "followUp.rescheduledAt": new Date(),
                "followUp.notifiedAt": null,
            },
        }, { new: true });
        if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }
        try {
            const refreshToken = await getRefreshTokenForRequest(req);
            if (lead.followUp?.googleEventId && refreshToken) {
                await (0, googleCalendar_service_1.updateCalendarEvent)(refreshToken, lead.followUp.googleEventId, lead);
                console.log("CALENDAR UPDATED");
            }
        }
        catch (err) {
            console.log("CALENDAR UPDATE ERROR", err);
        }
        return res.json({
            success: true,
            message: `Rescheduled to ${scheduledDate.toLocaleString("en-IN")}`,
            data: lead.followUp,
        });
    }
    catch (err) {
        console.error("Reschedule error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.rescheduleFollowUp = rescheduleFollowUp;
// ── Follow-up Stats ───────────────────────────────────────────────────────────
const getFollowUpStats = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const tenantFilter = (0, adminAuth_1.getTenantFilter)(req);
        const [overdue, upcoming, resolved] = await Promise.all([
            lead_model_1.default.countDocuments({
                ...tenantFilter,
                "followUp.date": { $ne: null, $lt: startOfDay },
                "followUp.overdueStatus": { $ne: "resolved" },
            }),
            lead_model_1.default.countDocuments({
                ...tenantFilter,
                "followUp.active": true,
                "followUp.date": { $gte: startOfDay },
            }),
            lead_model_1.default.countDocuments({
                ...tenantFilter,
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