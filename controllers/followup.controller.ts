// import { Request, Response } from "express";
// import Lead from "../models/lead.model";
// //import FollowUpLog from "../models/followUpLog.model";

// // 🔥 Better recurrence handling
// const computeNextDate = (recurrence: string, from?: Date): Date => {
//   const base = from ? new Date(from) : new Date();

//   switch (recurrence) {
//     case "tomorrow":
//       base.setDate(base.getDate() + 1);
//       break;
//     case "3days":
//       base.setDate(base.getDate() + 3);
//       break;
//     case "weekly":
//       base.setDate(base.getDate() + 7);
//       break;
//     default:
//       break;
//   }

//   return base;
// };

// // ✅ Schedule Follow-up
// export const scheduleFollowUp = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const { recurrence, date, message, whatsappOptIn } = req.body;

//     const lead = await Lead.findById(id);
//     if (!lead) {
//       return res.status(404).json({ success: false, error: "Lead not found" });
//     }

//     // ✅ Validate
//     if (!date && !recurrence) {
//       return res.status(400).json({
//         success: false,
//         error: "Either date or recurrence is required",
//       });
//     }

//     let followDate: Date;

//     if (date) {
//       followDate = new Date(date);
//     } else {
//       followDate = computeNextDate(recurrence);
//     }

//     // ✅ Update lead
//     lead.followUp = {
//       date: followDate,
//       recurrence: recurrence || "once",
//       message: message || null,
//       whatsappOptIn: !!whatsappOptIn,
//       active: true,
//     };

//     await lead.save();

//     return res.json({
//       success: true,
//       message: "Follow-up scheduled successfully",
//       data: lead.followUp,
//     });

//   } catch (err) {
//     console.error("Schedule follow-up error:", err);
//     return res.status(500).json({ success: false, error: "Server error" });
//   }
// };

// // ✅ Cancel Follow-up
// export const cancelFollowUp = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;

//     const lead = await Lead.findById(id);
//     if (!lead) {
//       return res.status(404).json({ success: false, error: "Lead not found" });
//     }

//     lead.followUp = {
//       date: null,
//       recurrence: null,
//       message: null,
//       whatsappOptIn: false,
//       active: false,
//     };

//     await lead.save();

//     return res.json({
//       success: true,
//       message: "Follow-up cancelled",
//     });

//   } catch (err) {
//     console.error("Cancel follow-up error:", err);
//     return res.status(500).json({ success: false, error: "Server error" });
//   }
// };

// // ✅ List All Active Follow-ups
// export const listFollowUps = async (_req: Request, res: Response) => {
//   try {
//     const followUps = await Lead.find({
//       "followUp.active": true,
//       "followUp.date": { $ne: null },
//     })
//       .select("fullName phone email followUp")
//       .sort({ "followUp.date": 1 });

//     return res.json({ success: true, data: followUps });

//   } catch (err) {
//     console.error("List follow-ups error:", err);
//     return res.status(500).json({ success: false, error: "Server error" });
//   }
// };

// // ✅ Upcoming Follow-ups (FIXED DATE LOGIC)
// export const getUpcomingFollowUps = async (req: Request, res: Response) => {
//   try {
//     const now = new Date();

//     const { search, fromDate, toDate } = req.query;

//     // 🔥 base filter
//     const filter: any = {
//       "followUp.active": true,
//       "followUp.date": { $gte: now },
//     };

//     // 🔎 optional date range filter
//     if (fromDate || toDate) {
//       filter["followUp.date"] = {
//         ...(fromDate && { $gte: new Date(fromDate as string) }),
//         ...(toDate && { $lte: new Date(toDate as string) }),
//       };
//     }

//     // 🔎 optional search (name / phone / email)
//     if (search) {
//       const regex = new RegExp(search as string, "i");
//       filter.$or = [
//         { fullName: regex },
//         { phone: regex },
//         { email: regex },
//       ];
//     }

//     const leads = await Lead.find(filter)
//       .select("fullName phone email followUp")
//       .sort({ "followUp.date": 1 })
//       .lean(); // 🔥 performance boost

//     const validRecurrences = ["once", "tomorrow", "3days", "weekly"];

//     // 🔥 sanitize + format response
//     const data = leads.map((lead: any) => {
//       let recurrence = lead.followUp?.recurrence;

//       if (!validRecurrences.includes(recurrence)) {
//         recurrence = "once";
//       }

//       return {
//         ...lead,
//         followUp: {
//           ...lead.followUp,
//           recurrence,
//         },
//       };
//     });

//     return res.json({
//       success: true,
//       count: data.length,
//       data,
//     });

