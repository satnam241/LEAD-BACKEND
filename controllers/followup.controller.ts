import { Request, Response } from "express";
import Lead from "../models/lead.model";
//import FollowUpLog from "../models/followUpLog.model";

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

    // ✅ Validate
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

    // ✅ Update lead
    lead.followUp = {
      date: followDate,
      recurrence: recurrence || "once",
      message: message || null,
      whatsappOptIn: !!whatsappOptIn,
      active: true,
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
    };

    await lead.save();

    return res.json({
      success: true,
      message: "Follow-up cancelled",
    });

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

// ✅ Upcoming Follow-ups (FIXED DATE LOGIC)
export const getUpcomingFollowUps = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const { search, fromDate, toDate } = req.query;

    // 🔥 base filter
    const filter: any = {
      "followUp.active": true,
      "followUp.date": { $gte: now },
    };

    // 🔎 optional date range filter
    if (fromDate || toDate) {
      filter["followUp.date"] = {
        ...(fromDate && { $gte: new Date(fromDate as string) }),
        ...(toDate && { $lte: new Date(toDate as string) }),
      };
    }

    // 🔎 optional search (name / phone / email)
    if (search) {
      const regex = new RegExp(search as string, "i");
      filter.$or = [
        { fullName: regex },
        { phone: regex },
        { email: regex },
      ];
    }

    const leads = await Lead.find(filter)
      .select("fullName phone email followUp")
      .sort({ "followUp.date": 1 })
      .lean(); // 🔥 performance boost

    const validRecurrences = ["once", "tomorrow", "3days", "weekly"];

    // 🔥 sanitize + format response
    const data = leads.map((lead: any) => {
      let recurrence = lead.followUp?.recurrence;

      if (!validRecurrences.includes(recurrence)) {
        recurrence = "once";
      }

      return {
        ...lead,
        followUp: {
          ...lead.followUp,
          recurrence,
        },
      };
    });

    return res.json({
      success: true,
      count: data.length,
      data,
    });

  } catch (err) {
    console.error("Upcoming follow-ups error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

export const getDueFollowUps = async (_req: Request, res: Response) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const due = await Lead.find({
      "followUp.active": true,
      "followUp.date": {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .select("fullName phone email followUp")
      .sort({ "followUp.date": 1 });

    return res.json({ success: true, data: due });

  } catch (err) {
    console.error("Due follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
export const getOverdueFollowUps = async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const overdue = await Lead.find({
      "followUp.active": true,
      "followUp.date": { $lt: now },
    })
      .select("fullName phone email followUp")
      .sort({ "followUp.date": 1 });

    return res.json({ success: true, data: overdue });

  } catch (err) {
    console.error("Overdue follow-ups error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};