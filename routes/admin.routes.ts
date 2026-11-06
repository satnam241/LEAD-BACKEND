import { Router } from "express";
import {
  adminSignup,
  adminLogin,
  adminGetLeads,
  adminUpdateLead,
  adminDeleteLead,
  adminDailyStats,
  adminStatsSummary,
  adminAdvancedMonthlyReport,
  adminExportLeads,
  forgotPassword,
  changePasswordLoggedIn,
  adminGetProfile,
  adminUpdateProfile,
  importLeadsController,
  getReminderLeads,
  markAsContacted,
  getPendingReminderCount,
  getNotifications,
  adminExportMonthlyReport,
  resetPasswordWithToken,
} from "../controllers/admin.controller";

import { adminAuth } from "../middleware/adminAuth";
import { upload } from "../middleware/upload";

const router = Router();

// ── Auth ──────────────────────────────────────────────────────────
router.post("/signup", adminSignup);
router.post("/login", adminLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", changePasswordLoggedIn);
router.get("/me", adminGetProfile);
router.put("/me", adminAuth, adminUpdateProfile);
router.put("/profile", adminAuth, adminUpdateProfile);
router.post("/reset-password-token", resetPasswordWithToken);

// ── Lead Management ───────────────────────────────────────────────
router.get("/leads", adminAuth, adminGetLeads);
router.put("/leads/:id", adminAuth, adminUpdateLead);
router.delete("/leads/:id", adminAuth, adminDeleteLead);

// ── Import / Export ───────────────────────────────────────────────
router.post("/import-leads", upload.single("file"), importLeadsController);
router.get("/leads/export", adminAuth, adminExportLeads);

// ── Stats ─────────────────────────────────────────────────────────
router.get("/stats/daily", adminAuth, adminDailyStats);
router.get("/stats/summary", adminAuth, adminStatsSummary);
router.get("/monthly-report", adminAuth, adminAdvancedMonthlyReport);
router.get("/leads/monthly-report", adminExportMonthlyReport);

// ── Reminders ─────────────────────────────────────────────────────
router.get("/reminders", adminAuth, getReminderLeads);
router.put("/reminders/contacted/:id", adminAuth, markAsContacted);
router.get("/reminders/count", adminAuth, getPendingReminderCount);

router.get("/notifications", adminAuth, getNotifications);

export default router;
