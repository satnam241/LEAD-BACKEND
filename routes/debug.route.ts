import express, { Request, Response } from "express";
import Lead from "../models/lead.model";
import { adminAuth, superAdminOnly } from "../middleware/adminAuth";

const router = express.Router();

// 🔒 Strict Super Admin access only - no public access to debug tools
router.use(adminAuth, superAdminOnly);

router.get("/env-check", (_req: Request, res: Response) => {
  const fbToken = process.env.FB_VERIFY_TOKEN;
  res.json({
    success: true,
    isFbVerifyTokenLoaded: !!fbToken,
    tokenPreview: fbToken ? `${fbToken.slice(0, 3)}***${fbToken.slice(-3)}` : "❌ Not Loaded",
    note: "Token verified by Super Admin authenticated session."
  });
});

router.post("/fix-old-data", async (_req: Request, res: Response) => {
  try {
    const result = await Lead.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );

    res.json({
      success: true,
      message: "Database migration completed safely",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("[Debug Route Error]", err);
    res.status(500).json({ error: "Migration failed" });
  }
});

export default router;
