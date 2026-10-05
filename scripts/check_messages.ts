import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../database/DB";
import ConversationMessage from "../models/conversationMessage.model";

async function run() {
  await connectDB();

  const msgs = await ConversationMessage.find().sort({ createdAt: -1 }).limit(10).lean();
  console.log("=== LATEST 10 CONVERSATION MESSAGES ===");
  for (const m of msgs) {
    console.log({
      id: m._id,
      leadId: m.leadId,
      phone: m.phone,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
