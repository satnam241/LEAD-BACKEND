// import { Request, Response } from "express";
// import Lead from "../models/lead.model";
// import { sendMessageToLead } from "../services/messageService";

// /**
//  * -----------------------------------------
//  * 🔍 Utility: Extract fields from any rawData
//  * -----------------------------------------
//  */
// function extractFields(rawData: any) {
//   const extracted: Record<string, any> = {
//     fullName: null,
//     email: null,
//     phone: null,
//     message: null,
//     source: "facebook",
//     extraFields: {},
//   };

//   if (!rawData) return extracted;

//   const messageKeys = [
//     "message",
//     "description",
//     "query",
//     "requirement",
//     "comment",
//     "details",
//     "note",
//     "feedback",
//   ];

//   // ✅ Case 1: FB field_data
//   if (Array.isArray(rawData.field_data)) {
//     for (const f of rawData.field_data) {
//       const key = (f.name || "").toLowerCase();
//       const val = f.values?.[0];

//       if (!val) continue;

//       if (key.includes("name")) extracted.fullName ||= val;
//       else if (key.includes("email")) extracted.email ||= val;
//       else if (key.includes("phone") || key.includes("mobile"))
//         extracted.phone ||= val;
//       else if (messageKeys.some((k) => key.includes(k)))
//         extracted.message ||= val;
//       else extracted.extraFields[key] = val;
//     }
//   }

//   // ✅ Case 2: direct object (IMPORTANT)
//   for (const [key, val] of Object.entries(rawData)) {
//     const k = key.toLowerCase();

//     if (!val) continue;

//     if (k.includes("name")) extracted.fullName ||= val;
//     else if (k.includes("email")) extracted.email ||= val;
//     else if (k.includes("phone")) extracted.phone ||= val;
//     else if (messageKeys.some((m) => k.includes(m)))
//       extracted.message ||= val;
//     else extracted.extraFields[k] = val;
//   }

//   // ✅ FINAL FALLBACK (VERY IMPORTANT)
//   if (!extracted.message) {
//     const possibleMessage = Object.values(rawData).find(
//       (v) => typeof v === "string" && v.length > 10
//     );

//     if (possibleMessage) extracted.message = possibleMessage;
//   }

//   return extracted;
// }

// /**
//  * -----------------------------------------
//  * 🟢 Create Lead (FB + Manual + Import)
//  * -----------------------------------------
//  */

// // export const createLeadController = async (req: Request, res: Response) => {
// //   try {
// //     const {
// //       fullName: bodyFullName,
// //       email: bodyEmail,
// //       phone: bodyPhone,
// //       phoneVerified,
// //       whenAreYouPlanningToPurchase,
// //       whatIsYourBudget,
// //       source: bodySource,
// //       rawData,
// //     } = req.body;

// //     const extracted = extractFields(rawData || {});
// //     const fullName = bodyFullName || extracted.fullName || "Unknown User";
// //     const email = bodyEmail || extracted.email || null;
// //     const phone = bodyPhone || extracted.phone || null;
// //     const message =
// //     req.body.message ||
// //     extracted.message ||
// //     rawData?.message ||
// //     Object.values(rawData || {}).find(
// //       (v) => typeof v === "string" && v.length > 10
// //     ) ||
// //     "No message provided";
// //      const source = bodySource || extracted.source || "import";

// //     if (!fullName && !email && !phone) {
// //       return res.status(400).json({
// //         error: "Lead must include at least one of: fullName, email, or phone.",
// //       });
// //     }

// //     // Check duplicate entry
// //     const existingLead = await Lead.findOne({
// //       $or: [{ email }, { phone }],
// //     });

// //     let lead;

// //     if (existingLead) {
// //       // Update existing lead
// //       lead = await Lead.findByIdAndUpdate(
// //         existingLead._id,
// //         {
// //           $set: {
// //             fullName,
// //             email,
// //             phone,
// //             phoneVerified: phoneVerified ?? existingLead.phoneVerified,
// //             whenAreYouPlanningToPurchase,
// //             whatIsYourBudget,
// //             message,
// //             source,
// //             rawData: {
// //               ...existingLead.rawData,
// //               ...rawData,
// //               extraFields: {
// //                 ...existingLead.rawData?.extraFields,
// //                 ...extracted.extraFields,
// //               },
// //             },
// //           },
// //         },
// //         { new: true }
// //       );
// //       if (lead && lead._id) {
// //         console.log("Updated:", String(lead._id));
// //       }
// //      } else {
// //       // Create new lead
// //       lead = new Lead({
// //         fullName,
// //         email,
// //         phone,
// //         phoneVerified: phoneVerified || false,
// //         whenAreYouPlanningToPurchase,
// //         whatIsYourBudget,
// //         message,
// //         source,
// //         rawData: {
// //           ...rawData,
// //           extractedMessage: message,
// //           extraFields: extracted.extraFields,
// //         },
// //       });

