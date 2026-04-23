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
import { Router } from "express";
import {
  scheduleFollowUp,
  cancelFollowUp,
  listFollowUps,
  getUpcomingFollowUps,
  getDueFollowUps,
  getOverdueFollowUps,
  // 🆕 new actions
  acknowledgeFollowUp,
  resolveFollowUp,
  rescheduleFollowUp,
  getFollowUpStats,
} from "../controllers/followup.controller";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// ✅ Lead specific follow-up (same as before)
router.post("/leads/:id/follow-up",    adminAuth, scheduleFollowUp);
router.delete("/leads/:id/follow-up",  adminAuth, cancelFollowUp);

// ✅ Global follow-ups (same as before)
router.get("/",        adminAuth, listFollowUps);       // GET /api/followup
router.get("/upcoming", adminAuth, getUpcomingFollowUps); // GET /api/followup/upcoming
router.get("/due",      adminAuth, getDueFollowUps);      // GET /api/followup/due
router.get("/overdue",  adminAuth, getOverdueFollowUps);  // GET /api/followup/overdue

// 🆕 Stats
router.get("/stats",   adminAuth, getFollowUpStats);      // GET /api/followup/stats

// 🆕 Overdue actions (lead specific)
router.patch("/leads/:id/acknowledge", adminAuth, acknowledgeFollowUp); // "dekh liya"
router.patch("/leads/:id/resolve",     adminAuth, resolveFollowUp);     // "done"
router.patch("/leads/:id/reschedule",  adminAuth, rescheduleFollowUp);  // "kal ke liye"

export default router;