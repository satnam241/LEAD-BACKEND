import mongoose, { Types } from 'mongoose';
import LearnedQuestion from '../models/learnedQuestion.model';
import Project from '../models/project.model';
import Lead from '../models/lead.model';
import LLMTrainingLog from '../models/llmTrainingLog.model';

export function normalizeQuery(q: string): string {
  if (!q) return '';
  return q
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/gi, '') // keep letters, numbers, and Devanagari characters
    .replace(/\s+/g, ' ')
    .trim();
}

const COMMON_GREETINGS = new Set([
  'hi',
  'hello',
  'hey',
  'namaste',
  'pranam',
  'good morning',
  'good evening',
  'good afternoon',
  'ok',
  'okay',
  'haan',
  'ha',
  'yes',
  'no',
  'nahi',
  'bye',
]);

/**
 * Record a question asked by a lead that wasn't in the project facts
 */
export async function recordLearnedQuestion(
  projectId: Types.ObjectId,
  userQuery: string,
  leadId: Types.ObjectId,
  draftedAnswer?: string
): Promise<void> {
  try {
    const trimmed = userQuery.trim();
    if (trimmed.length < 5) return;

    const normalized = normalizeQuery(trimmed);
    if (!normalized || COMMON_GREETINGS.has(normalized)) return;

    // Check if the project already has an FAQ answering this question
    const project = await Project.findById(projectId).lean();
    if (!project) return;

    const alreadyInFaqs = (project.faqs || []).some(f => {
      const normFaq = normalizeQuery(f.question);
      return normFaq === normalized || normFaq.includes(normalized) || normalized.includes(normFaq);
    });

    if (alreadyInFaqs) {
      return;
    }

    // Check if we already have this question logged as pending
    const existing = await LearnedQuestion.findOne({
      projectId,
      normalizedQuestion: normalized,
      status: 'pending',
    });

    if (existing) {
      existing.occurrences += 1;
      if (!existing.leadIds.some(id => String(id) === String(leadId))) {
        existing.leadIds.push(leadId);
      }
      if (!existing.exampleUserQueries.includes(trimmed) && existing.exampleUserQueries.length < 10) {
        existing.exampleUserQueries.push(trimmed);
      }
      if (!existing.suggestedAnswer && draftedAnswer) {
        existing.suggestedAnswer = draftedAnswer;
      }
      await existing.save();
      console.log(`[AI Learning] 📈 Bumping question occurrences (${existing.occurrences}x): "${trimmed}"`);
    } else {
      await LearnedQuestion.create({
        projectId,
        question: trimmed,
        normalizedQuestion: normalized,
        occurrences: 1,
        leadIds: [leadId],
        exampleUserQueries: [trimmed],
        suggestedAnswer: draftedAnswer || '',
        status: 'pending',
      });
      console.log(`[AI Learning] 💡 Auto-discovered new question for project ${project.name}: "${trimmed}"`);
    }
  } catch (err: any) {
    console.error('[AI Learning] Error recording learned question:', err.message || err);
  }
}

/**
 * Learn from an agent's manual reply to a lead
 */
export async function learnFromAgentReply(leadId: Types.ObjectId, agentReplyText: string): Promise<void> {
  try {
    if (!agentReplyText || agentReplyText.trim().length < 5) return;

    // Find the latest pending learned question from this lead
    const pending = await LearnedQuestion.findOne({
      leadIds: leadId,
      status: 'pending',
    }).sort({ updatedAt: -1 });

    if (pending && !pending.suggestedAnswer) {
      pending.suggestedAnswer = agentReplyText.trim();
      await pending.save();
      console.log(`[AI Learning] 🎓 Captured human agent answer for question: "${pending.question}"`);
    }
  } catch (err: any) {
    console.error('[AI Learning] Error learning from agent reply:', err.message || err);
  }
}

/**
 * Admin approves a learned question, instantly training the AI by injecting it into Project.faqs
 */