//   } catch (err) {
//     console.error("Upcoming follow-ups error:", err);
//     return res.status(500).json({
//       success: false,
//       error: "Server error",
//     });
//   }
// };

// export const getDueFollowUps = async (_req: Request, res: Response) => {
//   try {
//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0);

//     const endOfDay = new Date();
//     endOfDay.setHours(23, 59, 59, 999);

//     const due = await Lead.find({
//       "followUp.active": true,
//       "followUp.date": {
//         $gte: startOfDay,
//         $lte: endOfDay,
//       },
//     })
//       .select("fullName phone email followUp")
//       .sort({ "followUp.date": 1 });

//     return res.json({ success: true, data: due });

//   } catch (err) {
//     console.error("Due follow-ups error:", err);
//     return res.status(500).json({ success: false, error: "Server error" });
//   }
// };
// export const getOverdueFollowUps = async (_req: Request, res: Response) => {
//   try {
//     const now = new Date();

//     const overdue = await Lead.find({
//       "followUp.active": true,
//       "followUp.date": { $lt: now },
//     })
//       .select("fullName phone email followUp")
//       .sort({ "followUp.date": 1 });

//     return res.json({ success: true, data: overdue });

//   } catch (err) {
//     console.error("Overdue follow-ups error:", err);
//     return res.status(500).json({ success: false, error: "Server error" });
//   }
// };

import { Request, Response } from "express";
import Lead from "../models/lead.model";
import FollowUpLog from "../models/followupLog.model";
import mongoose from "mongoose";

// 🔥 Better recurrence handling
const computeNextDate = (recurrence: string, from?: Date): Date => {
  const base = from ? new Date(from) : new Date();

  switch (recurrence) {
    case "tomorrow":
      base.setDate(base.getDate() + 1);
      break;
    case "3days":
      base.setDate(base.getDate() + 3);
      break;
    case "weekly":
      base.setDate(base.getDate() + 7);
      break;
    default:
      break;
  }

  return base;
};