// //       await lead.save();
// //       if (lead && lead._id) {
// //         console.log("Updated:", String(lead._id));
// //       }
// //     }

// //     // Auto message send
// //     (async () => {
// //       try {
// //         if (lead?._id) {
// //           await sendMessageToLead({
// //             leadId: lead._id.toString(),
// //             messageType: "both",
// //           });
// //           if (lead && lead._id) {
// //             console.log("Updated:", String(lead._id));
// //           }
// //           }
// //       } catch (err) {
// //         console.error("⚠️ Auto message failed:", err);
// //       }
// //     })();

// //     res.status(201).json(lead);
// //   } catch (err) {
// //     console.error("💥 Error createLeadController:", err);
// //     res.status(500).json({ error: "Failed to create lead" });
// //   }
// // };

// export const createLeadController = async (req: Request, res: Response) => {
//   try {
//     const {
//       fullName: bodyFullName,
//       email: bodyEmail,
//       phone: bodyPhone,
//       phoneVerified,
//       whenAreYouPlanningToPurchase,
//       whatIsYourBudget,
//       source: bodySource,
//       rawData,
//       message: bodyMessage,
//     } = req.body;

//     const extracted = extractFields(rawData || {});

//     const fullName = bodyFullName || extracted.fullName || "Unknown User";
//     const email = bodyEmail || extracted.email || null;
//     const phone = bodyPhone || extracted.phone || null;

//     // ✅ STRONG MESSAGE FALLBACK
//     const message =
//       bodyMessage ||
//       extracted.message ||
//       rawData?.message ||
//       Object.values(rawData || {}).find(
//         (v) => typeof v === "string" && v.length > 10
//       ) ||
//       "No message provided";

//     const source = bodySource || extracted.source || "import";

//     if (!fullName && !email && !phone) {
//       return res.status(400).json({
//         error: "Lead must include at least one of: fullName, email, or phone.",
//       });
//     }

//     // ✅ ALWAYS CREATE NEW LEAD (NO DUPLICATE CHECK)
//     const lead = new Lead({
//       fullName,
//       email,
//       phone,
//       phoneVerified: phoneVerified || false,
//       whenAreYouPlanningToPurchase,
//       whatIsYourBudget,
//       message,
//       source,
//       rawData: {
//         ...rawData,
//         extractedMessage: message,
//         extraFields: extracted.extraFields,
//       },
//     });

//     await lead.save();

//     console.log("🆕 New Lead Created:", String(lead._id));

//     // ✅ AUTO MESSAGE (NON-BLOCKING)
//     (async () => {
//       try {
//         await sendMessageToLead({
//           leadId: (lead._id as any).toString(),
//           messageType: "both",
//         });

//         console.log("📩 Auto message sent:", String(lead._id));
//       } catch (err) {
//         console.error("⚠️ Auto message failed:", err);
//       }
//     })();

//     return res.status(201).json({
//       success: true,
//       data: lead,
//     });

//   } catch (err) {
//     console.error("💥 Error createLeadController:", err);
//     return res.status(500).json({
//       success: false,
//       error: "Failed to create lead",
//     });
//   }
// };
// /**
//  * -----------------------------------------
//  * 🟡 Update Lead
//  * -----------------------------------------
//  */
// export const updateLeadController = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const updates = req.body;

//     const existingLead = await Lead.findById(id);
//     if (!existingLead) {
//       return res.status(404).json({ error: "Lead not found" });
//     }

//     const updatedLead = await Lead.findByIdAndUpdate(
//       id,
//       {
//         $set: {
//           ...updates,
//           rawData: updates.rawData
//           ? {
//               ...existingLead.rawData,
//               ...updates.rawData,
//               extraFields: {
//                 ...existingLead.rawData?.extraFields,
//                 ...updates.rawData?.extraFields,
//               },
//             }
//           : existingLead.rawData,
        
//         },
//       },
//       { new: true }
//     );
//     if (updatedLead && (updatedLead as any)._id) {
//       console.log("✅ Lead updated:", String((updatedLead as any)._id));
//     } else {
//       console.log("✅ Lead updated: (no id available)");
//     }
    
//     res.status(200).json(updatedLead);
//   } catch (err) {
//     console.error("💥 Error updateLeadController:", err);
//     res.status(500).json({ error: "Failed to update lead" });
//   }
// };

