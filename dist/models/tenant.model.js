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
const TenantSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    ownerName: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
    },
    status: {
        type: String,
        enum: ["active", "suspended", "pending_payment", "cancelled"],
        default: "pending_payment",
        index: true,
    },
    isMaster: {
        type: Boolean,
        default: false,
        index: true,
    },
    subscription: {
        planId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Plan", default: null },
        planName: { type: String, default: "Starter" },
        billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
        startDate: { type: Date, default: Date.now },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
        },
        status: {
            type: String,
            enum: ["active", "expired", "grace_period", "cancelled", "pending_payment"],
            default: "pending_payment",
        },
        autoRenew: { type: Boolean, default: false },
        limits: {
            maxLeads: { type: Number, default: 500 },
            maxProjects: { type: Number, default: 2 },
            maxCampaigns: { type: Number, default: 1000 },
            aiBotEnabled: { type: Boolean, default: true },
            fbIntegrationEnabled: { type: Boolean, default: true },
            customGoogleCalendar: { type: Boolean, default: true },
        },
        lastLimitWarningTier: { type: Number, default: 0 },
        lastLimitWarningSentAt: { type: Date, default: null },
    },
    notificationEmails: {
        primaryEmail: { type: String, trim: true, lowercase: true, required: true },
        secondaryEmail1: { type: String, trim: true, lowercase: true, default: null },
        secondaryEmail2: { type: String, trim: true, lowercase: true, default: null },
    },
    facebookConfig: {
        pageAccessToken: { type: String, default: null },
        pageId: { type: String, default: null },
        appSecret: { type: String, default: null },
        formIds: { type: [String], default: [] },
        isConnected: { type: Boolean, default: false },
        lastSyncAt: { type: Date, default: null },
    },
    googleConfig: {
        connectedEmail: { type: String, default: null },
        accessToken: { type: String, default: null },
        refreshToken: { type: String, default: null },
        expiryDate: { type: Number, default: null },
        isConnected: { type: Boolean, default: false },
        lastSyncAt: { type: Date, default: null },
    },
    whatsappConfig: {
        authFolder: { type: String, default: null },
        phoneNumber: { type: String, default: null },
        status: {
            type: String,
            enum: ["connected", "disconnected", "connecting"],
            default: "disconnected",
        },
        connectedAt: { type: Date, default: null },
    },
}, {
    timestamps: true,
});
TenantSchema.index({ "subscription.status": 1, "subscription.expiresAt": 1 });
exports.default = mongoose_1.default.model("Tenant", TenantSchema);
//# sourceMappingURL=tenant.model.js.map