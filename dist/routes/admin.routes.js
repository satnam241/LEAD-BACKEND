"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// Auth
router.post("/signup", admin_controller_1.adminSignup);
router.post("/login", admin_controller_1.adminLogin);
router.post("/forgot-password", admin_controller_1.forgotPassword);
router.post("/reset-password", admin_controller_1.changePasswordLoggedIn);
router.get("/me", admin_controller_1.adminGetProfile);
// Lead Management
router.get("/leads", adminAuth_1.adminAuth, admin_controller_1.adminGetLeads);
router.put("/leads/:id", adminAuth_1.adminAuth, admin_controller_1.adminUpdateLead);
router.delete("/leads/:id", adminAuth_1.adminAuth, admin_controller_1.adminDeleteLead);
// Import / Export
router.post("/import-leads", upload_1.upload.single("file"), admin_controller_1.importLeadsController);
router.get("/leads/export", adminAuth_1.adminAuth, admin_controller_1.adminExportLeads);
router.get("/stats/summary", adminAuth_1.adminAuth, admin_controller_1.adminSummaryStats);
router.get("/stats/daily", adminAuth_1.adminAuth, admin_controller_1.adminDailyStats);
// ==============================
// ⭐ REMINDER ROUTES
// ==============================
// 🔔 Popup reminder leads
router.get("/reminders", adminAuth_1.adminAuth, admin_controller_1.getReminderLeads);
// 🟩 Mark lead as contacted (reset reminder)
router.put("/reminders/contacted/:id", adminAuth_1.adminAuth, admin_controller_1.markAsContacted);
// 📊 Dashboard counter
router.get("/reminders/count", adminAuth_1.adminAuth, admin_controller_1.getPendingReminderCount);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map