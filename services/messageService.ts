// services/messageService.ts

import Lead from "../models/lead.model";
import { sendEmail } from "./emailService";
import { sendWhatsAppUnified } from "./whatsappService";
import { getDefaultMessage } from "../utils/messageTemplates";

type MessageType = "email" | "whatsapp" | "both";

export const sendMessageToLead = async ({
  leadId,
  messageType,
  customMessage,
  adminEmail,
}: {
  leadId: string;
  messageType: MessageType;
  customMessage?: string;
  adminEmail?: string;
}) => {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  const finalMessage =
    customMessage || lead.followUp?.message || getDefaultMessage(lead.fullName);

  const sentTo: any = {};

  // ✅ EMAIL
  if (messageType === "email" || messageType === "both") {
    const emailTarget = lead.email || adminEmail;

    if (emailTarget) {
      try {
        await sendEmail(
          emailTarget,
          "Thank you for contacting us!",
          `<pre>${finalMessage}</pre>`
        );
        sentTo.email = emailTarget;
      } catch (err) {
        console.error("❌ Email failed:", err);
      }
    }
  }

  // ✅ WHATSAPP
  if (messageType === "whatsapp" || messageType === "both") {
    if (lead.phone) {
      try {
        await sendWhatsAppUnified(lead.phone, finalMessage);
        sentTo.whatsapp = lead.phone;
      } catch (err) {
        console.error("❌ WhatsApp failed:", err);
      }
    }
  }

  // ✅ Update Lead tracking
  lead.reminderCount = (lead.reminderCount || 0) + 1;
  lead.lastReminderSent = new Date();
  lead.status = "contacted";

  await lead.save();

  return {
    success: true,
    sentTo,
    message: finalMessage,
  };
};