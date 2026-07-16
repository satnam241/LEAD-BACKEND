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
  "https://developers.google.com/oauthplayground"
);

// Set refresh token
oauth2Client.setCredentials({
  refresh_token: process.env.EMAIL_GOOGLE_REFRESH_TOKEN,
});

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
    // Get access token dynamically
    const accessToken = await oauth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_GOOGLE_USER,
        clientId: process.env.EMAIL_GOOGLE_CLIENT_ID,
        clientSecret: process.env.EMAIL_GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.EMAIL_GOOGLE_REFRESH_TOKEN,
        accessToken: accessToken.token!,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_GOOGLE_USER,
      to,
      subject,
      html,
      attachments,
    };

    const result = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent:", result);
    return result;

  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
};
