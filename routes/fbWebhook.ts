import express, { Request, Response } from "express";
import { createLead } from "../controllers/leadController";

const router = express.Router();

router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.FB_VERIFY_TOKEN) {
    console.log("✅ FB Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Facebook webhook data receiver
router.post("/", async (req: Request, res: Response) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0]?.value?.leads;

    if (changes && changes.length > 0) {
      for (const lead of changes) {
        const { full_name, email, phone_number } = lead;

        await createLead(
          { body: { fullName: full_name, email, phone: phone_number, source: "facebook" } } as Request,
          res
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("FB webhook error:", err);
    res.sendStatus(500);
  }
});

export default router;



//1897856220783095|_sZOUlTwN9kzt10naXhD9_XQH4E