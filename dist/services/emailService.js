"use strict";
// services/emailService.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
exports.getSupportEmails = getSupportEmails;
exports.sendSupportAlert = sendSupportAlert;
const nodemailer_1 = __importDefault(require("nodemailer"));
const googleapis_1 = require("googleapis");
const dns_1 = __importDefault(require("dns"));
dns_1.default.setServers(["8.8.8.8", "8.8.4.4"]);
const OAuth2 = googleapis_1.google.auth.OAuth2;
// Create OAuth client
const oauth2Client = new OAuth2(process.env.EMAIL_GOOGLE_CLIENT_ID, process.env.EMAIL_GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
// Set refresh token
if (process.env.EMAIL_GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
        refresh_token: process.env.EMAIL_GOOGLE_REFRESH_TOKEN,
    });
}
const sendEmail = async (to, subject, html, attachments) => {
    try {
        let transporter = null;
        const emailUser = process.env.EMAIL_GOOGLE_USER || process.env.EMAIL_USER;
        const fallbackPass = process.env.EMAIL_PASS ||
            process.env.EMAIL_PASSWORD ||
            process.env.GMAIL_APP_PASSWORD ||
            process.env.SMTP_PASS;
        // 1. Try OAuth2 if configured
        if (process.env.EMAIL_GOOGLE_CLIENT_ID &&
            process.env.EMAIL_GOOGLE_REFRESH_TOKEN &&
            emailUser) {
            try {
                const accessToken = await oauth2Client.getAccessToken();
                transporter = nodemailer_1.default.createTransport({
                    service: "gmail",
                    auth: {
                        type: "OAuth2",
                        user: emailUser,
                        clientId: process.env.EMAIL_GOOGLE_CLIENT_ID,
                        clientSecret: process.env.EMAIL_GOOGLE_CLIENT_SECRET,
                        refreshToken: process.env.EMAIL_GOOGLE_REFRESH_TOKEN,
                        accessToken: accessToken?.token || undefined,
                    },
                });
            }
            catch (oauthErr) {
                console.warn("⚠️ Gmail OAuth failed:", oauthErr?.message || oauthErr);
                // Fall through to check fallback password
            }
        }
        // 2. Fallback to standard SMTP / Gmail App Password if OAuth2 is not configured or failed
        if (!transporter && emailUser && fallbackPass) {
            console.log("ℹ️ Using standard SMTP / App Password authentication for email.");
            transporter = nodemailer_1.default.createTransport({
                service: "gmail",
                auth: {
                    user: emailUser,
                    pass: fallbackPass,
                },
            });
        }
        if (!transporter) {
            throw new Error("No working email credentials configured. Please set Gmail OAuth credentials or EMAIL_PASS / GMAIL_APP_PASSWORD in .env.");
        }
        const mailOptions = {
            from: emailUser,
            to,
            subject,
            html,
            attachments,
        };
        const result = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent successfully to:", to);
        return result;
    }
    catch (error) {
        console.error("❌ Email error:", error);
        throw error;
    }
};
exports.sendEmail = sendEmail;
/**
 * Returns all configured support emails (SUPPORT_EMAIL and SUPPORT_EMAIL1)
 */
function getSupportEmails() {
    const emails = new Set();
    if (process.env.SUPPORT_EMAIL && process.env.SUPPORT_EMAIL.trim()) {
        emails.add(process.env.SUPPORT_EMAIL.trim());
    }
    if (process.env.SUPPORT_EMAIL1 && process.env.SUPPORT_EMAIL1.trim()) {
        emails.add(process.env.SUPPORT_EMAIL1.trim());
    }
    return [...emails];
}
/**
 * Dispatches instant notifications to SUPPORT_EMAIL, SUPPORT_EMAIL1, and active Admin
 * Includes one-click access to frontend portal via FRONTEND_URL1
 */
async function sendSupportAlert(options) {
    try {
        const recipients = getSupportEmails();
        try {
            const Admin = (await Promise.resolve().then(() => __importStar(require("../models/admin.model")))).default;
            const admin = await Admin.findOne().select('email').lean();
            if (admin?.email)
                recipients.push(admin.email);
        }
        catch { }
        const uniqueRecipients = [...new Set(recipients.filter(Boolean))];
        if (uniqueRecipients.length === 0) {
            console.warn("⚠️ No support emails or admin emails configured for support alert");
            return;
        }
        const frontendBaseUrl = process.env.FRONTEND_URL1 || process.env.FRONTEND_URL || "http://localhost:3000";
        const leadUrl = options.lead?._id
            ? `${frontendBaseUrl.replace(/\/$/, '')}/leads?leadId=${options.lead._id}`
            : frontendBaseUrl;
        const detailRows = options.details
            ? Object.entries(options.details)
                .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9">${k}</td><td style="padding:6px 12px;color:#1e293b;border-bottom:1px solid #f1f5f9">${v}</td></tr>`)
                .join('')
            : '';
        const html = `
      <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff">
        <div style="background:linear-gradient(135deg, #1e3a8a, #2563eb);padding:24px;color:#ffffff">
          <div style="display:inline-block;background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">
            ${options.badge || '🔔 Real Estate CRM Alert'}
          </div>
          <h2 style="margin:12px 0 4px;font-size:20px;font-weight:700">${options.title}</h2>
          <p style="margin:0;opacity:0.9;font-size:13px">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })}</p>
        </div>
        <div style="padding:24px">
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">
            <tr>
              <td style="padding:6px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9;width:35%">Lead Name</td>
              <td style="padding:6px 12px;color:#0f172a;font-weight:700;border-bottom:1px solid #f1f5f9">${options.lead?.fullName || 'Prospective Buyer'}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9">Phone / WhatsApp</td>
              <td style="padding:6px 12px;color:#1e293b;border-bottom:1px solid #f1f5f9">
                <a href="https://wa.me/${(options.lead?.phone || '').replace(/\D/g, '')}" style="color:#2563eb;text-decoration:none;font-weight:600">
                  📱 ${options.lead?.phone || 'Not available'}
                </a>
              </td>
            </tr>
            ${options.lead?.email ? `<tr><td style="padding:6px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9">Email</td><td style="padding:6px 12px;color:#1e293b;border-bottom:1px solid #f1f5f9">${options.lead.email}</td></tr>` : ''}
            ${options.project?.name ? `<tr><td style="padding:6px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9">Project / Property</td><td style="padding:6px 12px;color:#059669;font-weight:700;border-bottom:1px solid #f1f5f9">🏡 ${options.project.name}</td></tr>` : ''}
            ${detailRows}
          </table>
          <div style="text-align:center;margin:24px 0 10px">
            <a href="${leadUrl}" style="background:#2563eb;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;font-size:14px">
              ${options.ctaText || 'Open Lead in CRM →'}
            </a>
          </div>
        </div>
        <div style="background:#f8fafc;padding:12px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center">
          Automated real-time notification sent to support channels: ${uniqueRecipients.join(', ')}
        </div>
      </div>
    `;
        await Promise.all(uniqueRecipients.map((to) => (0, exports.sendEmail)(to, options.subject, html).catch((e) => console.error(`Failed to send support alert to ${to}:`, e.message || e))));
        console.log(`✅ Support alert email dispatched to [${uniqueRecipients.join(', ')}] for: "${options.title}"`);
    }
    catch (err) {
        console.error("❌ Error in sendSupportAlert:", err.message || err);
    }
}
//# sourceMappingURL=emailService.js.map