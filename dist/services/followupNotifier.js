"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFollowupNotifier = startFollowupNotifier;
exports.checkAndNotify = checkAndNotify;
exports.checkExactTimeAlerts = checkExactTimeAlerts;
exports.checkAndNudgeInactiveLeads = checkAndNudgeInactiveLeads;
const node_cron_1 = __importDefault(require("node-cron"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const admin_model_1 = __importDefault(require("../models/admin.model"));
const emailService_1 = require("./emailService");
function buildLeadRow(lead, label) {
    const date = lead.followUp?.date
        ? new Date(lead.followUp.date).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
        })
        : "—";
    return `
    <tr>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${label}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">${lead.fullName ?? "—"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${lead.phone ?? "—"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${lead.email ?? "—"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${date}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#4f46e5">${lead.followUp?.message ?? "—"}</td>
    </tr>
  `;
}
// ✅ Recipient list — admin + both support emails
async function getRecipients() {
    const emails = new Set();
    const admin = await admin_model_1.default.findOne();
    if (admin?.email)
        emails.add(admin.email);
    if (process.env.SUPPORT_EMAIL?.trim())
        emails.add(process.env.SUPPORT_EMAIL.trim());
    if (process.env.SUPPORT_EMAIL1?.trim())
        emails.add(process.env.SUPPORT_EMAIL1.trim());
    return [...emails];
}
// ── Daily 9AM digest — overdue + due-today summary (unchanged) ────────────────
async function checkAndNotify() {
    try {
        const now = new Date();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const [overdueLeads, dueTodayLeads] = await Promise.all([
            lead_model_1.default.find({
                isDeleted: false,
                "followUp.active": true,
                "followUp.date": { $lt: startOfDay },
                "followUp.overdueStatus": { $ne: "resolved" },
            })
                .select("fullName phone email followUp")
                .sort({ "followUp.date": 1 })
                .lean(),
            lead_model_1.default.find({
                isDeleted: false,
                "followUp.active": true,
                "followUp.date": { $gte: startOfDay, $lte: endOfDay },
                "followUp.overdueStatus": { $ne: "resolved" },
            })
                .select("fullName phone email followUp")
                .sort({ "followUp.date": 1 })
                .lean(),
        ]);
        if (overdueLeads.length === 0 && dueTodayLeads.length === 0) {
            console.log("Follow-up notifier: nothing due, skipping email.");
            return;
        }
        const recipients = await getRecipients();
        if (!recipients.length) {
            console.error("Follow-up notifier: no recipients configured.");
            return;
        }
        const rows = [
            ...overdueLeads.map((l) => buildLeadRow(l, "🔴 Overdue")),
            ...dueTodayLeads.map((l) => buildLeadRow(l, "🟡 Due Today")),
        ].join("");
        const html = `
      <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
        <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;color:#fff;font-size:18px">📅 Follow-up Reminder</h2>
          <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px">
            ${new Date().toLocaleDateString("en-IN", { dateStyle: "full" })}
          </p>
        </div>

        <div style="background:#fff;padding:16px 24px;border:1px solid #e2e8f0">
          <p style="margin:0 0 16px;font-size:13px;color:#475569">
            You have
            <strong style="color:#dc2626">${overdueLeads.length} overdue</strong>
            and
            <strong style="color:#d97706">${dueTodayLeads.length} due-today</strong>
            follow-ups.
          </p>

          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead>
              <tr style="background:#1e3a5f;color:#fff">
                <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Status</th>
                <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Name</th>
                <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Phone</th>
                <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Email</th>
                <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Scheduled</th>
                <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Note</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div style="background:#f8fafc;padding:12px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Automated alert from Lead CRM · Please take action on these follow-ups.
          </p>
        </div>
      </div>
    `;
        const subject = `📅 Follow-up Reminder — ${overdueLeads.length} overdue, ${dueTodayLeads.length} due today`;
        await Promise.all(recipients.map((email) => (0, emailService_1.sendEmail)(email, subject, html)));
        console.log(`✅ Follow-up email sent to: ${recipients.join(", ")}`);
        console.log(`   Overdue: ${overdueLeads.length} | Due today: ${dueTodayLeads.length}`);
    }
    catch (err) {
        console.error("Follow-up notifier error:", err);
    }
}
// ── 🆕 Exact-time alert — admin ne jo exact time select kiya usi time (±5 min) pe ────
async function checkExactTimeAlerts() {
    try {
        const now = new Date();
        const windowStart = new Date(now.getTime() - 5 * 60000); // pichle 5 min
        const dueNow = await lead_model_1.default.find({
            isDeleted: false,
            "followUp.active": true,
            "followUp.date": { $gte: windowStart, $lte: now },
            "followUp.notifiedAt": null,
        }).select("fullName phone email followUp");
        if (!dueNow.length)
            return;
        const recipients = await getRecipients();
        if (!recipients.length) {
            console.error("Exact-time notifier: no recipients configured.");
            return;
        }
        for (const lead of dueNow) {
            const html = `
        <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
          <div style="background:#1e3a5f;padding:16px 20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;color:#fff;font-size:16px">⏰ Follow-up Due Now</h2>
          </div>
          <div style="background:#fff;padding:12px 16px;border:1px solid #e2e8f0">
            <table style="border-collapse:collapse;width:100%;font-size:13px">
              <tbody>${buildLeadRow(lead, "🔔 Due")}</tbody>
            </table>
          </div>
        </div>
      `;
            await Promise.all(recipients.map((email) => (0, emailService_1.sendEmail)(email, `⏰ Follow-up due now: ${lead.fullName ?? "Lead"}`, html)));
            await lead_model_1.default.findByIdAndUpdate(lead._id, {
                $set: { "followUp.notifiedAt": now },
            });
            console.log(`✅ Exact-time alert sent for lead ${lead._id}`);
        }
    }
    catch (err) {
        console.error("Exact-time notifier error:", err);
    }
}
// ── 🆕 Smart Inactive Follow-ups (Drip Re-engagement) ─────────────────────────
// Re-engages dormant/ghosting leads after 24-48 hours of silence
async function checkAndNudgeInactiveLeads() {
    try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
        const inactiveLeads = await lead_model_1.default.find({
            isDeleted: false,
            phone: { $exists: true, $ne: "" },
            status: { $in: ["new", "contacted", "interested"] },
            reminderCount: { $lt: 3 }, // Maximum 3 nudges to maintain courtesy
            $or: [
                { lastReminderSent: null },
                { lastReminderSent: { $lt: twentyFourHoursAgo } },
            ],
            updatedAt: { $gte: seventyTwoHoursAgo, $lte: twentyFourHoursAgo },
        })
            .populate("projectId", "name location")
            .limit(20);
        if (inactiveLeads.length === 0) {
            return;
        }
        console.log(`[Smart Follow-up] Found ${inactiveLeads.length} inactive lead(s) for gentle re-engagement.`);
        const { sendWhatsAppUnified } = await Promise.resolve().then(() => __importStar(require("./whatsappService")));
        const ConversationMessage = (await Promise.resolve().then(() => __importStar(require("../models/conversationMessage.model")))).default;
        for (const lead of inactiveLeads) {
            if (!lead.phone)
                continue;
            const projectName = lead.projectId?.name ? `*${lead.projectId.name}*` : "our property";
            const nudgeMessage = `Hi ${lead.fullName || "there"}! 👋 Hope you're doing well.\n\nMain ${projectName} ke regarding follow up kar raha tha. Kya aapko pricing aur project details review karne ka mauka mila?\n\nAgar aapka koi question hai, sample flat visit plan karna chahte hain, ya floor plan dekhna ho, toh zaroor batayein — I am here to help! 🏡`;
            try {
                await sendWhatsAppUnified(lead.phone, nudgeMessage);
                console.log(`[Smart Follow-up] 📨 Dispatched gentle nudge to ${lead.phone} (${lead.fullName})`);
                await lead_model_1.default.findByIdAndUpdate(lead._id, {
                    $inc: { reminderCount: 1 },
                    $set: { lastReminderSent: now },
                });
                await ConversationMessage.create({
                    leadId: lead._id,
                    phone: lead.phone,
                    role: "assistant",
                    content: nudgeMessage,
                    createdAt: now,
                }).catch(() => { });
            }
            catch (sendErr) {
                console.warn(`[Smart Follow-up] Failed to nudge ${lead.phone}:`, sendErr?.message || sendErr);
            }
        }
    }
    catch (err) {
        console.error("[Smart Follow-up] Error in checkAndNudgeInactiveLeads:", err?.message || err);
    }
}
// ── Schedules ──────────────────────────────────────────────────────────────────
function startFollowupNotifier() {
    // Daily 9AM digest — overdue + due-today summary
    node_cron_1.default.schedule("0 9 * * *", checkAndNotify, { timezone: "Asia/Kolkata" });
    // Har 5 minute — jis exact time pe follow-up schedule hua usi time alert bhejo
    node_cron_1.default.schedule("*/5 * * * *", checkExactTimeAlerts, { timezone: "Asia/Kolkata" });
    // 🆕 Smart Inactive Follow-ups — Daily at 11:30 AM & 5:30 PM IST (respectful business hours)
    node_cron_1.default.schedule("30 11,17 * * *", checkAndNudgeInactiveLeads, { timezone: "Asia/Kolkata" });
    console.log("Follow-up notifiers scheduled — daily 9:00 AM digest + every 5min exact-time alert + smart inactive nudges (11:30 AM & 5:30 PM)");
}
//# sourceMappingURL=followupNotifier.js.map