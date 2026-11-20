import { Response } from "express";
import Tenant from "../models/tenant.model";
import Admin from "../models/admin.model";
import Lead from "../models/lead.model";
import Project from "../models/project.model";
import { AuthenticatedRequest } from "../middleware/adminAuth";
import { oauth2Client } from "../config/google";
import { getTenantLeadUsage } from "../services/tenantLimitService";

/**
 * Resolves effective tenant ID for the request.
 * Handles SaaS tokens, legacy admin tokens, and super admin fallbacks.
 */
const resolveTenantId = async (req: AuthenticatedRequest): Promise<string | null> => {
  if (req.tenantId) return req.tenantId;
  if (req.adminId) {
    try {
      const adminDoc = await Admin.findById(req.adminId).select("tenantId role").lean();
      if (adminDoc?.tenantId) return adminDoc.tenantId.toString();
    } catch {}
  }
  if (req.userRole === "super_admin" || req.userRole === "admin" || !req.userRole) {
    try {
      const master = await Tenant.findOne({ isMaster: true }).select("_id").lean();
      if (master) return master._id.toString();
    } catch {}
  }
  return null;
};

// ── Get Current Tenant Settings & Integration Status ────────────────────────
export const getTenantSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let tenantId = await resolveTenantId(req);
    if (!tenantId) {
      // If no tenant is found at all, fallback to master or first tenant
      const master = await Tenant.findOne({ isMaster: true }).lean();
      if (master) tenantId = master._id.toString();
    }

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context not found" });
    }

    let tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      tenant = await Tenant.findOne({ isMaster: true }).lean();
    }
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }

    // Real-time usage calculation
    const usageStats = await getTenantLeadUsage((tenant as any)._id);
    const projectsCount = await Project.countDocuments({ tenantId: (tenant as any)._id });

    // Mask secret keys for security
    const maskedFbToken = tenant.facebookConfig?.pageAccessToken
      ? `${tenant.facebookConfig.pageAccessToken.slice(0, 8)}...${tenant.facebookConfig.pageAccessToken.slice(-4)}`
      : null;

    return res.status(200).json({
      success: true,
      settings: {
        id: tenant._id,
        name: tenant.name,
        ownerName: tenant.ownerName,
        email: tenant.email,
        phone: tenant.phone,
        status: tenant.status,
        isMaster: tenant.isMaster,
        notificationEmails: {
          primaryEmail: tenant.notificationEmails?.primaryEmail || tenant.email,
          secondaryEmail1: tenant.notificationEmails?.secondaryEmail1 || "",
          secondaryEmail2: tenant.notificationEmails?.secondaryEmail2 || "",
        },
        facebookConfig: {
          isConnected: Boolean(tenant.facebookConfig?.isConnected),
          pageId: tenant.facebookConfig?.pageId || "",
          pageAccessTokenMasked: maskedFbToken,
          hasAccessToken: Boolean(tenant.facebookConfig?.pageAccessToken),
          formIds: tenant.facebookConfig?.formIds || [],
          lastSyncAt: tenant.facebookConfig?.lastSyncAt || null,
        },
        googleConfig: {
          isConnected: Boolean(tenant.googleConfig?.isConnected),
          connectedEmail: tenant.googleConfig?.connectedEmail || "",
          lastSyncAt: tenant.googleConfig?.lastSyncAt || null,
        },
        subscription: {
          ...tenant.subscription,
          planName: usageStats.planName || tenant.subscription?.planName,
          limits: usageStats.limits,
          usage: {
            leadsCount: usageStats.totalLeads,
            currentMonthLeads: usageStats.currentMonthLeads,
            maxLeads: usageStats.maxLeads,
            remainingLeads: usageStats.remaining,
            usagePercentage: usageStats.percentage,
            isLimitReached: usageStats.isLimitReached,
            isWarning: usageStats.isWarning,
            cycleStart: usageStats.cycleStart,
            cycleEnd: usageStats.cycleEnd,
            projectsCount,
            maxProjects: usageStats.limits.maxProjects,
          },
        },
      },
    });
  } catch (err: any) {
    console.error("Error in getTenantSettings:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch tenant settings" });
  }
};

