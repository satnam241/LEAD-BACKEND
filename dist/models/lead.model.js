"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const LeadSchema = new mongoose_1.Schema({
    fullName: { type: String, trim: true },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        index: true,
    },
    phone: {
        type: String,
        trim: true,
        index: true,
    },
    phoneVerified: { type: Boolean, default: false },
    source: {
        type: String,
        default: "facebook",
        index: true,
    },
    formId: { type: String, default: null },
    whenAreYouPlanningToPurchase: { type: String, default: null },
    whatIsYourBudget: { type: String, default: null },
    // ✅ SAFE MESSAGE HANDLING
    message: {
        type: String,
        default: "No message provided",
        trim: true,
    },
    extraFields: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    rawData: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    receivedAt: {
        type: Date,
        default: Date.now,
    },
    // 📊 tracking
    reminderCount: { type: Number, default: 0 },
    lastReminderSent: { type: Date, default: null },
    status: {
        type: String,
        enum: ["new", "contacted", "closed"],
        default: "new",
        index: true,
    },
    // 🗑️ SOFT DELETE
    isDeleted: {
        type: Boolean,
        default: false,
        index: true,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    // 📅 FOLLOW-UP
    followUp: {
        date: { type: Date, default: null },
        recurrence: {
            type: String,
            enum: ["once", "tomorrow", "3days", "weekly", null],
            default: null,
        },
        message: { type: String, default: null },
        whatsappOptIn: { type: Boolean, default: false },
        active: { type: Boolean, default: false },
    },
}, {
    timestamps: true,
});
LeadSchema.pre(/^find/, function (next) {
    this.where({
        $or: [
            { isDeleted: false },
            { isDeleted: { $exists: false } }
        ]
    });
    next();
});
LeadSchema.query.withDeleted = function () {
    return this.where({});
};
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ phone: 1, email: 1 });
exports.default = mongoose_1.default.model("Lead", LeadSchema);
//# sourceMappingURL=lead.model.js.map