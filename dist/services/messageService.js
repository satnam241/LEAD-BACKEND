"use strict";
// services/messageService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleMessageToLead = exports.sendMessageToLead = void 0;
const lead_model_1 = __importDefault(require("../models/lead.model"));
const scheduledMessage_model_1 = __importDefault(require("../models/scheduledMessage.model"));
const emailService_1 = require("./emailService");
const whatsappService_1 = require("./whatsappService");
const messageTemplates_1 = require("../utils/messageTemplates");
const sendMessageToLead = async ({ leadId, messageType, customMessage, adminEmail, }) => {
    const lead = await lead_model_1.default.findById(leadId);
    if (!lead)
        throw new Error("Lead not found");
    const finalMessage = customMessage || lead.followUp?.message || (0, messageTemplates_1.getDefaultMessage)(lead.fullName);
    // Auto-detect best channel if not specified
    let targetType = messageType || "whatsapp";
    if (!messageType) {
        if (lead.phone && (lead.email || adminEmail)) {
            targetType = "both";
        }
        else if (lead.phone) {
            targetType = "whatsapp";
        }
        else if (lead.email || adminEmail) {
            targetType = "email";
        }
    }
    const sentTo = {};
    const errors = {};
    // ✅ EMAIL
    if (targetType === "email" || targetType === "both") {
        const emailTarget = lead.email || adminEmail;
        if (emailTarget) {
            try {
                await (0, emailService_1.sendEmail)(emailTarget, "Thank you for contacting us!", `<pre>${finalMessage}</pre>`);
                sentTo.email = emailTarget;
            }
            catch (err) {
                console.error("❌ Email failed:", err);
                errors.email = err?.message || "Failed to send email";
            }
        }
        else {
            errors.email = "No email found for lead or admin";
        }
    }
    // ✅ WHATSAPP
    if (targetType === "whatsapp" || targetType === "both") {
        if (lead.phone) {
            try {
                await (0, whatsappService_1.sendWhatsAppUnified)(lead.phone, finalMessage);
                sentTo.whatsapp = lead.phone;
            }
            catch (err) {
                console.error("❌ WhatsApp failed:", err);
                errors.whatsapp = err?.message || "Failed to send WhatsApp message";
            }
        }
        else {
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
exports.sendMessageToLead = sendMessageToLead;
const scheduleMessageToLead = async ({ leadId, messageType = "whatsapp", customMessage, adminEmail, delayMinutes = 5, }) => {
    const lead = await lead_model_1.default.findById(leadId);
    if (!lead)
        throw new Error("Lead not found");
    const finalMessage = customMessage || lead.followUp?.message || (0, messageTemplates_1.getDefaultMessage)(lead.fullName);
    const sendAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    const scheduled = await scheduledMessage_model_1.default.create({
        leadId: lead._id,
        messageType,
        message: finalMessage,
        adminEmail,
        sendAt,
        status: "pending",
    });
    return scheduled;
};
exports.scheduleMessageToLead = scheduleMessageToLead;
//# sourceMappingURL=messageService.js.map