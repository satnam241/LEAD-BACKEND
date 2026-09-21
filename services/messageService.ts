// services/messageService.ts

import Lead from "../models/lead.model";
import ScheduledMessage from "../models/scheduledMessage.model";
import { sendEmail } from "./emailService";
import { sendWhatsAppUnified } from "./whatsappService";
import { getDefaultMessage } from "../utils/messageTemplates";

export type MessageType = "email" | "whatsapp" | "both";

export const sendMessageToLead = async ({
  leadId,
  messageType,
  customMessage,
  adminEmail,
}: {
  leadId: string;
  messageType?: MessageType;
  customMessage?: string;
  adminEmail?: string;
}) => {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  const finalMessage =
    customMessage || lead.followUp?.message || getDefaultMessage(lead.fullName);

  // Auto-detect best channel if not specified
  let targetType: MessageType = messageType || "whatsapp";
  if (!messageType) {
    if (lead.phone && (lead.email || adminEmail)) {
      targetType = "both";
    } else if (lead.phone) {
      targetType = "whatsapp";
    } else if (lead.email || adminEmail) {
      targetType = "email";
    }
  }

  const sentTo: Record<string, string> = {};
  const errors: Record<string, string> = {};

  // ✅ EMAIL
  if (targetType === "email" || targetType === "both") {
    const emailTarget = lead.email || adminEmail;

    if (emailTarget) {
      try {
        await sendEmail(
          emailTarget,
          "Thank you for contacting us!",
          `<pre>${finalMessage}</pre>`
        );
        sentTo.email = emailTarget;
      } catch (err: any) {
        console.error("❌ Email failed:", err);
        errors.email = err?.message || "Failed to send email";
      }
    } else {
      errors.email = "No email found for lead or admin";
    }
  }

  // ✅ WHATSAPP
  if (targetType === "whatsapp" || targetType === "both") {
    if (lead.phone) {
      try {
        await sendWhatsAppUnified(lead.phone, finalMessage);
        sentTo.whatsapp = lead.phone;
      } catch (err: any) {
        console.error("❌ WhatsApp failed:", err);
        errors.whatsapp = err?.message || "Failed to send WhatsApp message";
      }
    } else {
      errors.whatsapp = "No phone number found for lead";
    }
  }

  const anySent = Object.keys(sentTo).length > 0;
  if (!anySent) {
    const errorDetails = Object.entries(errors)
      .map(([channel, msg]) => `${channel}: ${msg}`)
      .join(" | ");
    throw new Error(`Message delivery failed (${errorDetails || 'No valid recipients'})`);
  }

  // ✅ Update Lead tracking only when at least one channel delivered
  lead.reminderCount = (lead.reminderCount || 0) + 1;
  lead.lastReminderSent = new Date();
  lead.status = "contacted";

  await lead.save();

  return {
    success: true,
    sentTo,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    message: finalMessage,
  };
};

export const scheduleMessageToLead = async ({
  leadId,
  messageType = "whatsapp",
  customMessage,
  adminEmail,
  delayMinutes = 5,
}: {
  leadId: string;
  messageType?: MessageType;
  customMessage?: string;
  adminEmail?: string;
  delayMinutes?: number;
}) => {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error("Lead not found");

  const finalMessage =
    customMessage || lead.followUp?.message || getDefaultMessage(lead.fullName);

  const sendAt = new Date(Date.now() + delayMinutes * 60 * 1000);

  const scheduled = await ScheduledMessage.create({
    leadId: lead._id,
    messageType,
    message: finalMessage,
    adminEmail,
    sendAt,
    status: "pending",
  });

  return scheduled;
};