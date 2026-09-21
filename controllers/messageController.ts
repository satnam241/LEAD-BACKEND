// controllers/messageController.ts

import { Request, Response } from "express";
import { sendMessageToLead, scheduleMessageToLead } from "../services/messageService";

export const sendMessageController = async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { messageType = "email", message, adminEmail } = req.body;

    if (!leadId || typeof leadId !== "string") {
      return res.status(400).json({ success: false, message: "Valid leadId is required" });
    }

    const result = await sendMessageToLead({
      leadId,
      messageType,
      customMessage: message,
      adminEmail,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error("❌ Controller error:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};

export const scheduleMessageController = async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { messageType = "whatsapp", message, adminEmail, delayMinutes } = req.body;

    if (!leadId || typeof leadId !== "string") {
      return res.status(400).json({ success: false, message: "Valid leadId is required" });
    }

    const result = await scheduleMessageToLead({
      leadId,
      messageType,
      customMessage: message,
      adminEmail,
      delayMinutes: delayMinutes ?? 5,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error("❌ Schedule controller error:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};