"use strict";
// services/whatsappService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppUnified = void 0;
const twilio_1 = __importDefault(require("twilio"));
const axios_1 = __importDefault(require("axios"));
// ✅ Flag for Meta API
const useMeta = process.env.WHATSAPP_CLOUD_API === "true";
// ✅ Twilio config
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_NUMBER;
console.log("🔥 TWILIO FROM:", TWILIO_FROM);
let twilioClient = null;
if (!useMeta) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    twilioClient = (0, twilio_1.default)(accountSid, authToken);
}
/**
 * Unified WhatsApp Sender
 */
const sendWhatsAppUnified = async (toPhone, text, mediaUrl) => {
    try {
        // ✅ Normalize phone
        let norm = toPhone.replace(/\D/g, "");
        if (!norm.startsWith("91"))
            norm = "91" + norm;
        const toWhats = `whatsapp:+${norm}`;
        // ------------------------------------
        // 🟢 TWILIO FLOW
        // ------------------------------------
        if (!useMeta && twilioClient) {
            if (!TWILIO_FROM) {
                throw new Error("❌ TWILIO_WHATSAPP_NUMBER missing in env");
            }
            console.log("📤 Sending via Twilio");
            console.log("FROM:", TWILIO_FROM);
            console.log("TO:", toWhats);
            const msg = {
                from: TWILIO_FROM, // ✅ FIXED
                to: toWhats,
                body: text || "",
            };
            if (mediaUrl) {
                msg.mediaUrl = [mediaUrl];
            }
            const res = await twilioClient.messages.create(msg);
            console.log("✅ Twilio WhatsApp Sent:", res.sid);
            return res;
        }
        // ------------------------------------
        // 🟣 META CLOUD API FLOW
        // ------------------------------------
        console.log("📤 Sending via Meta →", norm);
        const url = process.env.WHATSAPP_API_URL;
        const token = process.env.WHATSAPP_TOKEN;
        if (!url || !token) {
            throw new Error("❌ Meta API config missing");
        }
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
        const r = await axios_1.default.post(url, body, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });
        console.log("✅ Meta WhatsApp Sent");
        return r.data;
    }
    catch (err) {
        console.error("❌ WhatsApp Error:", err.response?.data || err.message || err);
        throw new Error("WhatsApp send failed");
    }
};
exports.sendWhatsAppUnified = sendWhatsAppUnified;
//# sourceMappingURL=whatsappService.js.map