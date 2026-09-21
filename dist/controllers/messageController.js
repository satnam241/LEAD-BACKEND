"use strict";
// controllers/messageController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleMessageController = exports.sendMessageController = void 0;
const messageService_1 = require("../services/messageService");
const sendMessageController = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { messageType = "email", message, adminEmail } = req.body;
        if (!leadId || typeof leadId !== "string") {
            return res.status(400).json({ success: false, message: "Valid leadId is required" });
        }
        const result = await (0, messageService_1.sendMessageToLead)({
            leadId,
            messageType,
            customMessage: message,
            adminEmail,
        });
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        console.error("❌ Controller error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};
exports.sendMessageController = sendMessageController;
const scheduleMessageController = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { messageType = "whatsapp", message, adminEmail, delayMinutes } = req.body;
        if (!leadId || typeof leadId !== "string") {
            return res.status(400).json({ success: false, message: "Valid leadId is required" });
        }
        const result = await (0, messageService_1.scheduleMessageToLead)({
            leadId,
            messageType,
            customMessage: message,
            adminEmail,
            delayMinutes: delayMinutes ?? 5,
        });
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        console.error("❌ Schedule controller error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};
exports.scheduleMessageController = scheduleMessageController;
//# sourceMappingURL=messageController.js.map