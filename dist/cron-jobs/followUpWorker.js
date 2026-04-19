"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFollowUpJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const messageService_1 = require("../services/messageService");
const startFollowUpJob = () => {
    console.log("⏰ Follow-up job started...");
    node_cron_1.default.schedule("* * * * *", async () => {
        try {
            console.log("🔄 Checking follow-ups...");
            const now = new Date();
            const leads = await lead_model_1.default.find({
                "followUp.active": true,
                "followUp.date": { $lte: now },
            }).limit(30); // 🔥 prevent overload
            if (!leads.length)
                return;
            console.log(`📊 Found ${leads.length} follow-ups`);
            for (const lead of leads) {
                try {
                    if (!lead?._id)
                        continue;
                    console.log("📤 Sending follow-up to:", lead.fullName || "Unknown");
                    await (0, messageService_1.sendMessageToLead)({
                        leadId: lead._id.toString(),
                        messageType: "both",
                        customMessage: lead.followUp?.message || undefined,
                    });
                    // ✅ mark done
                    if (lead.followUp) {
                        lead.followUp.active = false;
                    }
                    await lead.save();
                    console.log("✅ Follow-up completed:", lead._id);
                }
                catch (err) {
                    console.error("❌ Follow-up failed for:", lead._id, err);
                }
            }
        }
        catch (err) {
            console.error("💥 Cron job error:", err);
        }
    });
};
exports.startFollowUpJob = startFollowUpJob;
//# sourceMappingURL=followUpWorker.js.map