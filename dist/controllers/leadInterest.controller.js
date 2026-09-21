"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLeadInterest = listLeadInterest;
exports.getLeadInterestById = getLeadInterestById;
const conversationState_model_1 = __importDefault(require("../models/conversationState.model"));
const botFlow_model_1 = __importDefault(require("../models/botFlow.model"));
function computeInterest(attemptCount, completedAt, existingLevel) {
    if (existingLevel === 'hot')
        return 'hot';
    if (existingLevel === 'warm') {
        return (completedAt || attemptCount >= 2) ? 'hot' : 'warm';
    }
    if (attemptCount === 0)
        return existingLevel || 'cold';
    if (completedAt || attemptCount >= 2)
        return 'hot';
    return 'warm';
}
const INTEREST_ORDER = { hot: 0, warm: 1, cold: 2 };
// GET /api/lead-interest?sortBy=interest|recent
async function listLeadInterest(req, res) {
    try {
        const sortBy = req.query.sortBy || 'interest';
        const [states, activeStepsCount] = await Promise.all([
            conversationState_model_1.default.find()
                .populate('leadId', 'fullName phone email status interestLevel')
                .lean(),
            botFlow_model_1.default.countDocuments({ isActive: true }),
        ]);
        const totalSteps = activeStepsCount > 0 ? activeStepsCount : 2;
        const rows = states.map(s => {
            const leadDoc = s.leadId;
            const leadInterest = leadDoc?.interestLevel || null;
            const interest = computeInterest(s.attemptCount, s.completedAt, leadInterest);
            const activityLabel = interest === 'hot'
                ? 'Most Activity'
                : interest === 'warm'
                    ? 'Interested'
                    : 'No Response';
            return {
                leadId: s.leadId,
                phone: s.phone,
                currentStep: s.currentStep,
                totalSteps,
                stepsCompleted: s.answers.length,
                interest,
                activityLabel,
                attemptCount: s.attemptCount,
                deliveryStatus: s.deliveryStatus || 'sent',
                lastMessageFromUser: s.lastMessageFromUser || null,
                lastMessageAt: s.lastMessageAt || null,
                conversationDurationSec: Math.round((new Date(s.lastActiveAt).getTime() - new Date(s.startedAt).getTime()) / 1000),
                startedAt: s.startedAt,
                completedAt: s.completedAt,
                lastActiveAt: s.lastActiveAt,
            };
        });
        if (sortBy === 'recent') {
            rows.sort((a, b) => +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt));
        }
        else {
            rows.sort((a, b) => {
                const diff = INTEREST_ORDER[a.interest] - INTEREST_ORDER[b.interest];
                return diff !== 0 ? diff : +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt);
            });
        }
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({
            message: 'Failed to fetch lead interest data',
            error: err.message,
        });
    }
}
// GET /api/lead-interest/:leadId — full conversation timeline for one lead
async function getLeadInterestById(req, res) {
    try {
        const [state, activeStepsCount] = await Promise.all([
            conversationState_model_1.default.findOne({ leadId: req.params.leadId })
                .sort({ updatedAt: -1 })
                .populate('leadId', 'fullName phone email status interestLevel')
                .lean(),
            botFlow_model_1.default.countDocuments({ isActive: true }),
        ]);
        if (!state) {
            res.status(404).json({ message: 'No conversation activity found for this lead' });
            return;
        }
        const totalSteps = activeStepsCount > 0 ? activeStepsCount : 2;
        const leadDoc = state.leadId;
        const leadInterest = leadDoc?.interestLevel || null;
        const interest = computeInterest(state.attemptCount, state.completedAt, leadInterest);
        const activityLabel = interest === 'hot'
            ? 'Most Activity'
            : interest === 'warm'
                ? 'Interested'
                : 'No Response';
        res.json({
            ...state,
            totalSteps,
            deliveryStatus: state.deliveryStatus || 'sent',
            lastMessageFromUser: state.lastMessageFromUser || null,
            lastMessageAt: state.lastMessageAt || null,
            interest,
            activityLabel,
        });
    }
    catch (err) {
        res.status(500).json({
            message: 'Failed to fetch lead interest data',
            error: err.message,
        });
    }
}
//# sourceMappingURL=leadInterest.controller.js.map