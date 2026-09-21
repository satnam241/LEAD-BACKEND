"use strict";
// services/whatsappService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppUnified = void 0;
const twilio_1 = __importDefault(require("twilio"));
const axios_1 = __importDefault(require("axios"));
const baileysService_1 = require("./baileysService");
// ✅ Provider Flags & Credentials
const useMeta = process.env.WHATSAPP_CLOUD_API === "true";
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_NUMBER;
const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
let twilioClient = null;
if (!useMeta && twilioSid && twilioAuthToken) {
    try {
        twilioClient = (0, twilio_1.default)(twilioSid, twilioAuthToken);
    }
    catch (err) {
        console.error("Failed to initialize Twilio client:", err);
    }
}
/**
 * Normalize phone number for international format (defaults to India 91)
 */
function normalizeToIndianWhatsApp(phone) {
    let norm = phone.replace(/\D/g, "");
    if (norm.startsWith("0") && norm.length === 11) {
        norm = norm.slice(1);
    }
    if (norm.length === 10) {
        norm = "91" + norm;
    }
    return norm;
}
/**
 * Unified WhatsApp Sender
 * Tries Baileys first (WhatsApp Web session), then Meta Cloud API, then Twilio.
 */
const sendWhatsAppUnified = async (toPhone, text, mediaUrl) => {
    if (!toPhone) {
        throw new Error("Recipient phone number is required");
    }
    const norm = normalizeToIndianWhatsApp(toPhone);
    const { status: baileysStatus } = (0, baileysService_1.getConnectionStatus)();
    // ------------------------------------
    // 🟢 1. BAILEYS (WHATSAPP WEB) FLOW
    // ------------------------------------
    if (baileysStatus === "open") {
        console.log(`📤 Sending via Baileys → ${norm}`);
        let outcome;
        if (mediaUrl) {
            outcome = await (0, baileysService_1.sendMedia)(norm, mediaUrl, text);
        }
        else {
            outcome = await (0, baileysService_1.sendText)(norm, text || "");
        }
        if (outcome.success) {
            console.log(`✅ Baileys WhatsApp Sent to ${norm}:`, outcome.waMessageId);
            return {
                provider: "baileys",
                success: true,
                messageId: outcome.waMessageId,
            };
        }
        else {
            console.warn(`⚠️ Baileys send failed: ${outcome.error}. Trying fallback providers...`);
        }
    }
    // ------------------------------------
    // 🟣 2. META CLOUD API FLOW
    // ------------------------------------
    const metaUrl = process.env.WHATSAPP_API_URL;
    const metaToken = process.env.WHATSAPP_TOKEN;
    if (useMeta && metaUrl && metaToken) {
        try {
            console.log("📤 Sending via Meta →", norm);
            const body = mediaUrl
                ? {
                    messaging_product: "whatsapp",
                    to: norm,
                    type: "image",
                    image: { link: mediaUrl, caption: text || "" },
                }
                : {
                    messaging_product: "whatsapp",
                    to: norm,
                    type: "text",
                    text: { body: text || "" },
                };
            const r = await axios_1.default.post(metaUrl, body, {
                headers: {
                    Authorization: `Bearer ${metaToken}`,
                    "Content-Type": "application/json",
                },
            });
            console.log("✅ Meta WhatsApp Sent");
            return { provider: "meta", success: true, data: r.data };
        }
        catch (err) {
            console.error("❌ Meta WhatsApp Error:", err.response?.data || err.message || err);
        }
    }
    // ------------------------------------
    // 🔵 3. TWILIO FLOW
    // ------------------------------------
    if (twilioClient && TWILIO_FROM) {
        try {
            const toWhats = `whatsapp:+${norm}`;
            console.log("📤 Sending via Twilio to:", toWhats);
            const msg = {
                from: TWILIO_FROM,
                to: toWhats,
                body: text || "",
            };
            if (mediaUrl) {
                msg.mediaUrl = [mediaUrl];
            }
            const res = await twilioClient.messages.create(msg);
            console.log("✅ Twilio WhatsApp Sent:", res.sid);
            return { provider: "twilio", success: true, sid: res.sid };
        }
        catch (err) {
            console.error("❌ Twilio WhatsApp Error:", err.message || err);
        }
    }
    // If we reach here, all attempted channels failed or none were configured/open.
    let reason = "";
    if (baileysStatus !== "open") {
        reason = `WhatsApp is not connected (Baileys status: ${baileysStatus}). Please scan the QR code to connect WhatsApp.`;
    }
    else {
        reason = "Failed to deliver WhatsApp message via all available providers.";
    }
    console.error("❌ WhatsApp send error:", reason);
    throw new Error(reason);
};
exports.sendWhatsAppUnified = sendWhatsAppUnified;
//# sourceMappingURL=whatsappService.js.map