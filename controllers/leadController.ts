import { Request, Response } from "express";
import Lead from "../models/lead.model";
import { sendEmail } from "../services/emailService";
import { sendWhatsApp } from "../services/whatsappService";

export const createLead = async (req: Request, res: Response) => {
  try {
    const { fullName, email, phone, source } = req.body;

    const lead = new Lead({ fullName, email, phone, source });
    await lead.save();

    // Send Email
    if (email) {
      await sendEmail(
        email,
        "Thanks for showing interest!",
        `Hello ${fullName}, we received your details. Our team will contact you soon.`
      );
    }

    if (phone) {
      await sendWhatsApp(
        phone,
        `Hello ${fullName}, thanks for contacting us! We’ll reach out soon.`
      );
    }

    res.status(201).json({ success: true, lead });
  } catch (err) {
    console.error("Lead create error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
