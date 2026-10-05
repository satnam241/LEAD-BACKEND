import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../database/DB";
import Lead from "../models/lead.model";
import ConversationState from "../models/conversationState.model";

async function run() {
  await connectDB();
  const _ensureLead = Lead.modelName;

  const states = await ConversationState.find().populate('leadId').lean();
  console.log("=== ALL CONVERSATION STATES WITH LEADS ===");
  for (const s of states) {
    const l = s.leadId as any;
    console.log({
      stateId: s._id,
      statePhone: s.phone,
      attemptCount: s.attemptCount,
      lastMessage: s.lastMessageFromUser,
      lead: l ? { id: l._id, name: l.fullName, phone: l.phone, interestLevel: l.interestLevel, status: l.status } : 'ORPHAN_STATE (lead deleted or missing)',
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
