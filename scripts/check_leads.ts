import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../database/DB";
import Lead from "../models/lead.model";
import ConversationState from "../models/conversationState.model";

async function run() {
  await connectDB();

  const latestLeads = await Lead.find().sort({ updatedAt: -1 }).limit(5).lean();
  console.log("=== LATEST 5 LEADS ===");
  for (const l of latestLeads) {
    console.log({
      id: l._id,
      name: l.fullName,
      phone: l.phone,
      status: l.status,
      interestLevel: l.interestLevel,
      updatedAt: l.updatedAt,
      receivedAt: l.receivedAt,
    });
  }

  const latestStates = await ConversationState.find().sort({ updatedAt: -1 }).limit(5).lean();
  console.log("=== LATEST 5 CONVERSATION STATES ===");
  for (const s of latestStates) {
    console.log({
      id: s._id,
      leadId: s.leadId,
      phone: s.phone,
      attemptCount: s.attemptCount,
      currentStep: s.currentStep,
      lastMessageFromUser: s.lastMessageFromUser,
      updatedAt: s.updatedAt,
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
