"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const DB_1 = require("./database/DB");
//import { startAllJobs } from "./cron-jobs";
const fbWebhook_1 = __importDefault(require("./routes/fbWebhook"));
const whatsappWebhook_1 = __importDefault(require("./routes/whatsappWebhook"));
const leads_route_1 = __importDefault(require("./routes/leads.route"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const message_routes_1 = __importDefault(require("./routes/message.routes"));
const debug_route_1 = __importDefault(require("./routes/debug.route"));
const activity_routes_1 = __importDefault(require("./routes/activity.routes"));
const followup_routes_1 = __importDefault(require("./routes/followup.routes"));
const google_routes_1 = __importDefault(require("./routes/google.routes"));
const followupNotifier_1 = require("./services/followupNotifier");
const assigneeRoutes_1 = __importDefault(require("./routes/assigneeRoutes"));
const baileysService_1 = require("./services/baileysService");
const chatbotService_1 = require("./services/chatbotService");
const campaign_routes_1 = __importDefault(require("./routes/campaign.routes"));
const template_routes_1 = __importDefault(require("./routes/template.routes"));
const leadInterest_routes_1 = __importDefault(require("./routes/leadInterest.routes"));
const baileys_routes_1 = __importDefault(require("./routes/baileys.routes"));
const botFlow_routes_1 = __importDefault(require("./routes/botFlow.routes"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
// Ensure public/uploads directory exists safely
const uploadsDir = path_1.default.join(process.cwd(), "public", "uploads");
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// 🛡️ Security Headers
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
});
app.use("/public", express_1.default.static("public", { dotfiles: "deny", maxAge: "1d" }));
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.get("/", (_req, res) => {
    res.send("🚀 Facebook Webhook API Live!");
});
app.use("/api/webhook", fbWebhook_1.default);
app.use("/api/webhook/twilio", whatsappWebhook_1.default);
app.use("/api/leads", leads_route_1.default);
app.use("/api/admin", admin_routes_1.default);
app.use("/api/messages", message_routes_1.default);
app.use("/api/debug", debug_route_1.default);
app.use("/api/activity", activity_routes_1.default);
app.use("/api/followup", followup_routes_1.default);
app.use("/api/google", google_routes_1.default);
app.use("/api/assignees", assigneeRoutes_1.default);
app.use('/api/campaigns', campaign_routes_1.default);
app.use('/api/templates', template_routes_1.default);
app.use('/api/lead-interest', leadInterest_routes_1.default);
app.use('/api/baileys', baileys_routes_1.default);
app.use('/api/bot-flow', botFlow_routes_1.default);
// ✅ PROPER SERVER START
const startServer = async () => {
    await (0, DB_1.connectDB)(); // DB ready hone do
    console.log("EMAIL_GOOGLE_USER:", process.env.EMAIL_GOOGLE_USER);
    console.log("EMAIL_GOOGLE_CLIENT_ID exists:", !!process.env.EMAIL_GOOGLE_CLIENT_ID);
    console.log("EMAIL_GOOGLE_REFRESH_TOKEN exists:", !!process.env.EMAIL_GOOGLE_REFRESH_TOKEN);
    // startAllJobs(); // 🔥 cron yaha start karo
    (0, chatbotService_1.registerChatbot)();
    (0, baileysService_1.startWhatsApp)();
    (0, followupNotifier_1.startFollowupNotifier)();
    const PORT = process.env.PORT || 4520;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
};
startServer();
//# sourceMappingURL=server.js.map