"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const saasAuth_controller_1 = require("../controllers/saasAuth.controller");
const adminAuth_1 = require("../middleware/adminAuth");
const security_middleware_1 = require("../middleware/security.middleware");
const router = express_1.default.Router();
// ── SaaS Onboarding & Authentication Flow (Rate-Limited Brute Force Guard) ──
router.post("/signup", security_middleware_1.authLimiter, saasAuth_controller_1.saasSignup);
router.post("/verify-payment", security_middleware_1.authLimiter, saasAuth_controller_1.saasVerifyPayment);
router.post("/login", security_middleware_1.authLimiter, saasAuth_controller_1.saasLogin);
router.post("/refresh-token", security_middleware_1.authLimiter, saasAuth_controller_1.saasRefreshToken);
router.post("/logout", adminAuth_1.adminAuth, saasAuth_controller_1.saasLogout);
router.get("/me", adminAuth_1.adminAuth, saasAuth_controller_1.getMe);
exports.default = router;
//# sourceMappingURL=saasAuth.routes.js.map