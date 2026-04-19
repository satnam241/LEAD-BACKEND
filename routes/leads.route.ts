import express from "express";
import {
  createLeadController,
  updateLeadController,
  deleteLeadController,
  getLeadsController,
  restoreLeadController,
  bulkDeleteLeadsController,
  bulkRestoreLeadsController 
} from "../controllers/leadController";

const router = express.Router();

router.post("/leads", createLeadController);
router.get("/leads", getLeadsController);
router.put("/leads/:id", updateLeadController);
router.delete("/leads/:id", deleteLeadController);
router.patch("/leads/bulk-delete", bulkDeleteLeadsController);
router.patch("/leads/:id/restore", restoreLeadController);
router.patch("/leads/bulk-restore", bulkRestoreLeadsController);

export default router;
