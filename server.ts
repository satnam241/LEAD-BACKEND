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
import { getActiveLLMClient } from './services/llmService';
import leadInterestRoutes from './routes/leadInterest.routes';
import baileysRoutes from './routes/baileys.routes';
import botFlowRoutes from './routes/botFlow.routes';
import projectRoutes from './routes/project.routes';
import fbFormRoutes from './routes/fbForm.routes';
import aiChatRoutes from './routes/aiChat.routes';
import { getNotifications } from "./controllers/admin.controller";
import { adminAuth } from "./middleware/adminAuth";
import { startAutomatedTrainingScheduler } from './services/automatedLlmTrainingService';

import path from "path";
import fs from "fs";

const app = express();

// Ensure public/uploads directory exists safely
const uploadsDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 🛡️ Security Headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Do not restrict X-Frame-Options on uploads so PDF brochure and media previews render smoothly
  if (!req.path.includes("/uploads") && !req.path.endsWith(".pdf")) {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ✅ Enable CORS before static assets & API routes
app.use(cors({ origin: true, credentials: true }));

const staticOptions = {
  dotfiles: "deny" as const,
  maxAge: "1d",
  setHeaders: (res: express.Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
};

// ✅ Serve uploads under all path variations so frontend & external previews never 404
app.use("/public/uploads", express.static(uploadsDir, staticOptions));
app.use("/uploads", express.static(uploadsDir, staticOptions));
app.use("/api/public/uploads", express.static(uploadsDir, staticOptions));
app.use("/api/uploads", express.static(uploadsDir, staticOptions));
app.use("/public", express.static(path.join(process.cwd(), "public"), staticOptions));
app.use("/api/public", express.static(path.join(process.cwd(), "public"), staticOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("🚀 Facebook Webhook API Live!");
});

app.get(["/health", "/api/health"], (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
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
app.use('/api/projects', projectRoutes);
app.use('/api/fb-forms', fbFormRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.get('/api/notifications', adminAuth, getNotifications);

// ✅ PROPER SERVER START
const startServer = async () => {
  await connectDB(); // DB ready hone do
console.log("EMAIL_GOOGLE_USER:", process.env.EMAIL_GOOGLE_USER);
console.log("EMAIL_GOOGLE_CLIENT_ID exists:", !!process.env.EMAIL_GOOGLE_CLIENT_ID);
console.log("EMAIL_GOOGLE_REFRESH_TOKEN exists:", !!process.env.EMAIL_GOOGLE_REFRESH_TOKEN);
  const activeLLM = getActiveLLMClient();
  console.log(`🤖 AI Engine: Active Provider = ${activeLLM.provider.toUpperCase()} (${activeLLM.model})`);

  registerChatbot();
  startWhatsApp();

startFollowupNotifier();
startAutomatedTrainingScheduler();
  const PORT = process.env.PORT || 4520;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();
