"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
dotenv_1.default.config();
const router = express_1.default.Router();
router.get("/env-check", (req, res) => {
    const fbToken = process.env.FB_VERIFY_TOKEN;
    res.json({
        success: true,
        FB_VERIFY_TOKEN: fbToken ? fbToken : "❌ Not Loaded",
        note: "Compare this with your Facebook Verify Token — they must match exactly."
    });
});
router.get("/fix-old-data", async (req, res) => {
    try {
        const result = await lead_model_1.default.updateMany({ isDeleted: { $exists: false } }, { $set: { isDeleted: false } });
        res.json({
            success: true,
            message: "Migration done",
            modifiedCount: result.modifiedCount,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Migration failed" });
    }
});
exports.default = router;
//# sourceMappingURL=debug.route.js.map