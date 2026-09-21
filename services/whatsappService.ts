// services/whatsappService.ts

import Twilio from "twilio";
import axios from "axios";
import {
  sendText as sendBaileysText,
  sendMedia as sendBaileysMedia,
  getConnectionStatus as getBaileysStatus,
} from "./baileysService";

// ✅ Provider Flags & Credentials
const useMeta = process.env.WHATSAPP_CLOUD_API === "true";
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_NUMBER;
const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

let twilioClient: Twilio.Twilio | null = null;
if (!useMeta && twilioSid && twilioAuthToken) {
  try {
    twilioClient = Twilio(twilioSid, twilioAuthToken);
  } catch (err) {
    console.error("Failed to initialize Twilio client:", err);
  }
}

/**
 * Normalize phone number for international format (defaults to India 91)
 */
function normalizeToIndianWhatsApp(phone: string): string {
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
export const sendWhatsAppUnified = async (
  toPhone: string,
  text?: string,
  mediaUrl?: string
) => {
  if (!toPhone) {
    throw new Error("Recipient phone number is required");
  }

  const norm = normalizeToIndianWhatsApp(toPhone);
  const { status: baileysStatus } = getBaileysStatus();

  // ------------------------------------
  // 🟢 1. BAILEYS (WHATSAPP WEB) FLOW
  // ------------------------------------
  if (baileysStatus === "open") {
    console.log(`📤 Sending via Baileys → ${norm}`);
    let outcome;
    if (mediaUrl) {
      outcome = await sendBaileysMedia(norm, mediaUrl, text);
    } else {
      outcome = await sendBaileysText(norm, text || "");
    }

    if (outcome.success) {
      console.log(`✅ Baileys WhatsApp Sent to ${norm}:`, outcome.waMessageId);
      return {
        provider: "baileys",
        success: true,
        messageId: outcome.waMessageId,
      };
    } else {
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

      const r = await axios.post(metaUrl, body, {
        headers: {
          Authorization: `Bearer ${metaToken}`,
          "Content-Type": "application/json",
        },
      });

      console.log("✅ Meta WhatsApp Sent");
      return { provider: "meta", success: true, data: r.data };
    } catch (err: any) {
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

      const msg: any = {
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
    } catch (err: any) {
      console.error("❌ Twilio WhatsApp Error:", err.message || err);
    }
  }

  // If we reach here, all attempted channels failed or none were configured/open.
  let reason = "";
  if (baileysStatus !== "open") {
    reason = `WhatsApp is not connected (Baileys status: ${baileysStatus}). Please scan the QR code to connect WhatsApp.`;
  } else {
    reason = "Failed to deliver WhatsApp message via all available providers.";
  }

  console.error("❌ WhatsApp send error:", reason);
  throw new Error(reason);
};