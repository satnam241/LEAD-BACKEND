// import express, { Request, Response } from "express";
// import fetch from "node-fetch";
// import Lead from "../models/lead.model";
// import { normalizePhone } from "../services/phone";

// const router = express.Router();

// // ✅ FB Webhook verification
// router.get("/", (req: Request, res: Response) => {
//   const mode = req.query["hub.mode"];
//   const token = req.query["hub.verify_token"];
//   const challenge = req.query["hub.challenge"];

//   if (mode === "subscribe" && token === process.env.FB_VERIFY_TOKEN) {
//     console.log("✅ Facebook Webhook verified");
//     return res.status(200).send(challenge);
//   }
//   return res.sendStatus(403);
// });

// // ✅ FB Lead webhook POST
// router.post("/", async (req: Request, res: Response) => {
//   try {
//     const entries = req.body.entry || [];

//     // Respond 200 immediately to FB
//     res.sendStatus(200);

//     for (const entry of entries) {
//       for (const change of entry.changes || []) {
//         if (change.field !== "leadgen") continue;

//         const leadgenId = change.value.leadgen_id;
//         const url = `https://graph.facebook.com/v23.0/${leadgenId}?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}&fields=field_data,created_time,ad_id,form_id`;

//         let leadData: any;
//         try {
//           const response = await fetch(url);
//           if (!response.ok) {
//             const txt = await response.text();
//             console.error("FB fetch failed:", response.status, txt);
//             continue;
//           }
//           leadData = await response.json();
//         } catch (err) {
//           console.error("FB fetch error:", err);
//           continue;
//         }

//         // Map FB fields
//         const fields: Record<string, any> = {};
//         for (const f of leadData.field_data || []) {
//           fields[f.name] = f.values?.[0] ?? "";
//         }

//         const fullName = fields.full_name || fields.name || "Unknown User";
//         const email = fields.email || null;
//         const rawPhone = fields.phone_number || fields.phone || null;
//         const phone = normalizePhone(rawPhone);
//         const phoneVerified = (fields.phone_number_verified === "true") || false;

//         // Deduplicate by phone first, then email
//         let existing = null;
//         if (phone) existing = await Lead.findOne({ phone });
//         if (!existing && email) existing = await Lead.findOne({ email });

//         if (existing) {
//           if (!existing.phone && phone) existing.phone = phone;
//           if (!existing.email && email) existing.email = email;
//           if (phoneVerified) existing.phoneVerified = true;
//           existing.whenAreYouPlanningToPurchase =
//             existing.whenAreYouPlanningToPurchase || fields.when_are_you_planning_to_purchase || null;
//           existing.whatIsYourBudget =
//             existing.whatIsYourBudget || fields.what_is_your_budget || null;
//           existing.rawData = leadData;
//           await existing.save();
//           console.log("Updated existing lead:", existing._id.toString());
//         } else {
//           await Lead.create({
//             fullName,
//             email,
//             phone,
//             phoneVerified,
//             whenAreYouPlanningToPurchase: fields.when_are_you_planning_to_purchase || null,
//             whatIsYourBudget: fields.what_is_your_budget || null,
//             source: "facebook",
//             rawData: leadData,
//           });
//           console.log("Saved new FB lead:", email || phone);
//         }
//       }
//     }
//   } catch (err) {
//     console.error("❌ FB webhook top-level error:", err);
//   }
// });

// export default router;

import express, { Request, Response } from "express";
import Lead from "../models/lead.model";
import { normalizePhone } from "../services/phone";
import fetchWithRetry from "../services/fetchWithRetry";
import { sendMessageToLead } from "../services/messageService";
import dotenv from "dotenv";

const router = express.Router();
dotenv.config();

// 🔹 ENV
const FB_VERSION = process.env.FB_GRAPH_VERSION || "v23.0";
const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

// 🔹 VERIFY WEBHOOK
router.get("/facebook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("📩 Verification:", { mode, token });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.status(403).send("❌ Verification failed");
});

// 🔥 POST WEBHOOK
router.post("/facebook", async (req: Request, res: Response) => {
  try {
    res.sendStatus(200);

    const entries = req.body?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        if (change?.field !== "leadgen") continue;

        const { leadgen_id, form_id } = change.value || {};
        if (!leadgen_id) continue;

        console.log("📥 New FB Lead:", leadgen_id);

        // ❌ Duplicate check
        const already = await Lead.findOne({ "rawData.id": leadgen_id });
        if (already) {
          console.log("↩️ Duplicate skipped");
          continue;
        }

        // 🔥 Fetch FB data
        const url = `https://graph.facebook.com/${FB_VERSION}/${leadgen_id}?access_token=${PAGE_TOKEN}`;

        let leadData: any;
        try {
          leadData = await fetchWithRetry(url, 3, 800);
        } catch (err: any) {
          console.error("❌ FB fetch failed:", err.message);
          continue;
        }

        if (!leadData?.field_data) continue;

        // 🔥 Convert fields
        const fields: Record<string, any> = {};
        for (const f of leadData.field_data) {
          const key = (f.name || "")
            .trim()
            .replace(/[^\w]/g, "_")
            .toLowerCase();

          fields[key] = f.values?.[0] ?? "";
        }

        // 🔥 MESSAGE EXTRACTION (MAIN FIX)
        const messageKeys = [
          "message",
          "description",
          "query",
          "requirement",
          "comment",
          "details",
        ];

        let message: string | null = null;

        for (const key of Object.keys(fields)) {
          const k = key.toLowerCase();

          if (messageKeys.some((m) => k.includes(m))) {
            message = fields[key];
            break;
          }
        }

        // 🔥 fallback
        if (!message) {
          const possible = Object.values(fields).find(
            (v) => typeof v === "string" && v.length > 10
          );
          message = possible || "No message provided";
        }

        // 🔥 Contact info
        const email = fields.email || null;
        const rawPhone = fields.phone_number || fields.phone || null;
        const phone = rawPhone ? normalizePhone(rawPhone) : null;

        // 🔁 Check existing
        let existingLead = null;
        if (phone) existingLead = await Lead.findOne({ phone });
        if (!existingLead && email)
          existingLead = await Lead.findOne({ email });

        if (existingLead) {
          // 🔁 UPDATE
          existingLead.extraFields = {
            ...existingLead.extraFields,
            ...fields,
          };

          existingLead.rawData = leadData;
          existingLead.source = "facebook";
          existingLead.formId = form_id || existingLead.formId;

          // ✅ IMPORTANT
          existingLead.message = message ?? undefined;

          if (!existingLead.phone && phone) existingLead.phone = phone;
          if (!existingLead.email && email) existingLead.email = email;

          await existingLead.save();

          console.log("♻️ Updated lead:", existingLead._id);
        } else {
          // 🆕 CREATE
          const newLead = await Lead.create({
            fullName: fields.full_name || fields.name || "Unknown",
            email,
            phone,
            phoneVerified:
              fields.phone_number_verified === "true",

            
            message,

            source: "facebook",
            formId: form_id,
            extraFields: fields,
            rawData: leadData,

            status: "new",
            receivedAt: new Date(),
          });

          console.log("🆕 New lead saved:", newLead._id);
        }
      }
    }
  } catch (err: any) {
    console.error("❌ Webhook error:", err.message);
  }
});

export default router;