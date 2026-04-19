// controllers/messageController.ts

import { Request, Response } from "express";
import { sendMessageToLead } from "../services/messageService";

export const sendMessageController = async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { messageType = "email", message, adminEmail } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }

    const result = await sendMessageToLead({
      leadId,
      messageType,
      customMessage: message,
      adminEmail,
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error("❌ Controller error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};