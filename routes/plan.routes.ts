import express from "express";
import {
  getPublicPlans,
  getPlanDetails,
  getAllPlansAdmin,
  createPlan,
  updatePlan,
  togglePlanStatus,
  deletePlan,
} from "../controllers/plan.controller";
import { adminAuth, superAdminOnly } from "../middleware/adminAuth";

const router = express.Router();

// ── Public Routes (Landing Page) ──
router.get("/public", getPublicPlans);
router.get("/public/:idOrSlug", getPlanDetails);

// ── Super Admin Management Routes ──
router.get("/", adminAuth, superAdminOnly, getAllPlansAdmin);
router.post("/", adminAuth, superAdminOnly, createPlan);
router.put("/:id", adminAuth, superAdminOnly, updatePlan);
router.patch("/:id/toggle", adminAuth, superAdminOnly, togglePlanStatus);
router.delete("/:id", adminAuth, superAdminOnly, deletePlan);

export default router;
