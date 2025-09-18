import express from "express";
import dotenv from "dotenv";
import cors from "cors"
import { connectDB } from "./database/DB";   
import fbWebhook from "./routes/fbWebhook";
import leadsRoute from "./routes/leads.route";
import AdminRoute from "./routes/admin.routes";

dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true,                    
}));
// Routes
app.use("/api/webhook", fbWebhook);
app.use("/api/leads", leadsRoute);
app.use("/api/admin", AdminRoute);

const PORT = process.env.PORT || 4520;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
