import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Parser } from "json2csv";
import Admin from "../models/admin.model";
import Lead from "../models/lead.model";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";


export const adminSignup = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    
    const existingAdmin = await Admin.findOne();
    if (existingAdmin) {
      return res
        .status(400)
        .json({ success: false, error: "Admin already exists. Signup disabled." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save admin
    const admin = new Admin({ email, password: hashedPassword });
    await admin.save();

    res.status(201).json({ success: true, message: "Admin created successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};


export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch)
      return res.status(400).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id, role: "admin" }, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ success: true, token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};


export const adminGetLeads = async (_req: Request, res: Response) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json({ success: true, leads });
  } catch (err) {
    console.error("Get leads error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};


export const adminUpdateLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const lead = await Lead.findByIdAndUpdate(id, { status }, { new: true });
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

    res.json({ success: true, lead });
  } catch (err) {
    console.error("Update lead error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};


export const adminDeleteLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByIdAndDelete(id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

    res.json({ success: true, message: "Lead deleted successfully" });
  } catch (err) {
    console.error("Delete lead error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

export const adminDailyStats = async (_req: Request, res: Response) => {
  try {
    const stats = await Lead.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
    ]);
    res.json({ success: true, stats });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};


export const adminExportLeads = async (_req: Request, res: Response) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, error: "No leads found" });
    }

    // Fields for CSV
    const fields = ["name", "email", "phone", "status", "message", "createdAt"];
    const opts = { fields };

    const parser = new Parser(opts);
    const csv = parser.parse(leads);

    // Set headers for CSV download
    res.header("Content-Type", "text/csv");
    res.attachment("leads-export.csv");
    return res.send(csv);
  } catch (err) {
    console.error("Export leads error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
