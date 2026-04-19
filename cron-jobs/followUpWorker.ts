import cron from "node-cron";
import Lead from "../models/lead.model";
import { sendMessageToLead } from "../services/messageService";

export const startFollowUpJob = () => {
  console.log("⏰ Follow-up job started...");

  cron.schedule("* * * * *", async () => {
    try {
      console.log("🔄 Checking follow-ups...");

      const now = new Date();

      const leads = await Lead.find({
        "followUp.active": true,
        "followUp.date": { $lte: now },
      }).limit(30); // 🔥 prevent overload

      if (!leads.length) return;

      console.log(`📊 Found ${leads.length} follow-ups`);

      for (const lead of leads) {
        try {
          if (!lead?._id) continue;

          console.log("📤 Sending follow-up to:", lead.fullName || "Unknown");

          await sendMessageToLead({
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

        } catch (err) {
          console.error("❌ Follow-up failed for:", lead._id, err);
        }
      }

    } catch (err) {
      console.error("💥 Cron job error:", err);
    }
  });
};