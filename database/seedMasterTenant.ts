import mongoose from "mongoose";
import Tenant from "../models/tenant.model";
import Plan from "../models/plan.model";
import Admin from "../models/admin.model";
import Lead from "../models/lead.model";
import Project from "../models/project.model";
import Campaign from "../models/campaign.model";
import Template from "../models/template.model";
import ConversationMessage from "../models/conversationMessage.model";
import ConversationState from "../models/conversationState.model";
import FbForm from "../models/fbForm.model";

export const defaultPlans = [
  {
    name: "Starter Plan",
    slug: "starter",
    description: "Ideal for individual real estate agents and consultants starting automated lead generation.",
    priceMonthly: 2999,
    priceYearly: 29990,
    currency: "INR",
    features: [
      "Up to 500 Leads / month",
      "2 Active Real Estate Projects",
      "AI WhatsApp Chatbot Assistant",
      "Facebook Lead Ads Auto-Sync",
      "Google Calendar Site Visit Booking",
      "Instant Email Notification Alerts",
      "Single Agent Dashboard Access",
    ],
    limits: {
      maxLeads: 500,
      maxProjects: 2,
      maxCampaigns: 1000,
      aiBotEnabled: true,
      fbIntegrationEnabled: true,
      customGoogleCalendar: true,
    },
    badge: "Starter",
    isPopular: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Professional Plan",
    slug: "professional",
    description: "Designed for expanding real estate agencies, brokers, and active builder sales teams.",
    priceMonthly: 6999,
    priceYearly: 69990,
    currency: "INR",
    features: [
      "Up to 3,000 Leads / month",
      "10 Active Real Estate Projects",
      "Smart Multi-step WhatsApp Follow-ups",
      "3-Tier Multi-Email Notifications",
      "Google Calendar Site Visit Sync",
      "Facebook Lead Forms Mapping",
      "Lead Temperature Scoring (Hot/Warm/Cold)",
      "Priority AI Query Responses",
      "CSV & Excel Lead Exporting",
    ],
    limits: {
      maxLeads: 3000,
      maxProjects: 10,
      maxCampaigns: 10000,
      aiBotEnabled: true,
      fbIntegrationEnabled: true,
      customGoogleCalendar: true,
    },
    badge: "Most Popular",
    isPopular: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Enterprise Plan",
    slug: "enterprise",
    description: "Complete lead management and multi-project automation for large real estate developers.",
    priceMonthly: 14999,
    priceYearly: 149990,
    currency: "INR",
    features: [
      "Unlimited Leads & Projects",
      "Unlimited WhatsApp Broadcasts & Follow-ups",
      "Full Multi-Email Notification Routing",
      "Custom Google & Facebook Integrations",
      "Dedicated WhatsApp Account Linking",
      "Advanced Sales Funnel & Monthly Analytics",
      "24/7 Dedicated Priority Technical Support",
      "Custom Webhook & API Access",
    ],
    limits: {
      maxLeads: -1,
      maxProjects: -1,
      maxCampaigns: -1,
      aiBotEnabled: true,
      fbIntegrationEnabled: true,
      customGoogleCalendar: true,
    },
    badge: "Ultimate",
    isPopular: false,
    isActive: true,
    sortOrder: 3,
  },
];

/**
 * Initializes Master Tenant and default subscription plans.
 * Backfills all existing data without tenantId to the Master Tenant.
 * Guarantees zero disruption to existing business operations.
 */
