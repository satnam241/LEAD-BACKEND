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
    const _ensureLead = lead_model_1.default.modelName;
    const states = await conversationState_model_1.default.find().populate('leadId').lean();
    console.log("=== ALL CONVERSATION STATES WITH LEADS ===");
    for (const s of states) {
        const l = s.leadId;
        console.log({
            stateId: s._id,
            statePhone: s.phone,
            attemptCount: s.attemptCount,
            lastMessage: s.lastMessageFromUser,
            lead: l ? { id: l._id, name: l.fullName, phone: l.phone, interestLevel: l.interestLevel, status: l.status } : 'ORPHAN_STATE (lead deleted or missing)',
        });
    }
    await mongoose_1.default.disconnect();
}
run().catch(console.error);
//# sourceMappingURL=check_states.js.map