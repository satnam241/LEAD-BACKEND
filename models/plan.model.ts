import mongoose, { Schema, Document } from "mongoose";

export interface IPlanLimits {
  maxLeads: number; // e.g. 500, or -1 for unlimited
  maxProjects: number; // e.g. 2, 5, or -1
  maxCampaigns: number; // monthly message limit
  aiBotEnabled: boolean;
  fbIntegrationEnabled: boolean;
  customGoogleCalendar: boolean;
}

export interface IPlan extends Document {
  name: string; // e.g. "Starter Plan", "Professional Plan", "Enterprise"
  slug: string; // e.g. "starter", "professional", "enterprise"
  description: string;
  priceMonthly: number; // in INR
  priceYearly: number; // in INR (with discount)
  currency: string; // "INR"
  features: string[]; // display bullets for Landing Page
  limits: IPlanLimits;
  badge?: string; // e.g. "Most Popular", "Best Value"
  isPopular?: boolean;
  isActive: boolean; // Admin can toggle plan on/off
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    priceMonthly: {
      type: Number,
      required: true,
      min: 0,
    },
    priceYearly: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    features: {
      type: [String],
      default: [],
    },
    limits: {
      maxLeads: { type: Number, default: 500 },
      maxProjects: { type: Number, default: 2 },
      maxCampaigns: { type: Number, default: 1000 },
      aiBotEnabled: { type: Boolean, default: true },
      fbIntegrationEnabled: { type: Boolean, default: true },
      customGoogleCalendar: { type: Boolean, default: true },
    },
    badge: {
      type: String,
      default: null,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IPlan>("Plan", PlanSchema);
