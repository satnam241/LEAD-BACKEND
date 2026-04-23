"use strict";
// import { Router } from "express";
// import {
//   scheduleFollowUp,
//   cancelFollowUp,
//   listFollowUps,
//   getUpcomingFollowUps,
//   getDueFollowUps,
//   getOverdueFollowUps
// } from "../controllers/followup.controller";
// import { adminAuth } from "../middleware/adminAuth";
Object.defineProperty(exports, "__esModule", { value: true });
// const router = Router();
// // ✅ Lead specific follow-up
// router.post("/leads/:id/follow-up", adminAuth, scheduleFollowUp);
// router.delete("/leads/:id/follow-up", adminAuth, cancelFollowUp);
// // ✅ Global follow-ups
// router.get("/", adminAuth, listFollowUps); // /api/followup
// router.get("/upcoming", adminAuth, getUpcomingFollowUps); // /api/followup/upcoming
// router.get("/due", adminAuth, getDueFollowUps);
// router.get("/overdue", adminAuth, getOverdueFollowUps);
// export default router;
const express_1 = require("express");
const followup_controller_1 = require("../controllers/followup.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
// ✅ Lead specific follow-up (same as before)
router.post("/leads/:id/follow-up", adminAuth_1.adminAuth, followup_controller_1.scheduleFollowUp);
router.delete("/leads/:id/follow-up", adminAuth_1.adminAuth, followup_controller_1.cancelFollowUp);
// ✅ Global follow-ups (same as before)
router.get("/", adminAuth_1.adminAuth, followup_controller_1.listFollowUps); // GET /api/followup
router.get("/upcoming", adminAuth_1.adminAuth, followup_controller_1.getUpcomingFollowUps); // GET /api/followup/upcoming
router.get("/due", adminAuth_1.adminAuth, followup_controller_1.getDueFollowUps); // GET /api/followup/due
router.get("/overdue", adminAuth_1.adminAuth, followup_controller_1.getOverdueFollowUps); // GET /api/followup/overdue
// 🆕 Stats
router.get("/stats", adminAuth_1.adminAuth, followup_controller_1.getFollowUpStats); // GET /api/followup/stats
// 🆕 Overdue actions (lead specific)
router.patch("/leads/:id/acknowledge", adminAuth_1.adminAuth, followup_controller_1.acknowledgeFollowUp); // "dekh liya"
router.patch("/leads/:id/resolve", adminAuth_1.adminAuth, followup_controller_1.resolveFollowUp); // "done"
router.patch("/leads/:id/reschedule", adminAuth_1.adminAuth, followup_controller_1.rescheduleFollowUp); // "kal ke liye"
exports.default = router;
//# sourceMappingURL=followup.routes.js.map