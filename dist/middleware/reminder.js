"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const messageService_1 = require("../services/messageService");
// ⏱️ Run every 5 minutes
node_cron_1.default.schedule("*/5 * * * *", async () => {
    try {
        console.log("⏱️ Running follow-up cron...");
        const now = new Date();
        // 1️⃣ Find leads whose follow-up date is due
        const dueLeads = await lead_model_1.default.find({
            "followUp.active": true,
            "followUp.date": { $lte: now }
        });
        for (const lead of dueLeads) {
            // 🔥 FIXED: lead._id always string
            const leadId = String(lead._id);
            console.log("🔔 Follow-up due for lead:", leadId);
            // 2️⃣ Auto send BOTH: WhatsApp + Email + Brochure
            try {
                await (0, messageService_1.sendMessageToLead)({
                    leadId: String(lead._id), // ensure string
                    messageType: "both",
                    customMessage: lead.followUp?.message || undefined,
                });
                console.log(`📩 Auto follow-up sent to lead ${lead._id}`);
            }
            catch (err) {
                console.error(`❌ Error sending auto message to ${lead._id}:`, err);
            }
            // 3️⃣ Recurrence logic (tomorrow / 3days / weekly)
            const recurrence = lead.followUp?.recurrence;
            if (recurrence && recurrence !== "once") {
                const nextDate = (() => {
                    const cur = new Date(lead.followUp.date || now);
                    if (recurrence === "tomorrow")
                        cur.setDate(cur.getDate() + 1);
                    else if (recurrence === "3days")
                        cur.setDate(cur.getDate() + 3);
                    else if (recurrence === "weekly")
                        cur.setDate(cur.getDate() + 7);
                    else
                        cur.setDate(cur.getDate() + 1); // default fallback
                    return cur;
                })();
                lead.followUp.date = nextDate;
                console.log(`🔁 Next follow-up scheduled for ${nextDate} (Lead: ${leadId})`);
            }
            else {
                // If once or no recurrence → disable future follow-ups
                lead.followUp = {
                    ...lead.followUp,
                    active: false,
                    date: null,
                    recurrence: null,
                    message: lead.followUp?.message || null
                };
                console.log(`🛑 Follow-up disabled for Lead: ${leadId}`);
            }
            // 4️⃣ Save updated lead
            await lead.save();
        }
    }
    catch (err) {
        console.error("❌ Follow-up cron failed:", err);
    }
});
//# sourceMappingURL=reminder.js.map