"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBillingCycleRange = getBillingCycleRange;
exports.getTenantEffectiveLimits = getTenantEffectiveLimits;
exports.getTenantLeadUsage = getTenantLeadUsage;
exports.canTenantAddLeads = canTenantAddLeads;
exports.checkAndSendLeadLimitNotification = checkAndSendLeadLimitNotification;
exports.canTenantAddProject = canTenantAddProject;
const tenant_model_1 = __importDefault(require("../models/tenant.model"));
const plan_model_1 = __importDefault(require("../models/plan.model"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const project_model_1 = __importDefault(require("../models/project.model"));
const emailService_1 = require("./emailService");
/**
 * Calculates the exact start and end date for the tenant's current monthly billing cycle.
 * Accurately tracks 1-month intervals from the subscription start date.
 */
function getBillingCycleRange(startDate) {
    const now = new Date();
    if (!startDate || isNaN(new Date(startDate).getTime())) {
        const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
        return { cycleStart, cycleEnd };
    }
    const start = new Date(startDate);
    if (start > now) {
        const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
        return { cycleStart, cycleEnd };
    }
    // Roll forward in 1-month increments until the cycle contains 'now'
    let cycleStart = new Date(start);
    while (true) {
        const nextCycle = new Date(cycleStart);
        nextCycle.setMonth(nextCycle.getMonth() + 1);
        if (nextCycle > now) {
            return { cycleStart, cycleEnd: nextCycle };
        }
        cycleStart = nextCycle;
    }
}
/**
 * Resolves the real-time effective limits for a tenant.
 * If the Super Admin updates the underlying Plan in the admin panel,
 * this function automatically pulls the latest limits directly from the Plan.
 */
async function getTenantEffectiveLimits(tenantId) {
    const tenant = await tenant_model_1.default.findById(tenantId);
    if (!tenant)
        return null;
    let maxLeads = tenant.subscription?.limits?.maxLeads ?? 500;
    let maxProjects = tenant.subscription?.limits?.maxProjects ?? 2;
    let maxCampaigns = tenant.subscription?.limits?.maxCampaigns ?? 1000;
    let aiBotEnabled = tenant.subscription?.limits?.aiBotEnabled ?? true;
    let fbIntegrationEnabled = tenant.subscription?.limits?.fbIntegrationEnabled ?? true;
    let customGoogleCalendar = tenant.subscription?.limits?.customGoogleCalendar ?? true;
    let planName = tenant.subscription?.planName || "Custom";
    // Pull live Plan from DB for real-time terms & conditions enforcement
    if (tenant.subscription?.planId) {
        const activePlan = await plan_model_1.default.findById(tenant.subscription.planId).lean();
        if (activePlan) {
            planName = activePlan.name || planName;
            if (activePlan.limits) {
                maxLeads = activePlan.limits.maxLeads ?? maxLeads;
                maxProjects = activePlan.limits.maxProjects ?? maxProjects;
                maxCampaigns = activePlan.limits.maxCampaigns ?? maxCampaigns;
                aiBotEnabled = activePlan.limits.aiBotEnabled ?? aiBotEnabled;
                fbIntegrationEnabled = activePlan.limits.fbIntegrationEnabled ?? fbIntegrationEnabled;
                customGoogleCalendar = activePlan.limits.customGoogleCalendar ?? customGoogleCalendar;
            }
        }
    }
    const { cycleStart, cycleEnd } = getBillingCycleRange(tenant.subscription?.startDate);
    return {
        tenant,
        planName,
        cycleStart,
        cycleEnd,
        limits: {
            maxLeads,
            maxProjects,
            maxCampaigns,
            aiBotEnabled,
            fbIntegrationEnabled,
            customGoogleCalendar,
        },
    };
}
/**
 * Returns comprehensive usage statistics for the tenant in the current monthly cycle.
 */
async function getTenantLeadUsage(tenantId) {
    const resolved = await getTenantEffectiveLimits(tenantId);
    if (!resolved) {
        return {
            tenant: null,
            planName: "Default",
            currentMonthLeads: 0,
            totalLeads: 0,
            maxLeads: 500,
            remaining: 500,
            percentage: 0,
            isLimitReached: false,
            isWarning: false,
            cycleStart: new Date(),
            cycleEnd: new Date(),
            limits: {
                maxLeads: 500,
                maxProjects: 2,
                maxCampaigns: 1000,
                aiBotEnabled: true,
                fbIntegrationEnabled: true,
                customGoogleCalendar: true,
            },
        };
    }
    const { tenant, limits, planName, cycleStart, cycleEnd } = resolved;
    // Monthly leads created within current billing window
    const currentMonthLeads = await lead_model_1.default.countDocuments({
        tenantId: tenant._id,
        createdAt: { $gte: cycleStart, $lt: cycleEnd },
        isDeleted: { $ne: true },
    });
    const totalLeads = await lead_model_1.default.countDocuments({
        tenantId: tenant._id,
        isDeleted: { $ne: true },
    });
    const maxLeads = limits.maxLeads;
    const isUnlimited = maxLeads === -1;
    const remaining = isUnlimited ? 999999 : Math.max(0, maxLeads - currentMonthLeads);
    const percentage = isUnlimited ? 0 : Math.round((currentMonthLeads / maxLeads) * 100);
    const isLimitReached = !isUnlimited && currentMonthLeads >= maxLeads;
    const isWarning = !isUnlimited && percentage >= 80 && !isLimitReached;
    return {
        tenant,
        planName,
        currentMonthLeads,
        totalLeads,
        maxLeads,
        remaining,
        percentage,
        isLimitReached,
        isWarning,
        cycleStart,
        cycleEnd,
        limits,
    };
}
/**
 * Real-time gatekeeper for adding leads across all channels (Manual, FB, WhatsApp, CSV).
 */
async function canTenantAddLeads(tenantId, countToAdd = 1) {
    const usage = await getTenantLeadUsage(tenantId);
    const isUnlimited = usage.maxLeads === -1;
    if (isUnlimited) {
        return {
            allowed: true,
            currentCount: usage.currentMonthLeads,
            maxLeads: -1,
            remaining: 999999,
        };
    }
    if (usage.currentMonthLeads + countToAdd > usage.maxLeads) {
        return {
            allowed: false,
            currentCount: usage.currentMonthLeads,
            maxLeads: usage.maxLeads,
            remaining: usage.remaining,
            error: `Monthly plan lead limit reached (${usage.currentMonthLeads}/${usage.maxLeads}). Cannot add ${countToAdd} lead(s). Please upgrade your subscription plan.`,
        };
    }
    return {
        allowed: true,
        currentCount: usage.currentMonthLeads,
        maxLeads: usage.maxLeads,
        remaining: usage.remaining,
    };
}
/**
 * Checks if tenant has reached 80% or 100% of their monthly limit,
 * sends automated notification emails, and updates the warning tier.
 */
async function checkAndSendLeadLimitNotification(tenantId) {
    try {
        const usage = await getTenantLeadUsage(tenantId);
        if (usage.maxLeads === -1)
            return; // Unlimited plan, no alert needed
        const tenant = usage.tenant;
        if (!tenant)
            return;
        const targetEmail = tenant.notificationEmails?.primaryEmail || tenant.email;
        if (!targetEmail)
            return;
        const currentTier = tenant.subscription?.lastLimitWarningTier || 0;
        const percentage = usage.percentage;
        // Reset warning tier if a new billing cycle has begun
        if (tenant.subscription?.lastLimitWarningSentAt && tenant.subscription.lastLimitWarningSentAt < usage.cycleStart) {
            await tenant_model_1.default.findByIdAndUpdate(tenant._id, {
                $set: { "subscription.lastLimitWarningTier": 0 },
            });
        }
        // 100% Critical Alert
        if (usage.currentMonthLeads >= usage.maxLeads && currentTier < 100) {
            console.log(`🚨 Tenant ${tenant.name} reached 100% lead limit (${usage.currentMonthLeads}/${usage.maxLeads}). Sending critical notification...`);
            const subject = `🚨 Action Required: Monthly Lead Limit Reached (100%) - ${usage.currentMonthLeads}/${usage.maxLeads} Leads`;
            const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #ef4444; margin: 0 0 6px;">Monthly Lead Limit Reached (100%)</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0;">Organization: <strong>${tenant.name}</strong></p>
          </div>
          
          <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #991b1b; font-size: 14px; line-height: 1.6;">
            <p style="margin: 0 0 8px;"><strong>Attention:</strong> You have reached <strong>${usage.currentMonthLeads} out of ${usage.maxLeads} leads</strong> allowed for your <strong>${usage.planName}</strong> plan in the current billing cycle.</p>
            <p style="margin: 0;">Any new incoming leads (from Web, Facebook Ads, or WhatsApp Bot) are now paused until your next billing cycle starts on <strong>${usage.cycleEnd.toLocaleDateString("en-IN")}</strong> or until you upgrade your plan.</p>
          </div>

          <div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
            <table style="width: 100%; font-size: 13px; color: #334155;">
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Current Usage:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ef4444;">${usage.currentMonthLeads} / ${usage.maxLeads} (100%)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Billing Cycle:</td>
                <td style="padding: 6px 0; text-align: right;">${usage.cycleStart.toLocaleDateString("en-IN")} - ${usage.cycleEnd.toLocaleDateString("en-IN")}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Plan:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${usage.planName}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center;">
            <a href="http://localhost:5173/settings" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px;">
              Upgrade Plan Now
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
            Need higher volume or custom enterprise limits? Reply directly to this email or visit your dashboard.
          </p>
        </div>
      `;
            await (0, emailService_1.sendEmail)(targetEmail, subject, html).catch((err) => {
                console.warn("⚠️ Lead limit email dispatch note:", err.message);
            });
            await tenant_model_1.default.findByIdAndUpdate(tenant._id, {
                $set: {
                    "subscription.lastLimitWarningTier": 100,
                    "subscription.lastLimitWarningSentAt": new Date(),
                },
            });
            return;
        }
        // 80% Warning Alert
        if (percentage >= 80 && currentTier < 80) {
            console.log(`⚠️ Tenant ${tenant.name} reached 80% lead limit (${usage.currentMonthLeads}/${usage.maxLeads}). Sending warning notification...`);
            const subject = `⚠️ Warning: You have used 80% of your monthly lead limit (${usage.currentMonthLeads}/${usage.maxLeads})`;
            const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #f59e0b; margin: 0 0 6px;">80% Monthly Lead Quota Used</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0;">Organization: <strong>${tenant.name}</strong></p>
          </div>
          
          <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #92400e; font-size: 14px; line-height: 1.6;">
            <p style="margin: 0 0 8px;"><strong>Usage Notice:</strong> You have consumed <strong>${usage.currentMonthLeads} of your ${usage.maxLeads} monthly leads (${percentage}%)</strong> on your <strong>${usage.planName}</strong> plan.</p>
            <p style="margin: 0;">You have <strong>${usage.remaining} leads remaining</strong> in this billing cycle (cycle ends on ${usage.cycleEnd.toLocaleDateString("en-IN")}). Upgrade soon so your campaigns don't miss new prospects.</p>
          </div>

          <div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
            <table style="width: 100%; font-size: 13px; color: #334155;">
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Current Usage:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #f59e0b;">${usage.currentMonthLeads} / ${usage.maxLeads} (${percentage}%)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Remaining Leads:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${usage.remaining}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Billing Cycle:</td>
                <td style="padding: 6px 0; text-align: right;">${usage.cycleStart.toLocaleDateString("en-IN")} - ${usage.cycleEnd.toLocaleDateString("en-IN")}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center;">
            <a href="http://localhost:5173/settings" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px;">
              Review & Upgrade Plan
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
            This is an automated threshold warning from your Real Estate CRM.
          </p>
        </div>
      `;
            await (0, emailService_1.sendEmail)(targetEmail, subject, html).catch((err) => {
                console.warn("⚠️ Lead warning email dispatch note:", err.message);
            });
            await tenant_model_1.default.findByIdAndUpdate(tenant._id, {
                $set: {
                    "subscription.lastLimitWarningTier": 80,
                    "subscription.lastLimitWarningSentAt": new Date(),
                },
            });
        }
    }
    catch (err) {
        console.error("⚠️ Error checking/sending lead limit notification:", err?.message || err);
    }
}
/**
 * Project creation limit check.
 */
async function canTenantAddProject(tenantId) {
    const resolved = await getTenantEffectiveLimits(tenantId);
    if (!resolved) {
        return { allowed: true, currentCount: 0, maxProjects: 2 };
    }
    const maxProjects = resolved.limits.maxProjects;
    if (maxProjects === -1) {
        return { allowed: true, currentCount: 0, maxProjects: -1 };
    }
    const currentCount = await project_model_1.default.countDocuments({ tenantId });
    if (currentCount >= maxProjects) {
        return {
            allowed: false,
            currentCount,
            maxProjects,
            error: `Plan project limit reached (${currentCount}/${maxProjects}). Please upgrade your plan to add more projects.`,
        };
    }
    return { allowed: true, currentCount, maxProjects };
}
//# sourceMappingURL=tenantLimitService.js.map