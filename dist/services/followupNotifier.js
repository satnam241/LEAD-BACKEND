"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFollowupNotifier = startFollowupNotifier;
exports.checkAndNotify = checkAndNotify;
const node_cron_1 = __importDefault(require("node-cron"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const admin_model_1 = __importDefault(require("../models/admin.model"));
const emailService_1 = require("./emailService");
function buildLeadRow(lead, label) {
    const date = lead.followUp?.date
        ? new Date(lead.followUp.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
        : "—";
    return `
    <tr>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${label}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${lead.fullName ?? "—"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${lead.phone ?? "—"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${lead.email ?? "—"}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${date}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;">${lead.followUp?.message ?? "—"}</td>
    </tr>
  `;
}
async function checkAndNotify() {
    try {
        const now = new Date();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        // Overdue — active follow-up, date already past, not resolved
        const overdueLeads = await lead_model_1.default.find({
            isDeleted: false,
            "followUp.active": true,
            "followUp.date": { $lt: now },
            "followUp.overdueStatus": { $ne: "resolved" },
        }).select("fullName phone email followUp");
        // Due today — active follow-up, date falls within today
        const dueTodayLeads = await lead_model_1.default.find({
            isDeleted: false,
            "followUp.active": true,
            "followUp.date": { $gte: startOfDay, $lte: endOfDay },
            "followUp.overdueStatus": { $ne: "resolved" },
        }).select("fullName phone email followUp");
        if (overdueLeads.length === 0 && dueTodayLeads.length === 0) {
            console.log("Follow-up notifier: nothing due, skipping email.");
            return;
        }
        const admin = await admin_model_1.default.findOne();
        if (!admin?.email) {
            console.error("Follow-up notifier: no admin email found.");
            return;
        }
        const rows = [
            ...overdueLeads.map((l) => buildLeadRow(l, "🔴 Overdue")),
            ...dueTodayLeads.map((l) => buildLeadRow(l, "🟡 Due Today")),
        ].join("");
        const html = `
      <h2>Follow-up Reminder</h2>
      <p>You have <strong>${overdueLeads.length}</strong> overdue and <strong>${dueTodayLeads.length}</strong> due-today follow-ups.</p>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">
        <thead>
          <tr style="background:#1e3a5f;color:#fff;">
            <th style="padding:8px 12px;border:1px solid #e2e8f0;">Status</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;">Name</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;">Phone</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;">Email</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;">Follow-up Date</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;">Note</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
        await (0, emailService_1.sendEmail)(admin.email, `Follow-up Reminder — ${overdueLeads.length} overdue, ${dueTodayLeads.length} due today`, html);
        console.log("Follow-up notifier: email sent to", admin.email);
    }
    catch (err) {
        console.error("Follow-up notifier error:", err);
    }
}
// ── Schedule: every day at 9:00 AM IST ──────────────────────────────
function startFollowupNotifier() {
    node_cron_1.default.schedule("0 9 * * *", checkAndNotify, { timezone: "Asia/Kolkata" });
    console.log("Follow-up notifier scheduled — daily 9:00 AM IST");
}
//# sourceMappingURL=followupNotifier.js.map