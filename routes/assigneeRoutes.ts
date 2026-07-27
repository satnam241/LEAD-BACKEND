import { Router } from "express";
import { getAssignees, createAssignee, deleteAssignee } from "../controllers/assigneeController";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

router.get("/", adminAuth, getAssignees);
router.post("/", adminAuth, createAssignee);
router.delete("/:id", adminAuth, deleteAssignee);

export default router;