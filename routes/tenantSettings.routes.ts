import express from "express";
import {
  getTenantSettings,
  getTenantUsageController,
  getTenantTeamMembers,
  updateNotificationEmails,
  updateFacebookConfig,
  getTenantGoogleAuthUrl,
  handleTenantGoogleCallback,
  disconnectTenantGoogleCalendar,
} from "../controllers/tenantSettings.controller";
import { adminAuth } from "../middleware/adminAuth";

const router = express.Router();

// ── Tenant Self-Service Routes (Protected by adminAuth) ──
router.get("/settings", adminAuth, getTenantSettings);
router.get("/usage", adminAuth, getTenantUsageController);
router.get("/team", adminAuth, getTenantTeamMembers);
router.put("/notification-emails", adminAuth, updateNotificationEmails);
router.put("/facebook-config", adminAuth, updateFacebookConfig);
router.get("/google/auth-url", adminAuth, getTenantGoogleAuthUrl);
router.get("/google/callback", handleTenantGoogleCallback); // Google redirects here
router.post("/google/disconnect", adminAuth, disconnectTenantGoogleCalendar);

export default router;
