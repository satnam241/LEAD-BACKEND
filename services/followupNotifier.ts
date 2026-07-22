import cron from "node-cron";
import Lead from "../models/lead.model";
import Admin from "../models/admin.model";
import { sendEmail } from "./emailService";

function buildLeadRow(lead: any, label: string): string {
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
async function getRecipients(): Promise<string[]> {
  const emails = new Set<string>();

  const admin = await Admin.findOne();
  if (admin?.email) emails.add(admin.email);

  if (process.env.SUPPORT_EMAIL?.trim())
    emails.add(process.env.SUPPORT_EMAIL.trim());
  if (process.env.SUPPORT_EMAIL1?.trim())
    emails.add(process.env.SUPPORT_EMAIL1.trim());

  return [...emails];
}

// ── Daily 9AM digest — overdue + due-today summary (unchanged) ────────────────
async function checkAndNotify() {
  try {
    const now        = new Date();
    const startOfDay = new Date(); startOfDay.setHours(0,  0,  0,   0);
    const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999);

    const [overdueLeads, dueTodayLeads] = await Promise.all([
      Lead.find({
        isDeleted: false,
        "followUp.active": true,
        "followUp.date":   { $lt: startOfDay },
        "followUp.overdueStatus": { $ne: "resolved" },
      })
        .select("fullName phone email followUp")
        .sort({ "followUp.date": 1 })
        .lean(),

      Lead.find({
        isDeleted: false,
        "followUp.active": true,
        "followUp.date":   { $gte: startOfDay, $lte: endOfDay },
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

    await Promise.all(
      recipients.map((email) => sendEmail(email, subject, html))
    );

    console.log(`✅ Follow-up email sent to: ${recipients.join(", ")}`);
    console.log(`   Overdue: ${overdueLeads.length} | Due today: ${dueTodayLeads.length}`);
  } catch (err) {
    console.error("Follow-up notifier error:", err);
  }
}

// ── 🆕 Exact-time alert — admin ne jo exact time select kiya usi time (±5 min) pe ────
async function checkExactTimeAlerts() {
  try {
    const now         = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60000); // pichle 5 min

    const dueNow = await Lead.find({
      isDeleted: false,
      "followUp.active": true,
      "followUp.date": { $gte: windowStart, $lte: now },
      "followUp.notifiedAt": null,
    }).select("fullName phone email followUp");

    if (!dueNow.length) return;

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

      await Promise.all(
        recipients.map((email) =>
          sendEmail(email, `⏰ Follow-up due now: ${lead.fullName ?? "Lead"}`, html)
        )
      );

      await Lead.findByIdAndUpdate(lead._id, {
        $set: { "followUp.notifiedAt": now },
      });

      console.log(`✅ Exact-time alert sent for lead ${lead._id}`);
    }
  } catch (err) {
    console.error("Exact-time notifier error:", err);
  }
}

// ── Schedules ──────────────────────────────────────────────────────────────────
export function startFollowupNotifier() {
  // Daily 9AM digest — overdue + due-today summary
  cron.schedule("0 9 * * *", checkAndNotify, { timezone: "Asia/Kolkata" });

  // 🆕 Har 5 minute — jis exact time pe follow-up schedule hua usi time alert bhejo
  cron.schedule("*/5 * * * *", checkExactTimeAlerts, { timezone: "Asia/Kolkata" });

  console.log("Follow-up notifiers scheduled — daily 9:00 AM digest + every 5min exact-time alert");
}

export { checkAndNotify, checkExactTimeAlerts };