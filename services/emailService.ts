// services/emailService.ts

import nodemailer from "nodemailer";
import { google } from "googleapis";
import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const OAuth2 = google.auth.OAuth2;

// Create OAuth client
const oauth2Client = new OAuth2(
  process.env.EMAIL_GOOGLE_CLIENT_ID,
  process.env.EMAIL_GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

// Set refresh token
if (process.env.EMAIL_GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.EMAIL_GOOGLE_REFRESH_TOKEN,
  });
}

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments?: Array<{
    filename: string;
    path: string;
    contentType?: string;
  }>
) => {
  try {
    let transporter: nodemailer.Transporter | null = null;
    const emailUser = process.env.EMAIL_GOOGLE_USER || process.env.EMAIL_USER;
    const fallbackPass =
      process.env.EMAIL_PASS ||
      process.env.EMAIL_PASSWORD ||
      process.env.GMAIL_APP_PASSWORD ||
      process.env.SMTP_PASS;

    // 1. Try OAuth2 if configured
    if (
      process.env.EMAIL_GOOGLE_CLIENT_ID &&
      process.env.EMAIL_GOOGLE_REFRESH_TOKEN &&
      emailUser
    ) {
      try {
        const accessToken = await oauth2Client.getAccessToken();
        transporter = nodemailer.createTransport({
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
      } catch (oauthErr: any) {
        console.warn("⚠️ Gmail OAuth failed:", oauthErr?.message || oauthErr);
        // Fall through to check fallback password
      }
    }

    // 2. Fallback to standard SMTP / Gmail App Password if OAuth2 is not configured or failed
    if (!transporter && emailUser && fallbackPass) {
      console.log("ℹ️ Using standard SMTP / App Password authentication for email.");
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: emailUser,
          pass: fallbackPass,
        },
      });
    }

    if (!transporter) {
      throw new Error(
        "No working email credentials configured. Please set Gmail OAuth credentials or EMAIL_PASS / GMAIL_APP_PASSWORD in .env."
      );
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
  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
};