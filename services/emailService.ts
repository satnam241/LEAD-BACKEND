<<<<<<< HEAD
// services/emailService.ts

import nodemailer from "nodemailer";
import { google } from "googleapis";

const OAuth2 = google.auth.OAuth2;

// Create OAuth client
const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

// Set refresh token
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
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
        user: process.env.GOOGLE_USER,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: accessToken.token!,
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

  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
};
=======
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendEmail = async (to: string, subject: string, text: string) => {
  try {
    await transporter.sendMail({
      from: `"Lead System" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    });
    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    console.error("Email error:", err);
  }
};
>>>>>>> 12ce192d2a5bd74df4854ba96063b1583eb3a95c
