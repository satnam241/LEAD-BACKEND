import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITenantNotificationEmails {
  primaryEmail: string; // Handles outgoing customer emails + Google Calendar site visit events
  secondaryEmail1?: string | null; // Optional team alert email
  secondaryEmail2?: string | null; // Optional manager alert email
}

export interface ITenantFacebookConfig {
  pageAccessToken?: string | null;
  pageId?: string | null;
  appSecret?: string | null;
  formIds?: string[];
  isConnected?: boolean;
  lastSyncAt?: Date | null;
}

export interface ITenantGoogleConfig {
  connectedEmail?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
  isConnected?: boolean;
  lastSyncAt?: Date | null;
}

export interface ITenantSubscription {
  planId?: Types.ObjectId | null;
  planName?: string;
  billingCycle: "monthly" | "yearly";
  startDate: Date;
  expiresAt: Date;
  status: "active" | "expired" | "grace_period" | "cancelled" | "pending_payment";
  autoRenew: boolean;
  limits: {
    maxLeads: number; // e.g. 500 or -1 for unlimited
    maxProjects: number;
    maxCampaigns: number;
    aiBotEnabled: boolean;
    fbIntegrationEnabled: boolean;
    customGoogleCalendar: boolean;
  };
  lastLimitWarningTier?: number; // 0, 80, 100
  lastLimitWarningSentAt?: Date | null;
}

export interface ITenant extends Document {
  name: string; // Business or Company Name (e.g. "Green Earth Builders")
  ownerName: string; // Client's full personal name
  email: string; // Primary unique mapped email
  phone: string; // Primary unique mapped phone
  status: "active" | "suspended" | "pending_payment" | "cancelled";
  isMaster: boolean; // True for Super Admin's default organization (e.g., Bhole Baba Investments)
  subscription: ITenantSubscription;
  notificationEmails: ITenantNotificationEmails;
  facebookConfig: ITenantFacebookConfig;
  googleConfig: ITenantGoogleConfig;
  whatsappConfig?: {
    authFolder?: string;
    phoneNumber?: string;
    status?: "connected" | "disconnected" | "connecting";
    connectedAt?: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
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
      planId: { type: Schema.Types.ObjectId, ref: "Plan", default: null },
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
  },
  {
    timestamps: true,
  }
);

TenantSchema.index({ "subscription.status": 1, "subscription.expiresAt": 1 });

export default mongoose.model<ITenant>("Tenant", TenantSchema);
