import { Request, Response } from 'express';
import { isLLMUp, getLLMQueueLength, LLM_MODEL, LLM_BASE_URL } from '../services/llmService';
import ConversationMessage from '../models/conversationMessage.model';
import ConversationState from '../models/conversationState.model';
import LearnedQuestion from '../models/learnedQuestion.model';
import Project from '../models/project.model';
import BotFlow from '../models/botFlow.model';
import { approveLearnedQuestion, rejectLearnedQuestion, normalizeQuery } from '../services/aiLearningService';

// GET /api/ai-chat/health - Check Local Llamafile LLM health and queue status
export async function getAiHealth(_req: Request, res: Response): Promise<void> {
  try {
    const online = await isLLMUp();
    const queueLength = getLLMQueueLength();
    res.json({
      success: true,
      online,
      queueLength,
      model: LLM_MODEL,
      baseUrl: LLM_BASE_URL,
      message: online
        ? `Local Llama 3.2 (${LLM_MODEL}) is online and active at ${LLM_BASE_URL}`
        : `Llamafile server offline at ${LLM_BASE_URL}. Run: llamafile-0.10.6 --server --model Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Error checking AI health' });
  }
}

// GET /api/ai-chat/messages/:leadId - Get chat transcript
export async function getLeadMessages(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.params;
    const messages = await ConversationMessage.find({ leadId }).sort({ createdAt: 1 }).lean();
    res.json({ success: true, messages });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch conversation transcript' });
  }
}

// PATCH /api/ai-chat/resume/:leadId - Resume AI conversation
export async function resumeLeadAi(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.params;
    const state = await ConversationState.findOneAndUpdate(
      { leadId },
      { $set: { aiPaused: false, needsAgent: false } },
      { new: true }
    );

    if (!state) {
      res.status(404).json({ success: false, error: 'Conversation state not found for this lead' });
      return;
    }

    res.json({ success: true, message: 'AI conversation resumed for lead', state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to resume AI conversation' });
  }
}

// ─────────────────────────────────────────────────────────────
// 🎓 ADMIN TRAINING & KNOWLEDGE INSERTION
// ─────────────────────────────────────────────────────────────

// GET /api/ai-chat/training-data - Get all trained FAQs and knowledge for a project
export async function getTrainingData(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.query.projectId as string;
    let query: any = { isActive: true };
    if (projectId) {
      query._id = projectId;
    }

    const projects = await Project.find(query)
      .select('name slug welcomeMessage faqs summary location priceRange unitTypes doNotSay')
      .lean();

    res.json({ success: true, projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch training data' });
  }
}

// POST /api/ai-chat/train - Admin inserts/types custom training Q&A or knowledge
export async function insertTrainingData(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, question, answer, keywords } = req.body;

    if (!question || !question.trim()) {
      res.status(400).json({ success: false, error: 'Question text is required for training' });
      return;
    }

    if (!answer || !answer.trim()) {
      res.status(400).json({ success: false, error: 'Answer text is required for training' });
      return;
    }

    let targetProject = null;
    if (projectId) {
      targetProject = await Project.findById(projectId);
    } else {
      targetProject = await Project.findOne({ isActive: true });
    }

    if (!targetProject) {
      res.status(404).json({ success: false, error: 'Project not found for training' });
      return;
    }

    const cleanQuestion = question.trim();
    const cleanAnswer = answer.trim();
    const cleanKeywords = Array.isArray(keywords) && keywords.length > 0
      ? keywords.map((k: string) => k.trim())
      : cleanQuestion
          .toLowerCase()
          .split(/\s+/)
          .filter((w: string) => w.length > 3)
          .slice(0, 5);

    // Check if duplicate question already exists in project's FAQs
    const norm = normalizeQuery(cleanQuestion);
    const existingIndex = targetProject.faqs.findIndex(
      f => normalizeQuery(f.question) === norm
    );

    if (existingIndex !== -1) {
      // Update existing FAQ
      targetProject.faqs[existingIndex].answer = cleanAnswer;
      targetProject.faqs[existingIndex].keywords = cleanKeywords;
    } else {
      // Append new trained FAQ
      targetProject.faqs.push({
        question: cleanQuestion,
        answer: cleanAnswer,
        keywords: cleanKeywords,
      });
    }

    await targetProject.save();

    // Also mark any matching pending learned question as approved
    await LearnedQuestion.updateMany(
      { projectId: targetProject._id, normalizedQuestion: norm, status: 'pending' },
      { $set: { status: 'approved', approvedAnswer: cleanAnswer, approvedAt: new Date() } }
    ).catch(() => {});

    console.log(`[AI Training] ✅ Trained project "${targetProject.name}" with FAQ: "${cleanQuestion}"`);

    res.status(201).json({
      success: true,
      message: `Successfully trained AI for "${targetProject.name}"`,
      faq: { question: cleanQuestion, answer: cleanAnswer, keywords: cleanKeywords },
      project: targetProject,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to insert training data' });
  }
}

// PUT /api/ai-chat/training-data/:projectId/:faqIndex - Edit an existing FAQ
export async function updateTrainingFaq(req: Request, res: Response): Promise<void> {
  try {
    const projectId = String(req.params.projectId);
    const faqIndex = String(req.params.faqIndex);
    const { question, answer, keywords } = req.body;
    const index = parseInt(faqIndex, 10);

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    if (isNaN(index) || index < 0 || index >= project.faqs.length) {
      res.status(400).json({ success: false, error: 'Invalid FAQ index' });
      return;
    }

    if (question && question.trim()) project.faqs[index].question = question.trim();
    if (answer && answer.trim()) project.faqs[index].answer = answer.trim();
    if (Array.isArray(keywords)) project.faqs[index].keywords = keywords.map((k: string) => k.trim());

    await project.save();
    res.json({ success: true, message: 'FAQ updated successfully', faqs: project.faqs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update FAQ' });
  }
}

// DELETE /api/ai-chat/training-data/:projectId/:faqIndex - Remove an FAQ
export async function deleteTrainingFaq(req: Request, res: Response): Promise<void> {
  try {
    const projectId = String(req.params.projectId);
    const faqIndex = String(req.params.faqIndex);
    const index = parseInt(faqIndex, 10);

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    if (isNaN(index) || index < 0 || index >= project.faqs.length) {
      res.status(400).json({ success: false, error: 'Invalid FAQ index' });
      return;
    }

    project.faqs.splice(index, 1);
    await project.save();
    res.json({ success: true, message: 'FAQ removed successfully', faqs: project.faqs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to delete FAQ' });
  }
}

// ─────────────────────────────────────────────────────────────
// 💬 FIRST MESSAGE CONFIGURATION ("Pehle kya msg krna h")
// ─────────────────────────────────────────────────────────────

// GET /api/ai-chat/first-message - Get configured first message & Step 1 question
export async function getFirstMessage(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.query.projectId as string;
    let project = null;
    if (projectId) {
      project = await Project.findById(projectId).select('name welcomeMessage').lean();
    } else {
      project = await Project.findOne({ isActive: true }).select('name welcomeMessage').lean();
    }

    const firstStep = await BotFlow.findOne({ isActive: true }).sort({ stepOrder: 1 }).lean();

    res.json({
      success: true,
      projectName: project?.name || 'Default Project',
      welcomeMessage: project?.welcomeMessage || '',
      step1Question: firstStep?.question || '',
      step1Options: firstStep?.options || [],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch first message configuration' });
  }
}

// POST /api/ai-chat/first-message - Set what message to send first
export async function setFirstMessage(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, welcomeMessage, step1Question, step1Options } = req.body;

    // Update project welcomeMessage if provided
    let project = null;
    if (welcomeMessage !== undefined) {
      if (projectId) {
        project = await Project.findByIdAndUpdate(
          projectId,
          { $set: { welcomeMessage: welcomeMessage.trim() } },
          { new: true }
        );
      } else {
        await Project.updateMany({}, { $set: { welcomeMessage: welcomeMessage.trim() } });
      }
    }

    // Optionally update Step 1 question/options in BotFlow if provided
    let updatedStep1 = null;
    if (step1Question && step1Question.trim()) {
      const highest = await BotFlow.findOne({ stepOrder: 1 });
      if (highest) {
        highest.question = step1Question.trim();
        if (Array.isArray(step1Options) && step1Options.length > 0) {
          highest.options = step1Options;
        }
        await highest.save();
        updatedStep1 = highest;
      }
    }

    res.json({
      success: true,
      message: 'First message settings updated successfully',
      welcomeMessage,
      project,
      step1: updatedStep1,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update first message' });
  }
}

// ─────────────────────────────────────────────────────────────
// ❓ AUTO-LEARNED CUSTOMER QUESTIONS
// ─────────────────────────────────────────────────────────────

// GET /api/ai-chat/learned-questions - List auto-discovered customer questions
export async function listLearnedQuestions(req: Request, res: Response): Promise<void> {
  try {
    const status = (req.query.status as string) || 'pending';
    const projectId = req.query.projectId as string;

    const filter: Record<string, any> = { status };
    if (projectId) {
      filter.projectId = projectId;
    }

    const questions = await LearnedQuestion.find(filter)
      .populate('projectId', 'name slug location')
      .sort({ occurrences: -1, updatedAt: -1 })
      .lean();

    res.json({ success: true, questions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch learned questions' });
  }
}

// POST /api/ai-chat/learned-questions/:id/approve - Approve question + answer and inject into Project FAQs
export async function approveQuestion(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { answer, question, keywords } = req.body;

    if (!answer || !answer.trim()) {
      res.status(400).json({ success: false, error: 'Answer is required to approve and train AI' });
      return;
    }

    const result = await approveLearnedQuestion(id, answer, question, keywords);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to approve learned question' });
  }
}

// DELETE /api/ai-chat/learned-questions/:id - Dismiss / reject learned question
export async function rejectQuestion(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    await rejectLearnedQuestion(id);
    res.json({ success: true, message: 'Question dismissed' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to dismiss question' });
  }
}

// POST /api/ai-chat/test-query - Test how AI evaluates a question in real-time
export async function testAiQuery(req: Request, res: Response): Promise<void> {
  try {
    const { query, projectId } = req.body;
    if (!query || !query.trim()) {
      res.status(400).json({ success: false, error: 'Query is required for test' });
      return;
    }

    const cleanQuery = query.trim();
    let project: any = null;
    if (projectId) {
      project = await Project.findById(projectId).lean();
    } else {
      project = await Project.findOne({ isActive: true }).lean();
    }

    if (!project) {
      res.status(404).json({ success: false, error: 'No active project found for test' });
      return;
    }

    const { findDirectFaqAnswer, findCrossSellProject } = await import('../services/projectKnowledgeService');
    const { isSiteVisitIntent, parseSlotDateTime, isHandoffRequested } = await import('../services/aiChatService');
    const { extractAndSaveLeadPreferences } = await import('../services/aiLearningService');

    const directFaqAnswer = findDirectFaqAnswer(project, cleanQuery);
    const isSiteVisit = isSiteVisitIntent(cleanQuery);
    const parsedSlot = isSiteVisit ? parseSlotDateTime(cleanQuery) : null;
    const isHandoff = isHandoffRequested(cleanQuery);
    const crossSell = await findCrossSellProject(project._id, cleanQuery);

    const dummyId = new (await import('mongoose')).Types.ObjectId();
    const simulatedProfile = await extractAndSaveLeadPreferences(dummyId, cleanQuery);

    res.json({
      success: true,
      query: cleanQuery,
      project: { id: project._id, name: project.name, location: project.location, priceRange: project.priceRange },
      diagnostics: {
        isSiteVisit,
        parsedSlot,
        isHandoff,
        directFaqAnswer,
        crossSellOpportunity: crossSell ? { name: crossSell.name, location: crossSell.location, priceRange: crossSell.priceRange } : null,
        simulatedProfile,
        matchedTrainedFaqs: (project.faqs || []).filter((f: any) =>
          cleanQuery.toLowerCase().includes((f.question || '').toLowerCase()) ||
          (f.keywords || []).some((k: string) => cleanQuery.toLowerCase().includes(k.toLowerCase()))
        ),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Error testing AI query' });
  }
}
