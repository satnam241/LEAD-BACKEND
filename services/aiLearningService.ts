import mongoose, { Types } from 'mongoose';
import LearnedQuestion from '../models/learnedQuestion.model';
import Project from '../models/project.model';
import Lead from '../models/lead.model';

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
 * Extract lead preferences (budget, unit, timeline) from text and update lead profile
 */
export async function extractAndSaveLeadPreferences(leadId: Types.ObjectId, text: string): Promise<void> {
  try {
    if (!text) return;
    const lower = text.toLowerCase();
    const updates: Record<string, any> = {};

    // Unit Preference detection
    if (/2\s*bhk|two\s*bhk/i.test(lower)) {
      updates['extraFields.preferredUnit'] = '2 BHK';
    } else if (/3\s*bhk|three\s*bhk/i.test(lower)) {
      updates['extraFields.preferredUnit'] = '3 BHK';
    } else if (/4\s*bhk|four\s*bhk/i.test(lower)) {
      updates['extraFields.preferredUnit'] = '4 BHK';
    } else if (/villa|kothi/i.test(lower)) {
      updates['extraFields.preferredUnit'] = 'Villa / Kothi';
    } else if (/plot/i.test(lower)) {
      updates['extraFields.preferredUnit'] = 'Plot';
    }

    // Budget detection (e.g. 50 lakh, 1 cr, 75L, etc.)
    const budgetMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|cr|crore|crores|l\b)/i);
    if (budgetMatch) {
      updates.whatIsYourBudget = budgetMatch[0].trim();
    }

    // Timeline detection
    if (/immediate|urgent|ready to move|is month|iss month|ready/i.test(lower)) {
      updates.whenAreYouPlanningToPurchase = 'Immediate / Ready to Move';
    } else if (/1\s*month|2\s*month|3\s*month|next month/i.test(lower)) {
      updates.whenAreYouPlanningToPurchase = 'Within 1-3 Months';
    } else if (/investment|dekh rahe|sirf dekhna|planning/i.test(lower)) {
      updates.whenAreYouPlanningToPurchase = 'Planning / Investment';
    }

    if (Object.keys(updates).length > 0) {
      await Lead.findByIdAndUpdate(leadId, { $set: updates });
      console.log(`[AI Learning] 👤 Learned lead preferences for lead ${leadId}:`, updates);
    }
  } catch (err: any) {
    console.error('[AI Learning] Error extracting lead preferences:', err?.message || err);
  }
}
