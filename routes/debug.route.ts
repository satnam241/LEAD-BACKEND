import express, { Request, Response } from "express";
import dotenv from "dotenv";
import Lead from "../models/lead.model";

dotenv.config();
const router = express.Router();

router.get("/env-check", (req: Request, res: Response) => {
  const fbToken = process.env.FB_VERIFY_TOKEN;
  res.json({
    success: true,
    FB_VERIFY_TOKEN: fbToken ? fbToken : "❌ Not Loaded",
    note: "Compare this with your Facebook Verify Token — they must match exactly."
  });
});

router.get("/fix-old-data", async (req, res) => {
  try {
    const result = await Lead.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );

    res.json({
      success: true,
      message: "Migration done",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Migration failed" });
  }
});

export default router;
