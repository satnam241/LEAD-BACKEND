export const sendWhatsApp = async (to: string, message: string) => {
  try {
    if (!to.startsWith("whatsapp:")) to = "whatsapp:" + to;

    const res = await client.messages.create({
      from: process.env.TWILIO_PHONE, 
      to, 
      body: message,
    });

    console.log("📱 WhatsApp sent:", res.sid);
  } catch (err) {
    console.error("WhatsApp error:", err);
  }
};