// ✅ Schedule Follow-up
export const scheduleFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recurrence, date, message, whatsappOptIn } = req.body;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    if (!date && !recurrence) {
      return res.status(400).json({
        success: false,
        error: "Either date or recurrence is required",
      });
    }

    let followDate: Date;
    if (date) {
      followDate = new Date(date);
    } else {
      followDate = computeNextDate(recurrence);
    }

    lead.followUp = {
      date: followDate,
      recurrence: recurrence || "once",
      message: message || null,
      whatsappOptIn: !!whatsappOptIn,
      active: true,
      // 🆕 reset overdue tracking on reschedule
      overdueStatus: "pending",
      acknowledgedAt: null,
      rescheduledAt: null,
      resolvedAt: null,
    };

    await lead.save();

    return res.json({
      success: true,
      message: "Follow-up scheduled successfully",
      data: lead.followUp,
    });
  } catch (err) {
    console.error("Schedule follow-up error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Cancel Follow-up
export const cancelFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" });
    }

    lead.followUp = {
      date: null,
      recurrence: null,
      message: null,
      whatsappOptIn: false,
      active: false,
      overdueStatus: "pending",
      acknowledgedAt: null,
      rescheduledAt: null,
      resolvedAt: null,
    };

    await lead.save();

    return res.json({ success: true, message: "Follow-up cancelled" });
  } catch (err) {
    console.error("Cancel follow-up error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ List All Active Follow-ups
export const listFollowUps = async (_req: Request, res: Response) => {
  try {
    const followUps = await Lead.find({
      "followUp.active": true,
      "followUp.date": { $ne: null },
    })
      .select("fullName phone email followUp")
      .sort({ "followUp.date": 1 });

    return res.json({ success: true, data: followUps });
  } catch (err) {
    console.error("List follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Upcoming Follow-ups
export const getUpcomingFollowUps = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const { search, fromDate, toDate } = req.query;

    const filter: any = {
      "followUp.active": true,
      "followUp.date": { $gte: now },
    };

    if (fromDate || toDate) {
      filter["followUp.date"] = {
        ...(fromDate && { $gte: new Date(fromDate as string) }),
        ...(toDate && { $lte: new Date(toDate as string) }),
      };
    }

    if (search) {
      const regex = new RegExp(search as string, "i");
      filter.$or = [{ fullName: regex }, { phone: regex }, { email: regex }];
    }

    const leads = await Lead.find(filter)
      .select("fullName phone email followUp")
      .sort({ "followUp.date": 1 })
      .lean();

    const validRecurrences = ["once", "tomorrow", "3days", "weekly"];

    const data = leads.map((lead: any) => {
      let recurrence = lead.followUp?.recurrence;
      if (!validRecurrences.includes(recurrence)) recurrence = "once";
      return { ...lead, followUp: { ...lead.followUp, recurrence } };
    });

    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("Upcoming follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Due Today Follow-ups
export const getDueFollowUps = async (_req: Request, res: Response) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const due = await Lead.find({
      "followUp.active": true,
      "followUp.date": { $gte: startOfDay, $lte: endOfDay },
    })
      .select("fullName phone email followUp")
      .sort({ "followUp.date": 1 });

    return res.json({ success: true, data: due });
  } catch (err) {
    console.error("Due follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Overdue Follow-ups — enhanced (delete nahi, status track karo)
export const getOverdueFollowUps = async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const overdue = await Lead.find({
     
      "followUp.date": { $lt: now },
      "followUp.overdueStatus": { $ne: "resolved" }, // resolved wale hide karo
    })
      .select("fullName phone email followUp status createdAt")
      .sort({ "followUp.date": 1 });

    // Kitne time se overdue hai — human readable label
    const data = overdue.map((lead) => {
      const overdueMs =
        now.getTime() - new Date(lead.followUp!.date!).getTime();
      const mins  = Math.floor(overdueMs / 60000);
      const hours = Math.floor(mins / 60);
      const days  = Math.floor(hours / 24);

      const overdueLabel =
        days > 0  ? `${days}d overdue` :
        hours > 0 ? `${hours}h overdue` :
                    `${mins}m overdue`;

      return {
        _id:          lead._id,
        fullName:     lead.fullName,
        phone:        lead.phone,
        email:        lead.email,
        status:       lead.status,
        followUp:     lead.followUp,
        overdueLabel,
        overdueMs,
      };
    });

    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("Overdue follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Acknowledge — "dekh liya"
export const acknowledgeFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByIdAndUpdate(
      id,
      {
        $set: {
          "followUp.overdueStatus":  "acknowledged",
          "followUp.acknowledgedAt": new Date(),
        },
      },
      { new: true }
    );

    if (!lead)
      return res.status(404).json({ success: false, error: "Lead not found" });

    return res.json({ success: true, message: "Acknowledged", data: lead.followUp });
  } catch (err) {
    console.error("Acknowledge error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Resolve — follow-up complete, FollowUpLog mein entry
export const resolveFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note, type = "whatsapp" } = req.body;

    const lead = await Lead.findById(id);
    if (!lead)
      return res.status(404).json({ success: false, error: "Lead not found" });

    // Deactivate + mark resolved
    await Lead.findByIdAndUpdate(id, {
      $set: {
        "followUp.active":        false,
        "followUp.overdueStatus": "resolved",
        "followUp.resolvedAt":    new Date(),
      },
    });
    const rawId = req.params.id;
    const leadId = Array.isArray(rawId) ? rawId[0] : rawId;
    
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }
    // Log banao
    await FollowUpLog.create({
      leadId:      new mongoose.Types.ObjectId(leadId),
      message:     note || lead.followUp?.message || "Follow-up completed",
      type,
      status:      "sent",
      scheduledAt: lead.followUp?.date,
      sentAt:      new Date(),
    });

    return res.json({ success: true, message: "Follow-up resolved and logged" });
  } catch (err) {
    console.error("Resolve error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Reschedule — kal ke liye ya custom date
export const rescheduleFollowUp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newDate } = req.body;

    // Default: kal 10 baje
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const scheduledDate = newDate ? new Date(newDate) : tomorrow;

    const lead = await Lead.findByIdAndUpdate(
      id,
      {
        $set: {
          "followUp.date":          scheduledDate,
          "followUp.active":        true,
          "followUp.overdueStatus": "rescheduled",
          "followUp.rescheduledAt": new Date(),
        },
      },
      { new: true }
    );

    if (!lead)
      return res.status(404).json({ success: false, error: "Lead not found" });

    return res.json({
      success: true,
      message: `Rescheduled to ${scheduledDate.toLocaleDateString("en-IN")}`,
      data: lead.followUp,
    });
  } catch (err) {
    console.error("Reschedule error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ✅ Stats — dashboard counts
export const getFollowUpStats = async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const [overdue, upcoming, resolved] = await Promise.all([
      Lead.countDocuments({
        "followUp.active": true,
        "followUp.date":   { $lt: now },
        "followUp.overdueStatus": { $ne: "resolved" },
      }),
      Lead.countDocuments({
        "followUp.active": true,
        "followUp.date":   { $gte: now },
      }),
      Lead.countDocuments({
        "followUp.overdueStatus": "resolved",
      }),
    ]);

    return res.json({ success: true, data: { overdue, upcoming, resolved } });
  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};