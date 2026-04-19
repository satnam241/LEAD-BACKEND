"use strict";
// services/messageService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageToLead = void 0;
const lead_model_1 = __importDefault(require("../models/lead.model"));
const emailService_1 = require("./emailService");
const whatsappService_1 = require("./whatsappService");
const messageTemplates_1 = require("../utils/messageTemplates");
const sendMessageToLead = async ({ leadId, messageType, customMessage, adminEmail, }) => {
    const lead = await lead_model_1.default.findById(leadId);
    if (!lead)
        throw new Error("Lead not found");
    const finalMessage = customMessage || lead.followUp?.message || (0, messageTemplates_1.getDefaultMessage)(lead.fullName);
    const sentTo = {};
    // ✅ EMAIL
    if (messageType === "email" || messageType === "both") {
        const emailTarget = lead.email || adminEmail;
        if (emailTarget) {
            try {
                await (0, emailService_1.sendEmail)(emailTarget, "Thank you for contacting us!", `<pre>${finalMessage}</pre>`);
                sentTo.email = emailTarget;
            }
            catch (err) {
                console.error("❌ Email failed:", err);
            }
        }
    }
    // ✅ WHATSAPP
    if (messageType === "whatsapp" || messageType === "both") {
        if (lead.phone) {
            try {
                await (0, whatsappService_1.sendWhatsAppUnified)(lead.phone, finalMessage);
                sentTo.whatsapp = lead.phone;
            }
            catch (err) {
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
exports.sendMessageToLead = sendMessageToLead;
//# sourceMappingURL=messageService.js.map