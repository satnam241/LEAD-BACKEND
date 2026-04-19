import express from "express";
import {
  addActivity,
  getActivities,
  updateActivity,
  deleteActivity,
} from "../controllers/activity.controller";

const router = express.Router();

// Add new log
router.post("/", addActivity);

// Get all logs (with optional date filter)
router.get("/:userId", getActivities);

// Update specific activity
router.put("/:id", updateActivity);

// Delete specific activity
router.delete("/:id", deleteActivity);

export default router;