// /**
//  * -----------------------------------------
//  * 🔴 Delete Lead
//  * -----------------------------------------
//  */
// export const deleteLeadController = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;

//     const lead = await Lead.findByIdAndUpdate(
//       id,
//       {
//         isDeleted: true,
//         deletedAt: new Date(),
//       },
//       { new: true }
//     );

//     if (!lead) {
//       return res.status(404).json({ error: "Lead not found" });
//     }

//     console.log("🗑️ Soft deleted lead:", String(lead._id));

//     return res.status(200).json({
//       success: true,
//       message: "Lead moved to trash",
//       data: {
//         id: lead._id,
//         deletedAt: lead.deletedAt,
//       },
//     });

//   } catch (err) {
//     console.error("💥 Error delete Lead:", err);
//     return res.status(500).json({
//       success: false,
//       error: "Failed to delete lead",
//     });
//   }
// };
// export const restoreLeadController = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;

//     const lead = await Lead.findByIdAndUpdate(
//       id,
//       {
//         isDeleted: false,
//         deletedAt: null,
//       },
//       { new: true }
//     );

//     if (!lead) {
//       return res.status(404).json({ error: "Lead not found" });
//     }

//     return res.json({
//       success: true,
//       message: "Lead restored successfully",
//       data: lead,
//     });

//   } catch (err) {
//     console.error("Restore error:", err);
//     return res.status(500).json({ error: "Failed to restore lead" });
//   }
// };
// export const bulkDeleteLeadsController = async (req: Request, res: Response) => {
//   try {
//     const { ids } = req.body;

//     // validation
//     if (!Array.isArray(ids) || ids.length === 0) {
//       return res.status(400).json({
//         success: false,
//         error: "ids array is required",
//       });
//     }

//     const result = await Lead.updateMany(
//       { _id: { $in: ids } },
//       {
//         isDeleted: true,
//         deletedAt: new Date(),
//       }
//     );

//     return res.json({
//       success: true,
//       message: "Leads moved to trash",
//       modifiedCount: result.modifiedCount,
//     });

//   } catch (err) {
//     console.error("💥 Bulk delete error:", err);
//     return res.status(500).json({
//       success: false,
//       error: "Bulk delete failed",
//     });
//   }
// };
// export const bulkRestoreLeadsController = async (req: Request, res: Response) => {
//   try {
//     const { ids } = req.body;

//     const result = await Lead.updateMany(
//       { _id: { $in: ids } },
//       {
//         isDeleted: false,
//         deletedAt: null,
//       }
//     );

//     return res.json({
//       success: true,
//       message: "Leads restored",
//       modifiedCount: result.modifiedCount,
//     });

//   } catch (err) {
//     console.error("Bulk restore error:", err);
//     return res.status(500).json({ error: "Failed to restore" });
//   }
// };
// export const getLeadsController = async (req: Request, res: Response) => {
//   try {
//     const { id, email, phone, source, followupFilter } = req.query;

//     // 1) Fetch Single Lead by ID
//     if (id) {
//       const lead = await Lead.findById(id).lean();
//       if (!lead) return res.status(404).json({ error: "Lead not found" });
//       return res.status(200).json(lead);
//     }

//     // 2) Base Filters
//     const filters: any = {};

//     if (email && email !== "null" && email !== "")
//       filters.email = String(email).trim().toLowerCase();

//     if (phone && phone !== "null" && phone !== "")
//       filters.phone = String(phone).trim();

//     if (source && source !== "null" && source !== "")
//       filters.source = source;

      
//       // base filters already written above...
      
//       // FOLLOW-UP FILTERS
//       if (followupFilter) {
//         const now = new Date();
      
//         if (followupFilter === "today") {
//           const start = new Date();
//           start.setHours(0, 0, 0, 0);
      
//           const end = new Date();
//           end.setHours(23, 59, 59, 999);
      
//           filters["followUp.date"] = { $gte: start, $lte: end };
//           filters["followUp.active"] = true;
//         }
      
//         if (followupFilter === "missed") {
//           filters["followUp.date"] = { $lt: now }; // already passed
//           filters["followUp.active"] = true;
//         }
      
//         if (followupFilter === "week") {
//           const start = new Date();
//           start.setDate(start.getDate() - start.getDay()); // start of week (Sunday)
      
//           const end = new Date();
//           end.setDate(end.getDate() + (6 - end.getDay())); // end of week (Saturday)
//           end.setHours(23, 59, 59, 999);
      
