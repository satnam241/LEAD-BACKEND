import express from "express";
import { createLead } from "../controllers/leadController";

const router = express.Router();

// Manual Lead Entry (API)
router.post("/", createLead);

export default router;
