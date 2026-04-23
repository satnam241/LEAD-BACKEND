"use strict";
// import { Request, Response } from "express";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { Parser } from "json2csv";
// import nodemailer from "nodemailer";
// import Admin from "../models/admin.model";
// import Lead from "../models/lead.model";
// import ExcelJS from 'exceljs'
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingReminderCount = exports.markAsContacted = exports.getReminderLeads = exports.adminGetProfile = exports.importLeadsController = exports.adminSummaryStats = exports.adminDailyStats = exports.adminDeleteLead = exports.adminUpdateLead = exports.adminExportLeads = exports.adminGetLeads = exports.changePasswordLoggedIn = exports.forgotPassword = exports.adminLogin = exports.adminSignup = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const json2csv_1 = require("json2csv");
const nodemailer_1 = __importDefault(require("nodemailer"));
const admin_model_1 = __importDefault(require("../models/admin.model"));
const lead_model_1 = __importDefault(require("../models/lead.model"));
const exceljs_1 = __importDefault(require("exceljs"));
const xlsx_1 = __importDefault(require("xlsx"));
const getEmail = (row) => {
    const possibleKeys = [
        "email", "Email", "EMAIL", "email_address", "Email Address",
        "E-mail", "e-mail", "Mail", "mail", "contact_email", "Contact Email",
    ];
    for (const key of possibleKeys) {
        if (row[key] && row[key] !== "null" && row[key] !== "")
            return String(row[key]).trim();
    }
    return null;
};
const getPhone = (row) => {
    const possibleKeys = [
        "phone", "Phone", "PHONE", "mobile", "Mobile", "MOBILE",
        "contact", "Contact", "Phone Number", "Mobile Number", "Contact Number",
    ];
    for (const key of possibleKeys) {
        if (row[key] && row[key] !== "null" && row[key] !== "")
            return String(row[key]).trim();
    }
    return null;
};
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const FRONTEND_URL = process.env.FRONTEND_URL;
// ── Admin Signup ──────────────────────────────────────────────────────────────
const adminSignup = async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!name || name.trim().length === 0)
            return res.status(400).json({ success: false, error: "Name is required" });
        const existingAdmin = await admin_model_1.default.findOne();
        if (existingAdmin)
            return res.status(400).json({ success: false, error: "Admin already exists. Signup disabled." });
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const admin = new admin_model_1.default({ email, password: hashedPassword, name: name.trim() });
        await admin.save();
        res.status(201).json({ success: true, message: "Admin created successfully" });
    }
    catch (err) {
        console.error("Admin signup error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminSignup = adminSignup;
// ── Admin Login ───────────────────────────────────────────────────────────────
const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await admin_model_1.default.findOne({ email });
        if (!admin)
            return res.status(400).json({ success: false, error: "Invalid credentials" });
        const isMatch = await bcryptjs_1.default.compare(password, admin.password);
        if (!isMatch)
            return res.status(400).json({ success: false, error: "Invalid credentials" });
        const token = jsonwebtoken_1.default.sign({ id: admin._id, role: "admin" }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ success: true, token, admin: { id: admin._id, email: admin.email } });
    }
    catch (err) {
        console.error("Admin login error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminLogin = adminLogin;
// ── Forgot Password ───────────────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const admin = await admin_model_1.default.findOne({ email });
        if (!admin)
            return res.status(404).json({ success: false, error: "Admin not found" });
        const token = jsonwebtoken_1.default.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "15m" });
        const resetLink = `${FRONTEND_URL}/reset-password/${token}`;
        const transporter = nodemailer_1.default.createTransport({
            service: "gmail",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: admin.email,
            subject: "Password Reset",
            html: `<p>Click the link to reset your password (valid 15 mins):</p><a href="${resetLink}">${resetLink}</a>`,
        });
        res.json({ success: true, message: "Reset link sent to email" });
    }
    catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.forgotPassword = forgotPassword;