// ── Update Notification Emails (Primary + 2 Optionals) ──────────────────────
export const updateNotificationEmails = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context not found" });
    }

    const { primaryEmail, secondaryEmail1, secondaryEmail2 } = req.body;

    if (!primaryEmail || !primaryEmail.includes("@")) {
      return res.status(400).json({
        success: false,
        error: "A valid primary email is required. It handles customer communications and calendar bookings.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (secondaryEmail1 && !emailRegex.test(secondaryEmail1.trim())) {
      return res.status(400).json({ success: false, error: "Invalid format for Secondary Email 1" });
    }
    if (secondaryEmail2 && !emailRegex.test(secondaryEmail2.trim())) {
      return res.status(400).json({ success: false, error: "Invalid format for Secondary Email 2" });
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenantId,
      {
        $set: {
          "notificationEmails.primaryEmail": primaryEmail.trim().toLowerCase(),
          "notificationEmails.secondaryEmail1": secondaryEmail1 ? secondaryEmail1.trim().toLowerCase() : null,
          "notificationEmails.secondaryEmail2": secondaryEmail2 ? secondaryEmail2.trim().toLowerCase() : null,
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification emails updated successfully. Alerts will be dispatched to all specified addresses.",
      notificationEmails: updated.notificationEmails,
    });
  } catch (err: any) {
    console.error("Error updating notification emails:", err);
    return res.status(500).json({ success: false, error: "Failed to update notification emails" });
  }
};

// ── Update Tenant's Self-Service Facebook Integration ───────────────────────
export const updateFacebookConfig = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context not found" });
    }

    const { pageAccessToken, pageId, appSecret, formIds } = req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }

    if (pageAccessToken !== undefined) {
      tenant.facebookConfig.pageAccessToken = pageAccessToken ? pageAccessToken.trim() : null;
      tenant.facebookConfig.isConnected = Boolean(tenant.facebookConfig.pageAccessToken);
    }
    if (pageId !== undefined) {
      tenant.facebookConfig.pageId = pageId ? pageId.trim() : null;
    }
    if (appSecret !== undefined) {
      tenant.facebookConfig.appSecret = appSecret ? appSecret.trim() : null;
    }
    if (formIds !== undefined && Array.isArray(formIds)) {
      tenant.facebookConfig.formIds = formIds;
    }

    tenant.facebookConfig.lastSyncAt = new Date();
    await tenant.save();

    return res.status(200).json({
      success: true,
      message: "Facebook settings updated successfully",
      facebookConfig: {
        isConnected: tenant.facebookConfig.isConnected,
        pageId: tenant.facebookConfig.pageId,
        formIds: tenant.facebookConfig.formIds,
        lastSyncAt: tenant.facebookConfig.lastSyncAt,
      },
    });
  } catch (err: any) {
    console.error("Error updating Facebook config:", err);
    return res.status(500).json({ success: false, error: "Failed to update Facebook configuration" });
  }
};

// ── Generate Google OAuth URL for Tenant Calendar ───────────────────────────
export const getTenantGoogleAuthUrl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context not found" });
    }

    const state = JSON.stringify({ tenantId });

    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state,
    });

    return res.status(200).json({ success: true, url });
  } catch (err: any) {
    console.error("Error generating Google auth URL:", err);
    return res.status(500).json({ success: false, error: "Failed to generate Google auth URL" });
  }
};

// ── Handle Tenant Google OAuth Callback ─────────────────────────────────────
export const handleTenantGoogleCallback = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ success: false, error: "Authorization code missing" });
    }

    let tenantId = req.tenantId;
    if (state && typeof state === "string") {
      try {
        const parsedState = JSON.parse(state);
        if (parsedState.tenantId) tenantId = parsedState.tenantId;
      } catch {}
    }

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Missing tenant state in callback" });
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let connectedEmail = null;
    try {
      const oauth2 = (await import("googleapis")).google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      connectedEmail = userInfo.data.email || null;
    } catch {}

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }

    tenant.googleConfig = {
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || tenant.googleConfig?.refreshToken || null,
      expiryDate: tokens.expiry_date || null,
      isConnected: true,
      connectedEmail: connectedEmail || tenant.email,
      lastSyncAt: new Date(),
    };

    await tenant.save();

    const frontendBaseUrl =
      process.env.FRONTEND_URL1 || process.env.FRONTEND_URL || "http://localhost:3000";

    return res.redirect(`${frontendBaseUrl.replace(/\/$/, "")}/settings?google=connected`);
  } catch (err: any) {
    console.error("Error in handleTenantGoogleCallback:", err);
    return res.status(500).json({ success: false, error: "Google OAuth callback failed" });
  }
};

// ── Disconnect Google Calendar ──────────────────────────────────────────────
export const disconnectTenantGoogleCalendar = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context not found" });
    }

    await Tenant.findByIdAndUpdate(tenantId, {
      $set: {
        "googleConfig.isConnected": false,
        "googleConfig.accessToken": null,
        "googleConfig.refreshToken": null,
        "googleConfig.connectedEmail": null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Google Calendar disconnected successfully",
    });
  } catch (err: any) {
    console.error("Error disconnecting Google Calendar:", err);
    return res.status(500).json({ success: false, error: "Failed to disconnect Google Calendar" });
  }
};

// ── Get Quick Tenant Usage & Limit Status ────────────────────────────────────
export const getTenantUsageController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context not found" });
    }

    const usageStats = await getTenantLeadUsage(tenantId);
    const projectsCount = await Project.countDocuments({ tenantId });

    return res.status(200).json({
      success: true,
      usage: {
        ...usageStats,
        projectsCount,
        maxProjects: usageStats.limits.maxProjects,
      },
    });
  } catch (err: any) {
    console.error("Error in getTenantUsageController:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch usage status" });
  }
};

// ── Get Organization Team Members & Registered Users ─────────────────────────
export const getTenantTeamMembers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context not found" });
    }

    const members = await Admin.find({ tenantId })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      members,
      totalCount: members.length,
    });
  } catch (err: any) {
    console.error("Error in getTenantTeamMembers:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch team members" });
  }
};
