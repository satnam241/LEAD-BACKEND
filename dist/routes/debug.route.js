"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const adminAuth_1 = require("../middleware/adminAuth");
const router = express_1.default.Router();
// 🔒 Strict Super Admin access only - no public access to debug tools
router.use(adminAuth_1.adminAuth, adminAuth_1.superAdminOnly);
router.get("/env-check", (_req, res) => {
    const fbToken = process.env.FB_VERIFY_TOKEN;
    res.json({
        success: true,
        isFbVerifyTokenLoaded: !!fbToken,
        tokenPreview: fbToken ? `${fbToken.slice(0, 3)}***${fbToken.slice(-3)}` : "❌ Not Loaded",
        note: "Token verified by Super Admin authenticated session."
    });
});
router.post("/fix-old-data", async (_req, res) => {
    try {
        const result = await lead_model_1.default.updateMany({ isDeleted: { $exists: false } }, { $set: { isDeleted: false } });
        res.json({
            success: true,
            message: "Database migration completed safely",
            modifiedCount: result.modifiedCount,
        });
    }
    catch (err) {
        console.error("[Debug Route Error]", err);
        res.status(500).json({ error: "Migration failed" });
    }
});
exports.default = router;
//# sourceMappingURL=debug.route.js.map