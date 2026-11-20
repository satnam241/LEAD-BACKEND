import express from "express";
import {
  createLeadController,
  updateLeadController,
  deleteLeadController,
  getLeadsController,
  restoreLeadController,
  bulkDeleteLeadsController,
  bulkRestoreLeadsController,
} from "../controllers/leadController";
import { adminAuth } from "../middleware/adminAuth";

const router = express.Router();

// CRM Lead Management Routes (Protected by adminAuth)
router.post("/leads", adminAuth, createLeadController);
router.get("/leads", adminAuth, getLeadsController);
router.put("/leads/:id", adminAuth, updateLeadController);
router.delete("/leads/:id", adminAuth, deleteLeadController);
router.patch("/leads/bulk-delete", adminAuth, bulkDeleteLeadsController);
router.patch("/leads/:id/restore", adminAuth, restoreLeadController);
router.patch("/leads/bulk-restore", adminAuth, bulkRestoreLeadsController);

export default router;