export async function approveLearnedQuestion(
  learnedQuestionId: string,
  approvedAnswer: string,
  customQuestion?: string,
  keywords?: string[]
): Promise<any> {
  const item = await LearnedQuestion.findById(learnedQuestionId);
  if (!item) {
    throw new Error('Learned question not found');
  }

  const finalQuestion = customQuestion && customQuestion.trim() ? customQuestion.trim() : item.question;
  const finalAnswer = approvedAnswer.trim();

  const generatedKeywords = keywords && keywords.length > 0
    ? keywords
    : finalQuestion
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 5);

  // Add into project's verified FAQs
  const project = await Project.findById(item.projectId);
  if (!project) {
    throw new Error('Project not found for this learned question');
  }

  project.faqs.push({
    question: finalQuestion,
    answer: finalAnswer,
    keywords: generatedKeywords,
  });

  await project.save();

  // Mark learned question as approved
  item.status = 'approved';
  item.approvedAnswer = finalAnswer;
  item.approvedAt = new Date();
  await item.save();

  console.log(`[AI Learning] ✅ Successfully trained AI on project "${project.name}" with new FAQ: "${finalQuestion}"`);

  return { success: true, project, learnedQuestion: item };
}

/**
 * Dismiss / Reject a learned question
 */
export async function rejectLearnedQuestion(learnedQuestionId: string): Promise<void> {
  await LearnedQuestion.findByIdAndUpdate(learnedQuestionId, {
    status: 'rejected',
  });
}

/**
 * Comprehensive Automated Buyer Profiling:
 * Extracts budget, BHK configuration, purchase timeline, purpose (self-use vs investment),
 * and location preferences from free-form WhatsApp chat and updates Lead document.
 */
export async function extractAndSaveLeadPreferences(leadId: Types.ObjectId, text: string): Promise<Record<string, any>> {
  try {
    if (!text || text.trim().length === 0) return {};
    const raw = text.trim();
    const lower = raw.toLowerCase();
    const updates: Record<string, any> = {};

    // ── 1. BHK / Unit Configuration ──────────────────────────────
    if (/1(?:\.5)?\s*bhk|one\s*bhk/i.test(lower)) {
      updates['extraFields.bhkPreference'] = '1 BHK';
      updates['extraFields.preferredUnit'] = '1 BHK';
    } else if (/2(?:\.5)?\s*bhk|two\s*bhk/i.test(lower)) {
      updates['extraFields.bhkPreference'] = /2\.5\s*bhk/i.test(lower) ? '2.5 BHK' : '2 BHK';
      updates['extraFields.preferredUnit'] = updates['extraFields.bhkPreference'];
    } else if (/3(?:\.5)?\s*bhk|three\s*bhk/i.test(lower)) {
      updates['extraFields.bhkPreference'] = /3\.5\s*bhk/i.test(lower) ? '3.5 BHK' : '3 BHK';
      updates['extraFields.preferredUnit'] = updates['extraFields.bhkPreference'];
    } else if (/4\s*bhk|four\s*bhk/i.test(lower)) {
      updates['extraFields.bhkPreference'] = '4 BHK';
      updates['extraFields.preferredUnit'] = '4 BHK';
    } else if (/penthouse/i.test(lower)) {
      updates['extraFields.bhkPreference'] = 'Penthouse';
      updates['extraFields.preferredUnit'] = 'Penthouse';
    } else if (/villa|kothi|independent house/i.test(lower)) {
      updates['extraFields.bhkPreference'] = 'Villa / Kothi';
      updates['extraFields.preferredUnit'] = 'Villa / Kothi';
    } else if (/plot|land|zameen/i.test(lower)) {
      updates['extraFields.bhkPreference'] = 'Residential Plot';
      updates['extraFields.preferredUnit'] = 'Plot';
    } else if (/studio/i.test(lower)) {
      updates['extraFields.bhkPreference'] = 'Studio Apartment';
      updates['extraFields.preferredUnit'] = 'Studio';
    }

    // ── 2. Budget Detection & Normalization ───────────────────────
    // A. Range matching: e.g. "50-60 lakh", "50 to 60 lacs", "1 to 1.5 cr", "60 se 70 lakh"
    const rangeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:-|to|se)\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|cr|crore|crores|l\b)/i);
    if (rangeMatch) {
      const unit = /cr/i.test(rangeMatch[3]) ? 'Cr' : 'Lakhs';
      updates.whatIsYourBudget = `₹${rangeMatch[1]} - ${rangeMatch[2]} ${unit}`;
      updates['extraFields.budgetRaw'] = rangeMatch[0];
    } else {
      // B. Single value with prefix: "under 80 lakh", "around 1.2 cr", "max 50L"
      const prefixMatch = lower.match(/(?:under|below|around|approx|max|upto|kam se kam|budget)\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|cr|crore|crores|l\b)/i);
      if (prefixMatch) {
        const unit = /cr/i.test(prefixMatch[2]) ? 'Cr' : 'Lakhs';
        updates.whatIsYourBudget = `Up to ₹${prefixMatch[1]} ${unit}`;
        updates['extraFields.budgetRaw'] = prefixMatch[0];
      } else {
        // C. Standard single amount: "50 lakh", "1.25 cr", "75L", "₹65 lacs"
        const singleMatch = lower.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|cr|crore|crores|l\b)/i);
        if (singleMatch) {
          const unit = /cr/i.test(singleMatch[2]) ? 'Cr' : 'Lakhs';
          updates.whatIsYourBudget = `₹${singleMatch[1]} ${unit}`;
          updates['extraFields.budgetRaw'] = singleMatch[0];
        }
      }
    }

    // ── 3. Purchase Timeline Detection ───────────────────────────
    if (/immediate|urgent|ready to move|rtm|ready flat|iss? month|is mahine|within 15 days|asap|jaldi/i.test(lower)) {
      updates.whenAreYouPlanningToPurchase = 'Immediate / Ready to Move';
    } else if (/1\s*month|2\s*month|3\s*month|next month|agle mahine|within 3 months/i.test(lower)) {
      updates.whenAreYouPlanningToPurchase = 'Within 1-3 Months';
    } else if (/6\s*month|under construction|next year|2025|2026|2027|possession tak/i.test(lower)) {
      updates.whenAreYouPlanningToPurchase = '6+ Months (Under Construction)';
    } else if (/abhi sirf dekh|just exploring|sirf inquiry|planning|future/i.test(lower)) {
      updates.whenAreYouPlanningToPurchase = 'Exploring / Planning Stage';
    }

    // ── 4. Purpose of Purchase (Self-Use vs Investment) ──────────
    if (/self\s*use|khud ke liye|rehne ke liye|rehna h|family|living|end\s*use/i.test(lower)) {
      updates['extraFields.purpose'] = 'Self-Use (End User)';
    } else if (/investment|invest|rental|kiraya|rental income|resale|roi|returns/i.test(lower)) {
      updates['extraFields.purpose'] = 'Investment / Rental Return';
    }

    // ── 5. Location / Landmark Mention ───────────────────────────
    const sectorMatch = raw.match(/sector[-\s]*\d+[a-z]?/i);
    if (sectorMatch) {
      updates['extraFields.preferredLocation'] = sectorMatch[0].toUpperCase();
    } else if (/expressway|highway|metro|golf course/i.test(lower)) {
      const match = lower.match(/(?:near|on)?\s*(expressway|highway|metro|golf course)/i);
      if (match) updates['extraFields.preferredLocation'] = match[0].trim();
    }

    if (Object.keys(updates).length > 0) {
      await Lead.findByIdAndUpdate(leadId, { $set: updates });
      console.log(`[Buyer Profiling] 🎯 Profiled Lead ${leadId}:`, updates);
      return updates;
    }
    return {};
  } catch (err: any) {
    console.error('[Buyer Profiling] Error extracting lead preferences:', err?.message || err);
    return {};
  }
}

