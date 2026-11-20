"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const upload_1 = require("../middleware/upload");
const security_middleware_1 = require("../middleware/security.middleware");
const router = (0, express_1.Router)();
// ── Auth (Protected against Brute Force & Credential Stuffing) ──
router.post("/signup", security_middleware_1.authLimiter, admin_controller_1.adminSignup);
router.post("/login", security_middleware_1.authLimiter, admin_controller_1.adminLogin);
router.post("/forgot-password", security_middleware_1.authLimiter, admin_controller_1.forgotPassword);
router.post("/reset-password", admin_controller_1.changePasswordLoggedIn);
router.get("/me", admin_controller_1.adminGetProfile);
router.put("/me", adminAuth_1.adminAuth, admin_controller_1.adminUpdateProfile);
router.put("/profile", adminAuth_1.adminAuth, admin_controller_1.adminUpdateProfile);
router.post("/reset-password-token", security_middleware_1.authLimiter, admin_controller_1.resetPasswordWithToken);
// ── Lead Management ───────────────────────────────────────────────
router.get("/leads", adminAuth_1.adminAuth, admin_controller_1.adminGetLeads);
router.put("/leads/:id", adminAuth_1.adminAuth, admin_controller_1.adminUpdateLead);
router.delete("/leads/:id", adminAuth_1.adminAuth, admin_controller_1.adminDeleteLead);
// ── Import / Export ───────────────────────────────────────────────
router.post("/import-leads", adminAuth_1.adminAuth, upload_1.upload.single("file"), admin_controller_1.importLeadsController);
router.get("/leads/export", adminAuth_1.adminAuth, admin_controller_1.adminExportLeads);
// ── Stats ─────────────────────────────────────────────────────────
router.get("/stats/daily", adminAuth_1.adminAuth, admin_controller_1.adminDailyStats);
router.get("/stats/summary", adminAuth_1.adminAuth, admin_controller_1.adminStatsSummary);
router.get("/monthly-report", adminAuth_1.adminAuth, admin_controller_1.adminAdvancedMonthlyReport);
router.get("/leads/monthly-report", adminAuth_1.adminAuth, admin_controller_1.adminExportMonthlyReport);
// ── Reminders ─────────────────────────────────────────────────────
router.get("/reminders", adminAuth_1.adminAuth, admin_controller_1.getReminderLeads);
router.put("/reminders/contacted/:id", adminAuth_1.adminAuth, admin_controller_1.markAsContacted);
router.get("/reminders/count", adminAuth_1.adminAuth, admin_controller_1.getPendingReminderCount);
router.get("/notifications", adminAuth_1.adminAuth, admin_controller_1.getNotifications);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map