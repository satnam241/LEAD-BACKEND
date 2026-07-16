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

import { Router } from "express";
import {
  adminSignup,
  adminLogin,
  adminGetLeads,
  adminUpdateLead,
  adminDeleteLead,
  adminDailyStats,
  adminAdvancedMonthlyReport,
  adminExportLeads,
  forgotPassword,
  changePasswordLoggedIn,
  adminGetProfile,
  importLeadsController,
  getReminderLeads,
  markAsContacted,
  getPendingReminderCount,
  getNotifications,
  adminExportMonthlyReport ,
  resetPasswordWithToken 
} from "../controllers/admin.controller";

import { adminAuth } from "../middleware/adminAuth";
import { upload }    from "../middleware/upload";

const router = Router();

// ── Auth ──────────────────────────────────────────────────────────
router.post("/signup",          adminSignup);
router.post("/login",           adminLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password",  changePasswordLoggedIn);
router.get ("/me",              adminGetProfile);
router.post("/reset-password-token", resetPasswordWithToken);
// ── Lead Management ───────────────────────────────────────────────
router.get   ("/leads",      adminAuth, adminGetLeads);
router.put   ("/leads/:id",  adminAuth, adminUpdateLead);
router.delete("/leads/:id",  adminAuth, adminDeleteLead);

// ── Import / Export ───────────────────────────────────────────────
router.post("/import-leads",  upload.single("file"), importLeadsController);
router.get ("/leads/export",  adminAuth, adminExportLeads);

// ── Stats ─────────────────────────────────────────────────────────
router.get("/stats/daily",    adminAuth, adminDailyStats);
router.get("/monthly-report", adminAuth, adminAdvancedMonthlyReport);
router.get("/leads/monthly-report", adminExportMonthlyReport);

// ── Reminders ─────────────────────────────────────────────────────
router.get("/reminders",               adminAuth, getReminderLeads);
router.put("/reminders/contacted/:id", adminAuth, markAsContacted);
router.get("/reminders/count",         adminAuth, getPendingReminderCount);

router.get("/notifications", adminAuth, getNotifications);

export default router;