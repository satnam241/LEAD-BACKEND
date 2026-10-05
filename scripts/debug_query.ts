import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../database/DB";
import Lead from "../models/lead.model";
import ConversationState from "../models/conversationState.model";

async function run() {
  await connectDB();
  const rawInterest = "hot";

  const states = await ConversationState.find().lean();
  const matchedLeadIds: any[] = [];
  for (const s of states) {
    const comp = s.attemptCount === 0 ? 'cold' : (s.completedAt || s.attemptCount >= 1) ? 'hot' : 'warm';
    if (comp === rawInterest && s.leadId) {
      matchedLeadIds.push(s.leadId);
    }
  }

  console.log("matchedLeadIds:", matchedLeadIds);

  const filter1: any = { isDeleted: false, interestLevel: 'hot' };
  const res1 = await Lead.find(filter1).lean();
  console.log("res1 (only interestLevel=hot):", res1.map(l => ({ name: l.fullName, id: l._id, interestLevel: l.interestLevel })));

  const filter2: any = { isDeleted: false, _id: { $in: matchedLeadIds } };
  const res2 = await Lead.find(filter2).lean();
  console.log("res2 (_id in matchedLeadIds):", res2.map(l => ({ name: l.fullName, id: l._id, interestLevel: l.interestLevel })));

  await mongoose.disconnect();
}

run().catch(console.error);
