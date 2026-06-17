"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleCallback = exports.connectGoogle = void 0;
const google_1 = require("../config/google");
const admin_model_1 = __importDefault(require("../models/admin.model"));
// Connect Google
const connectGoogle = async (req, res) => {
    try {
        const url = google_1.oauth2Client.generateAuthUrl({
            access_type: "offline",
            //   prompt: "consent",
            scope: ["https://www.googleapis.com/auth/calendar"],
            include_granted_scopes: true
        });
        return res.redirect(url);
    }
    catch (err) {
        console.log("CONNECT ERROR:", err);
        return res.status(500).send("Google auth failed");
    }
};
exports.connectGoogle = connectGoogle;
// Callback
const googleCallback = async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) {
            return res.status(400).send("Authorization code missing");
        }
        const { tokens } = await google_1.oauth2Client.getToken(code);
        console.log("TOKENS:", tokens);
        // admin
        const admin = await admin_model_1.default.findOne();
        if (!admin) {
            return res.status(404).send("Admin not found");
        }
        // save
        admin.googleCalendar = {
            accessToken: tokens.access_token || admin.googleCalendar?.accessToken,
            refreshToken: tokens.refresh_token || admin.googleCalendar?.refreshToken,
            expiryDate: tokens.expiry_date || admin.googleCalendar?.expiryDate,
        };
        await admin.save();
        console.log("GOOGLE SAVED");
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    }
    catch (err) {
        console.log("GOOGLE ERROR:", err);
        return res.status(500).send("Google connect failed");
    }
};
exports.googleCallback = googleCallback;
//# sourceMappingURL=google.controller.js.map