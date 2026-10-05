import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../database/DB";
import Lead from "../models/lead.model";
import ConversationState from "../models/conversationState.model";

async function run() {
  await connectDB();

  const countHot = await Lead.countDocuments({ interestLevel: 'hot' });
  const countWarm = await Lead.countDocuments({ interestLevel: 'warm' });
  const countCold = await Lead.countDocuments({ interestLevel: 'cold' });
  const countNull = await Lead.countDocuments({ interestLevel: null });
  console.log({ countHot, countWarm, countCold, countNull });

  const hotLeads = await Lead.find({ interestLevel: 'hot' }).lean();
  console.log("HOT LEADS:", hotLeads.map(l => ({ id: l._id, name: l.fullName, phone: l.phone, interestLevel: l.interestLevel, receivedAt: l.receivedAt, updatedAt: l.updatedAt })));

  // Test admin.controller.ts filter logic with interest = "hot"
  const rawInterest = "hot";
  const states = await ConversationState.find().lean();
  const matchedLeadIds: any[] = [];
  for (const s of states) {
    const comp = s.attemptCount === 0 ? 'cold' : (s.completedAt || s.attemptCount >= 1) ? 'hot' : 'warm';
    if (comp === rawInterest && s.leadId) {
      matchedLeadIds.push(s.leadId);
    }
  }

  const filter: any = {
    isDeleted: false,
    $or: [
      { interestLevel: rawInterest },
      { _id: { $in: matchedLeadIds } }
    ]
  };

  const results = await Lead.find(filter).sort({ receivedAt: -1 }).lean();
  console.log(`ADMIN FILTER RETURNED ${results.length} LEADS:`, results.map(l => ({ id: l._id, name: l.fullName, phone: l.phone, interestLevel: l.interestLevel })));

  await mongoose.disconnect();
}

run().catch(console.error);
