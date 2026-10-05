"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const DB_1 = require("../database/DB");
const conversationMessage_model_1 = __importDefault(require("../models/conversationMessage.model"));
async function run() {
    await (0, DB_1.connectDB)();
    const msgs = await conversationMessage_model_1.default.find().sort({ createdAt: -1 }).limit(10).lean();
    console.log("=== LATEST 10 CONVERSATION MESSAGES ===");
    for (const m of msgs) {
        console.log({
            id: m._id,
            leadId: m.leadId,
            phone: m.phone,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
        });
    }
    await mongoose_1.default.disconnect();
}
run().catch(console.error);
//# sourceMappingURL=check_messages.js.map