//           filters["followUp.date"] = { $gte: start, $lte: end };
//           filters["followUp.active"] = true;
//         }
      
//         if (followupFilter === "next24") {
//           const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
//           filters["followUp.date"] = { $gte: now, $lte: next24 };
//           filters["followUp.active"] = true;
//         }
//       }
      
    

//     // 4) Fetch Leads
//     const leads = await Lead.find(filters)
//       .sort({ createdAt: -1 })
//       .lean();

//     return res.status(200).json(leads);

//   } catch (err) {
//     console.error("💥 Error in getLeadsController:", err);
//     return res.status(500).json({ error: "Failed to fetch leads" });
//   }
// };

import { Request, Response } from "express";
import Lead from "../models/lead.model";
import { sendMessageToLead } from "../services/messageService";

function extractFields(rawData: any) {
  const extracted: Record<string, any> = {
    fullName: null, email: null, phone: null,
    message: null, source: "facebook", extraFields: {},
  };

  if (!rawData) return extracted;

  const messageKeys = ["message", "description", "query", "requirement", "comment", "details", "note", "feedback"];

  if (Array.isArray(rawData.field_data)) {
    for (const f of rawData.field_data) {
      const key = (f.name || "").toLowerCase();
      const val = f.values?.[0];
      if (!val) continue;
      if (key.includes("name"))                                   extracted.fullName ||= val;
      else if (key.includes("email"))                             extracted.email    ||= val;
      else if (key.includes("phone") || key.includes("mobile"))  extracted.phone    ||= val;
      else if (messageKeys.some((k) => key.includes(k)))         extracted.message  ||= val;
      else extracted.extraFields[key] = val;
    }
  }

  for (const [key, val] of Object.entries(rawData)) {
    const k = key.toLowerCase();
    if (!val) continue;
    if (k.includes("name"))                                   extracted.fullName ||= val;
    else if (k.includes("email"))                             extracted.email    ||= val;
    else if (k.includes("phone"))                             extracted.phone    ||= val;
    else if (messageKeys.some((m) => k.includes(m)))          extracted.message  ||= val;
    else extracted.extraFields[k] = val;
  }

  if (!extracted.message) {
    const possibleMessage = Object.values(rawData).find(
      (v) => typeof v === "string" && v.length > 10
    );
    if (possibleMessage) extracted.message = possibleMessage;
  }

  return extracted;
}

// ── Create Lead ───────────────────────────────────────────────────────────────
export const createLeadController = async (req: Request, res: Response) => {
  try {
    const {
      fullName: bodyFullName,
      email:    bodyEmail,
      phone:    bodyPhone,
      phoneVerified,
      whenAreYouPlanningToPurchase,
      whatIsYourBudget,
      source:   bodySource,
      rawData,
      message:  bodyMessage,
    } = req.body;

    const extracted = extractFields(rawData || {});
    const fullName  = bodyFullName || extracted.fullName || "Unknown User";
    const email     = bodyEmail    || extracted.email    || null;
    const phone     = bodyPhone    || extracted.phone    || null;

    const message =
      bodyMessage ||
      extracted.message ||
      rawData?.message ||
      Object.values(rawData || {}).find((v) => typeof v === "string" && v.length > 10) ||
      "No message provided";

    const source = bodySource || extracted.source || "import";

    if (!fullName && !email && !phone)
      return res.status(400).json({ error: "Lead must include at least one of: fullName, email, or phone." });

    const lead = new Lead({
      fullName, email, phone,
      phoneVerified: phoneVerified || false,
      whenAreYouPlanningToPurchase,
      whatIsYourBudget,
      message, source,
      rawData: {
        ...rawData,
        extractedMessage: message,
        extraFields: extracted.extraFields,
      },
    });

    await lead.save();
    console.log("🆕 New Lead Created:", String(lead._id));

    // Auto message (non-blocking)
    (async () => {
      try {
        await sendMessageToLead({ leadId: (lead._id as any).toString(), messageType: "both" });
        console.log("📩 Auto message sent:", String(lead._id));
      } catch (err) {
        console.error("⚠️ Auto message failed:", err);
      }
    })();

    return res.status(201).json({ success: true, data: lead });
  } catch (err) {
    console.error("💥 Error createLeadController:", err);
    return res.status(500).json({ success: false, error: "Failed to create lead" });
  }
};