/**
 * Persists high-quality conversation pairs for continuous fine-tuning
 * of custom open-source model at llm.sharesampatti.com
 */
export async function logConversationForTraining(data: {
  leadId?: Types.ObjectId;
  phone?: string;
  language: 'english' | 'hindi' | 'hinglish';
  detectedIntent?: string;
  projectId?: Types.ObjectId;
  projectName?: string;
  userMessage: string;
  aiResponse: string;
  source?: 'whatsapp' | 'manual_agent' | 'web';
  qualityScore?: number;
}): Promise<void> {
  try {
    if (!data.userMessage || !data.aiResponse) return;
    const cleanUser = data.userMessage.trim();
    const cleanAi = data.aiResponse.trim();
    if (cleanUser.length < 2 || cleanAi.length < 5) return;

    await LLMTrainingLog.create({
      leadId: data.leadId,
      phone: data.phone,
      language: data.language,
      detectedIntent: data.detectedIntent || 'general_query',
      projectId: data.projectId,
      projectName: data.projectName,
      userMessage: cleanUser,
      aiResponse: cleanAi,
      source: data.source || 'whatsapp',
      qualityScore: data.qualityScore || 5,
    });
    console.log(`[LLM Training Log] 📝 Logged training pair for "${data.projectName || 'General'}" (${data.language})`);
  } catch (err: any) {
    console.warn('[LLM Training Log] Non-fatal logging error:', err?.message || err);
  }
}

