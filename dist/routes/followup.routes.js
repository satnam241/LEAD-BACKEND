"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const followup_controller_1 = require("../controllers/followup.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
// ✅ Lead specific follow-up
router.post("/leads/:id/follow-up", adminAuth_1.adminAuth, followup_controller_1.scheduleFollowUp);
router.delete("/leads/:id/follow-up", adminAuth_1.adminAuth, followup_controller_1.cancelFollowUp);
// ✅ Global follow-ups
router.get("/", adminAuth_1.adminAuth, followup_controller_1.listFollowUps); // /api/followup
router.get("/upcoming", adminAuth_1.adminAuth, followup_controller_1.getUpcomingFollowUps); // /api/followup/upcoming
router.get("/due", adminAuth_1.adminAuth, followup_controller_1.getDueFollowUps);
router.get("/overdue", adminAuth_1.adminAuth, followup_controller_1.getOverdueFollowUps);
exports.default = router;
//# sourceMappingURL=followup.routes.js.map