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
    const rawInterest = "hot";
    const states = await conversationState_model_1.default.find().lean();
    const matchedLeadIds = [];
    for (const s of states) {
        const comp = s.attemptCount === 0 ? 'cold' : (s.completedAt || s.attemptCount >= 1) ? 'hot' : 'warm';
        if (comp === rawInterest && s.leadId) {
            matchedLeadIds.push(s.leadId);
        }
    }
    console.log("matchedLeadIds:", matchedLeadIds);
    const filter1 = { isDeleted: false, interestLevel: 'hot' };
    const res1 = await lead_model_1.default.find(filter1).lean();
    console.log("res1 (only interestLevel=hot):", res1.map(l => ({ name: l.fullName, id: l._id, interestLevel: l.interestLevel })));
    const filter2 = { isDeleted: false, _id: { $in: matchedLeadIds } };
    const res2 = await lead_model_1.default.find(filter2).lean();
    console.log("res2 (_id in matchedLeadIds):", res2.map(l => ({ name: l.fullName, id: l._id, interestLevel: l.interestLevel })));
    await mongoose_1.default.disconnect();
}
run().catch(console.error);
//# sourceMappingURL=debug_query.js.map