// ── Update Lead ───────────────────────────────────────────────────────────────
export const updateLeadController = async (req: Request, res: Response) => {
  try {
    const { id }    = req.params;
    const updates   = { ...req.body };

    // ✅ FIX: Status always lowercase mein store karo
    // 'Negotiation' → 'negotiation', 'Visitor' → 'visitor'
    if (updates.status) {
      updates.status = updates.status.toLowerCase();
    }

    const existingLead = await Lead.findById(id);
    if (!existingLead) return res.status(404).json({ error: "Lead not found" });

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      {
        $set: {
          ...updates,
          rawData: updates.rawData
            ? {
                ...existingLead.rawData,
                ...updates.rawData,
                extraFields: {
                  ...existingLead.rawData?.extraFields,
                  ...updates.rawData?.extraFields,
                },
              }
            : existingLead.rawData,
        },
      },
      { new: true }
    );

    console.log("✅ Lead updated:", String((updatedLead as any)?._id));
    return res.status(200).json({ success: true, lead: updatedLead, data: updatedLead });
  } catch (err) {
    console.error("💥 Error updateLeadController:", err);
    return res.status(500).json({ error: "Failed to update lead" });
  }
};

// ── Delete Lead (soft) ────────────────────────────────────────────────────────
export const deleteLeadController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lead   = await Lead.findByIdAndUpdate(
      id, { isDeleted: true, deletedAt: new Date() }, { new: true }
    );
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    console.log("🗑️ Soft deleted lead:", String(lead._id));
    return res.status(200).json({ success: true, message: "Lead moved to trash", data: { id: lead._id, deletedAt: lead.deletedAt } });
  } catch (err) {
    console.error("💥 Error delete Lead:", err);
    return res.status(500).json({ success: false, error: "Failed to delete lead" });
  }
};

// ── Restore Lead ──────────────────────────────────────────────────────────────
export const restoreLeadController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lead   = await Lead.findByIdAndUpdate(
      id, { isDeleted: false, deletedAt: null }, { new: true }
    );
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    return res.json({ success: true, message: "Lead restored successfully", data: lead });
  } catch (err) {
    console.error("Restore error:", err);
    return res.status(500).json({ error: "Failed to restore lead" });
  }
};

// ── Bulk Delete ───────────────────────────────────────────────────────────────
export const bulkDeleteLeadsController = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, error: "ids array is required" });

    const result = await Lead.updateMany(
      { _id: { $in: ids } },
      { isDeleted: true, deletedAt: new Date() }
    );
    return res.json({ success: true, message: "Leads moved to trash", modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("💥 Bulk delete error:", err);
    return res.status(500).json({ success: false, error: "Bulk delete failed" });
  }
};

// ── Bulk Restore ──────────────────────────────────────────────────────────────
export const bulkRestoreLeadsController = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    const result  = await Lead.updateMany(
      { _id: { $in: ids } },
      { isDeleted: false, deletedAt: null }
    );
    return res.json({ success: true, message: "Leads restored", modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Bulk restore error:", err);
    return res.status(500).json({ error: "Failed to restore" });
  }
};

// ── Get Leads ─────────────────────────────────────────────────────────────────
export const getLeadsController = async (req: Request, res: Response) => {
  try {
    const { id, email, phone, source, followupFilter } = req.query;

    if (id) {
      const lead = await Lead.findById(id).lean();
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      return res.status(200).json(lead);
    }

    const filters: any = {};
    if (email  && email  !== "null" && email  !== "") filters.email  = String(email).trim().toLowerCase();
    if (phone  && phone  !== "null" && phone  !== "") filters.phone  = String(phone).trim();
    if (source && source !== "null" && source !== "") filters.source = source;

    if (followupFilter) {
      const now = new Date();

      if (followupFilter === "today") {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end   = new Date(); end.setHours(23, 59, 59, 999);
        filters["followUp.date"]   = { $gte: start, $lte: end };
        filters["followUp.active"] = true;
      }

      if (followupFilter === "missed") {
        filters["followUp.date"]   = { $lt: now };
        filters["followUp.active"] = true;
      }

      if (followupFilter === "week") {
        const start = new Date(); start.setDate(start.getDate() - start.getDay());
        const end   = new Date(); end.setDate(end.getDate() + (6 - end.getDay())); end.setHours(23, 59, 59, 999);
        filters["followUp.date"]   = { $gte: start, $lte: end };
        filters["followUp.active"] = true;
      }

      if (followupFilter === "next24") {
        const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        filters["followUp.date"]   = { $gte: now, $lte: next24 };
        filters["followUp.active"] = true;
      }
    }

    const leads = await Lead.find(filters).sort({ createdAt: -1 }).lean();
    return res.status(200).json(leads);
  } catch (err) {
    console.error("💥 Error in getLeadsController:", err);
    return res.status(500).json({ error: "Failed to fetch leads" });
  }
};