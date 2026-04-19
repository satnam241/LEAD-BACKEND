import express from "express";
<<<<<<< HEAD
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
=======
import { createLead } from "../controllers/leadController";

const router = express.Router();

// Manual Lead Entry (API)
router.post("/", createLead);
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c

export default router;
