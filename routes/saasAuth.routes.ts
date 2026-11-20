import express from "express";
import {
  saasSignup,
  saasVerifyPayment,
  saasLogin,
  saasRefreshToken,
  saasLogout,
  getMe,
} from "../controllers/saasAuth.controller";
import { adminAuth } from "../middleware/adminAuth";
import { authLimiter } from "../middleware/security.middleware";

const router = express.Router();

// ── SaaS Onboarding & Authentication Flow (Rate-Limited Brute Force Guard) ──
router.post("/signup", authLimiter, saasSignup);
router.post("/verify-payment", authLimiter, saasVerifyPayment);
router.post("/login", authLimiter, saasLogin);
router.post("/refresh-token", authLimiter, saasRefreshToken);
router.post("/logout", adminAuth, saasLogout);
router.get("/me", adminAuth, getMe);

export default router;
