"use strict";
// // import { Router } from "express";
// // import {
// //   adminSignup,
// //   adminLogin,
// //   adminGetLeads,
// //   adminUpdateLead,
// //   adminDeleteLead,
// //   adminSummaryStats,
// //   adminDailyStats,
// //   adminAdvancedMonthlyReport,
// //   adminExportLeads,
// //   forgotPassword,
// //   changePasswordLoggedIn,
// //   adminGetProfile,
// //   importLeadsController,
// //   getReminderLeads,
// //   markAsContacted,
// //   getPendingReminderCount,
Object.defineProperty(exports, "__esModule", { value: true });
// // } from "../controllers/admin.controller";
// // import { adminAuth } from "../middleware/adminAuth";
// // import { upload } from "../middleware/upload";
// // const router = Router();
// // // Auth
// // router.post("/signup", adminSignup);
// // router.post("/login", adminLogin);
// // router.post("/forgot-password", forgotPassword);
// // router.post("/reset-password", changePasswordLoggedIn);
// // router.get("/me", adminGetProfile);
// // // Lead Management
// // router.get("/leads", adminAuth, adminGetLeads);
// // router.put("/leads/:id", adminAuth, adminUpdateLead);
// // router.delete("/leads/:id", adminAuth, adminDeleteLead);
// // // Import / Export
// // router.post("/import-leads", upload.single("file"), importLeadsController);
// // router.get("/leads/export", adminAuth, adminExportLeads);
// // router.get("/stats/summary", adminAuth, adminSummaryStats);
// // router.get("/stats/daily", adminAuth, adminDailyStats);
// // router.get("/monthly-report",
// //   adminAdvancedMonthlyReport
// // );
// // // ==============================
// // // ⭐ REMINDER ROUTES
// // // ==============================
// // // 🔔 Popup reminder leads
// // router.get("/reminders", adminAuth, getReminderLeads);
// // // 🟩 Mark lead as contacted (reset reminder)
// // router.put("/reminders/contacted/:id", adminAuth, markAsContacted);
// // // 📊 Dashboard counter
// // router.get("/reminders/count", adminAuth, getPendingReminderCount);
// // export default router;
// import { Router } from "express";
// import {
//   adminSignup,
//   adminLogin,
//   adminGetLeads,
//   adminUpdateLead,
//   adminDeleteLead,
//   //adminSummaryStats,
//   adminDailyStats,
//   adminAdvancedMonthlyReport,
//   adminExportLeads,
//   forgotPassword,
//   changePasswordLoggedIn,
//   adminGetProfile,
//   importLeadsController,
//   getReminderLeads,
//   markAsContacted,
//   getPendingReminderCount,
//   getNotifications
// } from "../controllers/admin.controller";
// import { adminAuth } from "../middleware/adminAuth";
// import { upload }    from "../middleware/upload";
// const router = Router();
// // ── Auth (no token needed) ────────────────────────────────────────
// router.post("/signup",          adminSignup);
// router.post("/login",           adminLogin);
// router.post("/forgot-password", forgotPassword);
// router.post("/reset-password",  changePasswordLoggedIn);
// router.get ("/me",              adminGetProfile);
// // ── Lead Management ───────────────────────────────────────────────
// router.get   ("/leads",      adminAuth, adminGetLeads);
// router.put   ("/leads/:id",  adminAuth, adminUpdateLead);
// router.delete("/leads/:id",  adminAuth, adminDeleteLead);
// // ── Import / Export ───────────────────────────────────────────────
// router.post("/import-leads",   upload.single("file"), importLeadsController);
// router.get ("/leads/export",   adminAuth, adminExportLeads);
// // ── Stats ─────────────────────────────────────────────────────────
// //router.get("/stats/summary",   adminAuth, adminSummaryStats);
// router.get("/stats/daily",     adminAuth, adminDailyStats);
// router.get("/monthly-report",  adminAuth, adminAdvancedMonthlyReport);
// // ── Reminder routes ───────────────────────────────────────────────
// router.get("/reminders",                  adminAuth, getReminderLeads);
// router.put("/reminders/contacted/:id",    adminAuth, markAsContacted);
// router.get("/reminders/count",            adminAuth, getPendingReminderCount);
// router.get("/", adminAuth, getNotifications);
// export default router;
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// ── Auth ──────────────────────────────────────────────────────────
router.post("/signup", admin_controller_1.adminSignup);
router.post("/login", admin_controller_1.adminLogin);
router.post("/forgot-password", admin_controller_1.forgotPassword);
router.post("/reset-password", admin_controller_1.changePasswordLoggedIn);
router.get("/me", admin_controller_1.adminGetProfile);
router.post("/reset-password-token", admin_controller_1.resetPasswordWithToken);
// ── Lead Management ───────────────────────────────────────────────
router.get("/leads", adminAuth_1.adminAuth, admin_controller_1.adminGetLeads);
router.put("/leads/:id", adminAuth_1.adminAuth, admin_controller_1.adminUpdateLead);
router.delete("/leads/:id", adminAuth_1.adminAuth, admin_controller_1.adminDeleteLead);
// ── Import / Export ───────────────────────────────────────────────
router.post("/import-leads", upload_1.upload.single("file"), admin_controller_1.importLeadsController);
router.get("/leads/export", adminAuth_1.adminAuth, admin_controller_1.adminExportLeads);
// ── Stats ─────────────────────────────────────────────────────────
router.get("/stats/daily", adminAuth_1.adminAuth, admin_controller_1.adminDailyStats);
router.get("/monthly-report", adminAuth_1.adminAuth, admin_controller_1.adminAdvancedMonthlyReport);
router.get("/leads/monthly-report", admin_controller_1.adminExportMonthlyReport);
// ── Reminders ─────────────────────────────────────────────────────
router.get("/reminders", adminAuth_1.adminAuth, admin_controller_1.getReminderLeads);
router.put("/reminders/contacted/:id", adminAuth_1.adminAuth, admin_controller_1.markAsContacted);
router.get("/reminders/count", adminAuth_1.adminAuth, admin_controller_1.getPendingReminderCount);
router.get("/notifications", adminAuth_1.adminAuth, admin_controller_1.getNotifications);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map