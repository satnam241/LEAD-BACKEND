"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const answerSchema = new mongoose_1.Schema({
    step: { type: String, required: true },
    optionId: { type: String, required: true },
    optionTitle: { type: String, required: true },
    answeredAt: { type: Date, default: Date.now },
}, { _id: false });
const conversationStateSchema = new mongoose_1.Schema({
    leadId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lead', required: true },
    phone: { type: String, required: true, index: true },
    currentStep: { type: String, required: true },
    answers: [answerSchema],
    attemptCount: { type: Number, default: 0 },
    deliveryStatus: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'replied'],
        default: 'sent',
    },
    lastMessageFromUser: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    lastActiveAt: { type: Date, default: Date.now },
}, { timestamps: true });
exports.default = (0, mongoose_1.model)('ConversationState', conversationStateSchema);
//# sourceMappingURL=conversationState.model.js.map