import "dotenv/config"; 

import express from "express";
import cors from "cors";

import { connectDB } from "./database/DB";
//import { startAllJobs } from "./cron-jobs";

import fbWebhook from "./routes/fbWebhook";
import twilioWebhook from "./routes/whatsappWebhook";
import leadsRoute from "./routes/leads.route";
import AdminRoute from "./routes/admin.routes";
import messageRoutes from "./routes/message.routes";
import debugRoute from "./routes/debug.route";
import activityRoutes from "./routes/activity.routes";
import followup from "./routes/followup.routes";
import googleRoutes from "./routes/google.routes";
import { startFollowupNotifier } from "./services/followupNotifier";
import assigneeRoutes from "./routes/assigneeRoutes";
import { startWhatsApp } from './services/baileysService';
import { registerChatbot } from './services/chatbotService';
import campaignRoutes from './routes/campaign.routes';
import templateRoutes from './routes/template.routes';
import leadInterestRoutes from './routes/leadInterest.routes';
import baileysRoutes from './routes/baileys.routes';
import botFlowRoutes from './routes/botFlow.routes';

import path from "path";
import fs from "fs";

const app = express();

// Ensure public/uploads directory exists safely
const uploadsDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 🛡️ Security Headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use("/public", express.static("public", { dotfiles: "deny", maxAge: "1d" }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("🚀 Facebook Webhook API Live!");
});

app.use("/api/webhook", fbWebhook);
app.use("/api/webhook/twilio", twilioWebhook);
app.use("/api/leads", leadsRoute);
app.use("/api/admin", AdminRoute);
app.use("/api/messages", messageRoutes);
app.use("/api/debug", debugRoute);
app.use("/api/activity", activityRoutes);
app.use("/api/followup", followup);
app.use("/api/google",googleRoutes);
app.use("/api/assignees", assigneeRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/lead-interest', leadInterestRoutes);
app.use('/api/baileys', baileysRoutes);
app.use('/api/bot-flow', botFlowRoutes);

// ✅ PROPER SERVER START
const startServer = async () => {
  await connectDB(); // DB ready hone do
console.log("EMAIL_GOOGLE_USER:", process.env.EMAIL_GOOGLE_USER);
console.log("EMAIL_GOOGLE_CLIENT_ID exists:", !!process.env.EMAIL_GOOGLE_CLIENT_ID);
console.log("EMAIL_GOOGLE_REFRESH_TOKEN exists:", !!process.env.EMAIL_GOOGLE_REFRESH_TOKEN);
 // startAllJobs(); // 🔥 cron yaha start karo

registerChatbot();
startWhatsApp();

startFollowupNotifier();
  const PORT = process.env.PORT || 4520;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();