// ── Change Password (logged in) ───────────────────────────────────────────────
const changePasswordLoggedIn = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer "))
            return res.status(401).json({ success: false, error: "Unauthorized" });
        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ success: false, error: "Invalid token" });
        }
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ success: false, error: "Current and new password required" });
        const admin = await admin_model_1.default.findById(decoded.id);
        if (!admin)
            return res.status(404).json({ success: false, error: "Admin not found" });
        const isMatch = await bcryptjs_1.default.compare(currentPassword, admin.password);
        if (!isMatch)
            return res.status(400).json({ success: false, error: "Current password incorrect" });
        admin.password = await bcryptjs_1.default.hash(newPassword, 10);
        await admin.save();
        res.json({ success: true, message: "Password changed successfully" });
    }
    catch (err) {
        console.error("Change password error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.changePasswordLoggedIn = changePasswordLoggedIn;
// ── Get All Leads ─────────────────────────────────────────────────────────────
const adminGetLeads = async (req, res) => {
    try {
        const { page = "1", limit = "10", status, source, search, dateFrom, dateTo, } = req.query;
        const filter = { isDeleted: false };
        // ✅ FIX: Status filter — accept any case, store lowercase
        if (status)
            filter.status = status.toLowerCase();
        if (source)
            filter.source = source;
        if (search) {
            const q = search.trim();
            filter.$and = [
                { isDeleted: false },
                {
                    $or: [
                        { fullName: { $regex: q, $options: "i" } },
                        { phone: { $regex: q, $options: "i" } },
                        { email: { $regex: q, $options: "i" } },
                    ],
                },
            ];
        }
        if (dateFrom || dateTo) {
            filter.receivedAt = {};
            if (dateFrom)
                filter.receivedAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.receivedAt.$lte = end;
            }
        }
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, parseInt(limit));
        const skip = (pageNum - 1) * limitNum;
        const [leads, totalLeads] = await Promise.all([
            lead_model_1.default.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limitNum),
            lead_model_1.default.countDocuments(filter),
        ]);
        // Status counts (unfiltered — for stat cards)
        const statusAgg = await lead_model_1.default.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);
        const byStatus = {};
        statusAgg.forEach(({ _id, count }) => {
            if (_id)
                byStatus[_id] = count;
        });
        res.json({
            success: true,
            leads,
            totalLeads,
            // legacy fields (frontend purana code ke liye)
            newLeadsCount: byStatus["new"] ?? 0,
            contactedCount: byStatus["contacted"] ?? 0,
            convertedCount: byStatus["closed"] ?? 0,
            lostCount: byStatus["lost"] ?? 0,
            // 🆕 new statuses
            negotiationCount: byStatus["negotiation"] ?? 0,
            visitorCount: byStatus["visitor"] ?? 0,
            page: pageNum,
            totalPages: Math.ceil(totalLeads / limitNum),
        });
    }
    catch (err) {
        console.error("Get leads error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminGetLeads = adminGetLeads;
// ── Export Leads ──────────────────────────────────────────────────────────────
const adminExportLeads = async (req, res) => {
    try {
        const { format = "xlsx", status } = req.query;
        const filter = { isDeleted: false };
        if (status && status !== "all")
            filter.status = status.toLowerCase();
        const leads = await lead_model_1.default.find(filter).sort({ receivedAt: -1 });
        if (!leads.length)
            return res.status(404).json({ success: false, error: "No leads found" });
        const rows = leads.map((l) => ({
            "Full Name": l.fullName ?? "",
            "Email": l.email ?? "",
            "Phone": l.phone ?? "",
            "Source": l.source ?? "",
            "Status": l.status ?? "",
            "Budget": l.extraFields?.what_is_your_budget_
                ?? l.whatIsYourBudget ?? "",
            "Purchase Timeline": l.extraFields?.when_are_you_planning_to_purchase_
                ?? l.whenAreYouPlanningToPurchase ?? "",
            "Message": l.message ?? "",
            "Received At": l.receivedAt ? new Date(l.receivedAt).toLocaleString("en-IN") : "",
        }));
        const statusLabel = status && status !== "all"
            ? status.charAt(0).toUpperCase() + status.slice(1)
            : "All";
        const filename = `leads-${statusLabel.toLowerCase()}-${Date.now()}`;
        if (format === "xlsx") {
            const wb = new exceljs_1.default.Workbook();
            const ws = wb.addWorksheet(`${statusLabel} Leads`);
            const headers = Object.keys(rows[0]);
            ws.addRow(headers);
            const headerRow = ws.getRow(1);
            headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
            headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
            headerRow.alignment = { vertical: "middle", horizontal: "center" };
            headerRow.height = 20;
            rows.forEach((row, i) => {
                const r = ws.addRow(Object.values(row));
                r.fill = {
                    type: "pattern", pattern: "solid",
                    fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF1F5F9" },
                };
            });
            ws.columns.forEach((col) => {
                let max = 12;
                col.eachCell?.({ includeEmpty: true }, (cell) => {
                    const len = cell.value ? String(cell.value).length : 0;
                    if (len > max)
                        max = len;
                });
                col.width = Math.min(max + 4, 40);
            });
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
            await wb.xlsx.write(res);
            return res.end();
        }
        const parser = new json2csv_1.Parser({ fields: Object.keys(rows[0]) });
        const csv = parser.parse(rows);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
        return res.send(csv);
    }
    catch (err) {
        console.error("Export leads error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminExportLeads = adminExportLeads;
// ── Update Lead ───────────────────────────────────────────────────────────────
const adminUpdateLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ success: false, error: "Status is required" });
        // ✅ FIX: lowercase mein store karo
        const lead = await lead_model_1.default.findByIdAndUpdate(id, { status: status.toLowerCase() }, { new: true });
        if (!lead)
            return res.status(404).json({ success: false, error: "Lead not found" });
        res.json({ success: true, lead });
    }
    catch (err) {
        console.error("Update lead error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminUpdateLead = adminUpdateLead;
// ── Delete Lead ───────────────────────────────────────────────────────────────
const adminDeleteLead = async (req, res) => {
    try {
        const { id } = req.params;
        const lead = await lead_model_1.default.findByIdAndDelete(id);
        if (!lead)
            return res.status(404).json({ success: false, error: "Lead not found" });
        res.json({ success: true, message: "Lead deleted successfully" });
    }
    catch (err) {
        console.error("Delete lead error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminDeleteLead = adminDeleteLead;
// ── Daily Stats ───────────────────────────────────────────────────────────────
const adminDailyStats = async (_req, res) => {
    try {
        const stats = await lead_model_1.default.aggregate([
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
    }
    catch (err) {
        console.error("Daily stats error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminDailyStats = adminDailyStats;
// ── Summary Stats ─────────────────────────────────────────────────────────────
const adminSummaryStats = async (_req, res) => {
    try {
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
        const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));
        const [statusCounts, todayFollowups, overdueFollowups] = await Promise.all([
            lead_model_1.default.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            lead_model_1.default.countDocuments({
                isDeleted: false,
                "followUp.active": true,
                "followUp.date": { $gte: todayStart, $lte: todayEnd },
            }),
            lead_model_1.default.countDocuments({
                isDeleted: false,
                "followUp.active": true,
                "followUp.date": { $lt: todayStart },
                "followUp.overdueStatus": { $ne: "resolved" }, // ✅ resolved hide karo
            }),
        ]);
        // ✅ FIX: Sabhi statuses include karo — Negotiation + Visitor bhi
        const byStatus = {
            New: 0,
            Contacted: 0,
            Closed: 0,
            Lost: 0,
            Negotiation: 0, // 🆕
            Visitor: 0, // 🆕
        };
        let total = 0;
        statusCounts.forEach(({ _id, count }) => {
            if (!_id)
                return;
            // 'new' → 'New', 'negotiation' → 'Negotiation', 'visitor' → 'Visitor'
            const key = _id.charAt(0).toUpperCase() + _id.slice(1).toLowerCase();
            byStatus[key] = count;
            total += count;
        });
        res.json({
            success: true,
            total,
            byStatus,
            todayFollowups,
            overdueFollowups,
        });
    }
    catch (err) {
        console.error("Summary stats error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminSummaryStats = adminSummaryStats;
// ── Import Leads ──────────────────────────────────────────────────────────────
const importLeadsController = async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: "Please upload a file" });
        const filePath = req.file.path;
        const cleanUTF16 = (value) => {
            if (value == null)
                return null;
            if (typeof value !== "string")
                return value;
            let str = value.replace(/\u0000/g, "").replace(/^"|"$/g, "").trim();
            return str || null;
        };
        const workbook = xlsx_1.default.readFile(filePath, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx_1.default.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
        const cleanedData = data.map((row) => {
            const cleanedRow = {};
            for (const [key, val] of Object.entries(row))
                cleanedRow[key] = cleanUTF16(val);
            return cleanedRow;
        });
        for (const row of cleanedData) {
            await lead_model_1.default.create({
                fullName: row.fullName || row.name || row["Full Name"] || row["full_name"] || "Unknown User",
                email: getEmail(row),
                phone: getPhone(row),
                message: row.message || row.Message || null,
                whenAreYouPlanningToPurchase: row.whenAreYouPlanningToPurchase || row.PurchaseTime || null,
                whatIsYourBudget: row.whatIsYourBudget || row.Budget || null,
                source: "import",
                extraFields: row,
                rawData: row,
                receivedAt: new Date(),
            });
        }
        return res.json({
            message: "Leads imported successfully",
            total: cleanedData.length,
            sample: cleanedData[0],
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Import failed" });
    }
};
exports.importLeadsController = importLeadsController;
// ── Admin Profile ─────────────────────────────────────────────────────────────
const adminGetProfile = async (req, res) => {
    try {
        const admin = await admin_model_1.default.findOne().select("-password");
        if (!admin)
            return res.status(404).json({ success: false, error: "Admin not found" });
        res.json({ _id: admin._id, name: admin.name || "" });
    }
    catch (err) {
        console.error("Get admin profile error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.adminGetProfile = adminGetProfile;
// ── Reminder Leads ────────────────────────────────────────────────────────────
const getReminderLeads = async (req, res) => {
    try {
        const leads = await lead_model_1.default.find({
            reminderCount: { $gt: 0, $lte: 5 },
            status: { $ne: "closed" },
        }).sort({ lastReminderSent: -1 });
        return res.json({ success: true, leads });
    }
    catch (error) {
        console.error("Get reminder leads error:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getReminderLeads = getReminderLeads;
// ── Mark As Contacted ─────────────────────────────────────────────────────────
const markAsContacted = async (req, res) => {
    try {
        const { id } = req.params;
        await lead_model_1.default.findByIdAndUpdate(id, { status: "contacted", reminderCount: 0 });
        return res.json({ success: true, message: "Lead marked as contacted" });
    }
    catch (error) {
        console.error("Mark contacted error:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.markAsContacted = markAsContacted;
// ── Pending Reminder Count ────────────────────────────────────────────────────
const getPendingReminderCount = async (req, res) => {
    try {
        const count = await lead_model_1.default.countDocuments({
            status: { $ne: "closed" },
            reminderCount: { $gte: 1, $lte: 5 },
        });
        return res.json({ success: true, pendingReminders: count });
    }
    catch (error) {
        console.error("Pending reminder count error:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};
exports.getPendingReminderCount = getPendingReminderCount;
//# sourceMappingURL=admin.controller.js.map