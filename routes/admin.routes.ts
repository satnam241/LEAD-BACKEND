import { Router } from "express";
import {
  adminSignup,
  adminLogin,
  adminGetLeads,
  adminUpdateLead,
  adminDeleteLead,
  adminDailyStats,
} from "../controllers/admin.controller";

const router = Router();

// Auth
router.post("/signup", adminSignup); // only one-time
router.post("/login", adminLogin);

// Lead management
router.get("/leads", adminGetLeads);
router.put("/leads/:id", adminUpdateLead);
router.delete("/leads/:id", adminDeleteLead);


router.get("/stats/daily", adminDailyStats);

export default router;
