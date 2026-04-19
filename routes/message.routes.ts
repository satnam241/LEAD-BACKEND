import express from "express";
import { sendMessageController } from "../controllers/messageController";

const router = express.Router();

// ✅ Route
router.post("/:leadId/send-message", sendMessageController);

export default router;
 