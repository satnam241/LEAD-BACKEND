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
const AdminSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    password: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        trim: true,
        default: null,
        index: true,
    },
    role: {
        type: String,
        enum: ["super_admin", "tenant_admin", "team_member"],
        default: "tenant_admin",
        index: true,
    },
    tenantId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Tenant",
        default: null,
        index: true,
    },
    companyName: {
        type: String,
        trim: true,
        default: null,
    },
    status: {
        type: String,
        enum: ["active", "pending_payment", "suspended"],
        default: "active",
        index: true,
    },
    refreshToken: {
        type: String,
        default: null,
    },
    // ✅ Google Calendar
    googleCalendar: {
        accessToken: {
            type: String,
            default: null,
        },
        refreshToken: {
            type: String,
            default: null,
        },
        expiryDate: {
            type: Number,
            default: null,
        },
        isConnected: {
            type: Boolean,
            default: false,
        },
        lastSyncAt: {
            type: Date,
            default: null,
        },
        connectedEmail: {
            type: String,
            default: null,
        },
    },
}, {
    timestamps: true,
});
AdminSchema.index({ tenantId: 1, role: 1 });
exports.default = mongoose_1.default.model("Admin", AdminSchema);
//# sourceMappingURL=admin.model.js.map