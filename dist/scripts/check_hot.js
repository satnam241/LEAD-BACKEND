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
    const countHot = await lead_model_1.default.countDocuments({ interestLevel: 'hot' });
    const countWarm = await lead_model_1.default.countDocuments({ interestLevel: 'warm' });
    const countCold = await lead_model_1.default.countDocuments({ interestLevel: 'cold' });
    const countNull = await lead_model_1.default.countDocuments({ interestLevel: null });
    console.log({ countHot, countWarm, countCold, countNull });
    const hotLeads = await lead_model_1.default.find({ interestLevel: 'hot' }).lean();
    console.log("HOT LEADS:", hotLeads.map(l => ({ id: l._id, name: l.fullName, phone: l.phone, interestLevel: l.interestLevel, receivedAt: l.receivedAt, updatedAt: l.updatedAt })));
    // Test admin.controller.ts filter logic with interest = "hot"
    const rawInterest = "hot";
    const states = await conversationState_model_1.default.find().lean();
    const matchedLeadIds = [];
    for (const s of states) {
        const comp = s.attemptCount === 0 ? 'cold' : (s.completedAt || s.attemptCount >= 1) ? 'hot' : 'warm';
        if (comp === rawInterest && s.leadId) {
            matchedLeadIds.push(s.leadId);
        }
    }
    const filter = {
        isDeleted: false,
        $or: [
            { interestLevel: rawInterest },
            { _id: { $in: matchedLeadIds } }
        ]
    };
    const results = await lead_model_1.default.find(filter).sort({ receivedAt: -1 }).lean();
    console.log(`ADMIN FILTER RETURNED ${results.length} LEADS:`, results.map(l => ({ id: l._id, name: l.fullName, phone: l.phone, interestLevel: l.interestLevel })));
    await mongoose_1.default.disconnect();
}
run().catch(console.error);
//# sourceMappingURL=check_hot.js.map