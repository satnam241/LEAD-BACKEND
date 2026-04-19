"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const DB_1 = require("./database/DB");
const cron_jobs_1 = require("./cron-jobs");
const fbWebhook_1 = __importDefault(require("./routes/fbWebhook"));
const whatsappWebhook_1 = __importDefault(require("./routes/whatsappWebhook"));
const leads_route_1 = __importDefault(require("./routes/leads.route"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const message_routes_1 = __importDefault(require("./routes/message.routes"));
const debug_route_1 = __importDefault(require("./routes/debug.route"));
const activity_routes_1 = __importDefault(require("./routes/activity.routes"));
const followup_routes_1 = __importDefault(require("./routes/followup.routes"));
const app = (0, express_1.default)();
app.use("/public", express_1.default.static("public"));
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
// ✅ PROPER SERVER START
const startServer = async () => {
    await (0, DB_1.connectDB)(); // DB ready hone do
    (0, cron_jobs_1.startAllJobs)(); // 🔥 cron yaha start karo
    const PORT = process.env.PORT || 4520;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
};
startServer();
//# sourceMappingURL=server.js.map