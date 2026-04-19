"use strict";
// services/emailService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const googleapis_1 = require("googleapis");
const OAuth2 = googleapis_1.google.auth.OAuth2;
// Create OAuth client
const oauth2Client = new OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, "https://developers.google.com/oauthplayground");
// Set refresh token
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});
const sendEmail = async (to, subject, html, attachments) => {
    try {
        // Get access token dynamically
        const accessToken = await oauth2Client.getAccessToken();
        const transporter = nodemailer_1.default.createTransport({
            service: "gmail",
            auth: {
                type: "OAuth2",
                user: process.env.GOOGLE_USER,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
                accessToken: accessToken.token,
            },
        });
        const mailOptions = {
            from: process.env.GOOGLE_USER,
            to,
            subject,
            html,
            attachments,
        };
        const result = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent:", result);
        return result;
    }
    catch (error) {
        console.error("❌ Email error:", error);
        throw error;
    }
};
exports.sendEmail = sendEmail;
//# sourceMappingURL=emailService.js.map