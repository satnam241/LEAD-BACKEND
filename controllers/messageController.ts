// controllers/messageController.ts

import { Request, Response } from "express";
import { sendMessageToLead } from "../services/messageService";

export const sendMessageController = async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { messageType = "email", message, adminEmail } = req.body;

    // 🔒 Validation
    if (!leadId || typeof leadId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Valid leadId is required",
      });
    }

    const result = await sendMessageToLead({
      leadId, // ✅ FIXED (no lead._id)
      messageType,
      customMessage: message,
      adminEmail,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error: any) {
    console.error("❌ Controller error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};