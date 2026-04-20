"use strict";
// controllers/messageController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageController = void 0;
const messageService_1 = require("../services/messageService");
const sendMessageController = async (req, res) => {
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
        const result = await (0, messageService_1.sendMessageToLead)({
            leadId, // ✅ FIXED (no lead._id)
            messageType,
            customMessage: message,
            adminEmail,
        });
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error("❌ Controller error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};
exports.sendMessageController = sendMessageController;
//# sourceMappingURL=messageController.js.map