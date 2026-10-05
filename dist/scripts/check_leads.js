"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const DB_1 = require("../database/DB");
const lead_model_1 = __importDefault(require("../models/lead.model"));
const conversationState_model_1 = __importDefault(require("../models/conversationState.model"));
async function run() {
    await (0, DB_1.connectDB)();
    const latestLeads = await lead_model_1.default.find().sort({ updatedAt: -1 }).limit(5).lean();
    console.log("=== LATEST 5 LEADS ===");
    for (const l of latestLeads) {
        console.log({
            id: l._id,
            name: l.fullName,
            phone: l.phone,
            status: l.status,
            interestLevel: l.interestLevel,
            updatedAt: l.updatedAt,
            receivedAt: l.receivedAt,
        });
    }
    const latestStates = await conversationState_model_1.default.find().sort({ updatedAt: -1 }).limit(5).lean();
    console.log("=== LATEST 5 CONVERSATION STATES ===");
    for (const s of latestStates) {
        console.log({
            id: s._id,
            leadId: s.leadId,
            phone: s.phone,
            attemptCount: s.attemptCount,
            currentStep: s.currentStep,
            lastMessageFromUser: s.lastMessageFromUser,
            updatedAt: s.updatedAt,
        });
    }
    await mongoose_1.default.disconnect();
}
run().catch(console.error);
//# sourceMappingURL=check_leads.js.map