export async function initMasterTenantAndPlans(): Promise<void> {
  try {
    // 1. Seed Default Plans if none exist
    const planCount = await Plan.countDocuments();
    if (planCount === 0) {
      await Plan.insertMany(defaultPlans);
      console.log("✅ Seeded default SaaS subscription plans (Starter, Professional, Enterprise)");
    }

    // 2. Locate or create Enterprise/Master Plan
    let masterPlan = await Plan.findOne({ slug: "enterprise" });
    if (!masterPlan) {
      masterPlan = await Plan.findOne();
    }

    // 3. Check if Master Tenant exists
    let masterTenant = await Tenant.findOne({ isMaster: true });

    // Find existing super admin or first admin
    const existingAdmin = await Admin.findOne({ role: "super_admin" }) || await Admin.findOne();

    const masterEmail = existingAdmin?.email || process.env.EMAIL_GOOGLE_USER || "admin@realestate.com";
    const masterPhone = existingAdmin?.phone || "9999999999";
    const masterCompany = existingAdmin?.companyName || "Bhole Baba Investments";
    const masterOwner = existingAdmin?.name || "Super Admin";

    if (!masterTenant) {
      masterTenant = await Tenant.create({
        name: masterCompany,
        ownerName: masterOwner,
        email: masterEmail,
        phone: masterPhone,
        status: "active",
        isMaster: true,
        subscription: {
          planId: masterPlan?._id || null,
          planName: "Enterprise Master",
          billingCycle: "yearly",
          startDate: new Date(),
          expiresAt: new Date("2099-12-31T23:59:59.999Z"),
          status: "active",
          autoRenew: true,
          limits: {
            maxLeads: -1,
            maxProjects: -1,
            maxCampaigns: -1,
            aiBotEnabled: true,
            fbIntegrationEnabled: true,
            customGoogleCalendar: true,
          },
        },
        notificationEmails: {
          primaryEmail: masterEmail,
          secondaryEmail1: process.env.SUPPORT_EMAIL || null,
          secondaryEmail2: process.env.SUPPORT_EMAIL1 || null,
        },
        facebookConfig: {
          isConnected: false,
          formIds: [],
        },
        googleConfig: {
          connectedEmail: existingAdmin?.googleCalendar?.connectedEmail || masterEmail,
          accessToken: existingAdmin?.googleCalendar?.accessToken || null,
          refreshToken: existingAdmin?.googleCalendar?.refreshToken || null,
          expiryDate: existingAdmin?.googleCalendar?.expiryDate || null,
          isConnected: existingAdmin?.googleCalendar?.isConnected || false,
        },
      });

      console.log(`🏛️ Master Tenant initialized: "${masterTenant.name}" (${masterTenant._id})`);
    }

    // 4. Update existing Super Admin record to attach masterTenant
    if (existingAdmin) {
      let needsSave = false;
      if (!existingAdmin.tenantId) {
        existingAdmin.tenantId = masterTenant._id as any;
        needsSave = true;
      }
      if (existingAdmin.role !== "super_admin") {
        existingAdmin.role = "super_admin";
        needsSave = true;
      }
      if (!existingAdmin.companyName) {
        existingAdmin.companyName = masterTenant.name;
        needsSave = true;
      }
      if (needsSave) {
        await existingAdmin.save();
        console.log(`👑 Super Admin (${existingAdmin.email}) linked to Master Tenant`);
      }
    }

    // 5. Backfill any orphaned collections with masterTenant._id to prevent data loss
    const masterId = masterTenant._id;

    const backfillTasks = [
      Lead.updateMany({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }, { $set: { tenantId: masterId } }),
      Project.updateMany({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }, { $set: { tenantId: masterId } }),
      Campaign.updateMany({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }, { $set: { tenantId: masterId } }),
      Template.updateMany({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }, { $set: { tenantId: masterId } }),
      ConversationMessage.updateMany({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }, { $set: { tenantId: masterId } }),
      ConversationState.updateMany({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }, { $set: { tenantId: masterId } }),
      FbForm.updateMany({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }, { $set: { tenantId: masterId } }),
    ];

    const results = await Promise.all(backfillTasks);
    const totalBackfilled = results.reduce((sum, res) => sum + (res.modifiedCount || 0), 0);
    if (totalBackfilled > 0) {
      console.log(`📦 Multi-tenancy migration: Linked ${totalBackfilled} existing documents to Master Tenant`);
    }
  } catch (err: any) {
    console.error("⚠️ Error in initMasterTenantAndPlans:", err.message || err);
  }
}
