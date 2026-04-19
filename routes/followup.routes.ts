import { Router } from "express";
import {
  scheduleFollowUp,
  cancelFollowUp,
  listFollowUps,
  getUpcomingFollowUps,
  getDueFollowUps,
  getOverdueFollowUps
} from "../controllers/followup.controller";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// ✅ Lead specific follow-up
router.post("/leads/:id/follow-up", adminAuth, scheduleFollowUp);
router.delete("/leads/:id/follow-up", adminAuth, cancelFollowUp);

// ✅ Global follow-ups
router.get("/", adminAuth, listFollowUps); // /api/followup
router.get("/upcoming", adminAuth, getUpcomingFollowUps); // /api/followup/upcoming
router.get("/due", adminAuth, getDueFollowUps);
router.get("/overdue", adminAuth, getOverdueFollowUps);


export default router;