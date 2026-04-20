// services/whatsappService.ts

import Twilio from "twilio";
import axios from "axios";

// ✅ Flag for Meta API
const useMeta = process.env.WHATSAPP_CLOUD_API === "true";

// ✅ Twilio config
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_NUMBER;

console.log("🔥 TWILIO FROM:", TWILIO_FROM);

let twilioClient: Twilio.Twilio | null = null;

if (!useMeta) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  twilioClient = Twilio(accountSid, authToken);
}

/**
 * Unified WhatsApp Sender
 */
export const sendWhatsAppUnified = async (
  toPhone: string,
  text?: string,
  mediaUrl?: string
) => {
  try {
    // ✅ Normalize phone
    let norm = toPhone.replace(/\D/g, "");
    if (!norm.startsWith("91")) norm = "91" + norm;

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

      const msg: any = {
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

    const url = process.env.WHATSAPP_API_URL!;
    const token = process.env.WHATSAPP_TOKEN!;

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

    const r = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Meta WhatsApp Sent");
    return r.data;

  } catch (err: any) {
    console.error("❌ WhatsApp Error:", err.response?.data || err.message || err);
    throw new Error("WhatsApp send failed");
  }
};
