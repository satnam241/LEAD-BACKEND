"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAiHealth = getAiHealth;
exports.getLeadMessages = getLeadMessages;
exports.resumeLeadAi = resumeLeadAi;
exports.getTrainingData = getTrainingData;
exports.insertTrainingData = insertTrainingData;
exports.updateTrainingFaq = updateTrainingFaq;
exports.deleteTrainingFaq = deleteTrainingFaq;
exports.getFirstMessage = getFirstMessage;
exports.setFirstMessage = setFirstMessage;
exports.deleteFirstMessage = deleteFirstMessage;
exports.listLearnedQuestions = listLearnedQuestions;
exports.approveQuestion = approveQuestion;
exports.rejectQuestion = rejectQuestion;
exports.testAiQuery = testAiQuery;
const llmService_1 = require("../services/llmService");
const conversationMessage_model_1 = __importDefault(require("../models/conversationMessage.model"));
const conversationState_model_1 = __importDefault(require("../models/conversationState.model"));
const learnedQuestion_model_1 = __importDefault(require("../models/learnedQuestion.model"));
const project_model_1 = __importDefault(require("../models/project.model"));
const botFlow_model_1 = __importDefault(require("../models/botFlow.model"));
const aiLearningService_1 = require("../services/aiLearningService");
// GET /api/ai-chat/health - Check active LLM provider and queue status
async function getAiHealth(_req, res) {
    try {
        const active = (0, llmService_1.getActiveLLMClient)();
        const online = await (0, llmService_1.isLLMUp)();
        const queueLength = (0, llmService_1.getLLMQueueLength)();
        res.json({
            success: true,
            provider: active.provider,
            online,
            queueLength,
            model: active.model,
            message: active.provider !== 'local'
                ? `🔥 Cloud AI Thinker (${active.provider.toUpperCase()} - ${active.model}) is active and online!`
                : online
                    ? `Local Llama 3.2 (${llmService_1.LLM_MODEL}) is online and active at ${llmService_1.LLM_BASE_URL}`
                    : `Llamafile server offline at ${llmService_1.LLM_BASE_URL}. Run: llamafile-0.10.6 --server --model Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Error checking AI health' });
    }
}
// GET /api/ai-chat/messages/:leadId - Get chat transcript
async function getLeadMessages(req, res) {
    try {
        const { leadId } = req.params;
        const messages = await conversationMessage_model_1.default.find({ leadId }).sort({ createdAt: 1 }).lean();
        res.json({ success: true, messages });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to fetch conversation transcript' });
    }
}
// PATCH /api/ai-chat/resume/:leadId - Resume AI conversation
async function resumeLeadAi(req, res) {
    try {
        const { leadId } = req.params;
        const state = await conversationState_model_1.default.findOneAndUpdate({ leadId }, { $set: { aiPaused: false, needsAgent: false } }, { new: true });
        if (!state) {
            res.status(404).json({ success: false, error: 'Conversation state not found for this lead' });
            return;
        }
        res.json({ success: true, message: 'AI conversation resumed for lead', state });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to resume AI conversation' });
    }
}
// ─────────────────────────────────────────────────────────────
// 🎓 ADMIN TRAINING & KNOWLEDGE INSERTION
// ─────────────────────────────────────────────────────────────
// GET /api/ai-chat/training-data - Get all trained FAQs and knowledge for a project
async function getTrainingData(req, res) {
    try {
        const projectId = req.query.projectId;
        let query = { isActive: true };
        if (projectId) {
            query._id = projectId;
        }
        const projects = await project_model_1.default.find(query)
            .select('name slug welcomeMessage faqs summary location priceRange unitTypes doNotSay')
            .lean();
        res.json({ success: true, projects });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to fetch training data' });
    }
}
// POST /api/ai-chat/train - Admin inserts/types custom training Q&A or knowledge
async function insertTrainingData(req, res) {
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
            targetProject = await project_model_1.default.findById(projectId);
        }
        else {
            targetProject = await project_model_1.default.findOne({ isActive: true });
        }
        if (!targetProject) {
            res.status(404).json({ success: false, error: 'Project not found for training' });
            return;
        }
        const cleanQuestion = question.trim();
        const cleanAnswer = answer.trim();
        const cleanKeywords = Array.isArray(keywords) && keywords.length > 0
            ? keywords.map((k) => k.trim())
            : cleanQuestion
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 3)
                .slice(0, 5);
        // Check if duplicate question already exists in project's FAQs
        const norm = (0, aiLearningService_1.normalizeQuery)(cleanQuestion);
        const existingIndex = targetProject.faqs.findIndex(f => (0, aiLearningService_1.normalizeQuery)(f.question) === norm);
        if (existingIndex !== -1) {
            // Update existing FAQ
            targetProject.faqs[existingIndex].answer = cleanAnswer;
            targetProject.faqs[existingIndex].keywords = cleanKeywords;
        }
        else {
            // Append new trained FAQ
            targetProject.faqs.push({
                question: cleanQuestion,
                answer: cleanAnswer,
                keywords: cleanKeywords,
            });
        }
        await targetProject.save();
        // Also mark any matching pending learned question as approved
        await learnedQuestion_model_1.default.updateMany({ projectId: targetProject._id, normalizedQuestion: norm, status: 'pending' }, { $set: { status: 'approved', approvedAnswer: cleanAnswer, approvedAt: new Date() } }).catch(() => { });
        console.log(`[AI Training] ✅ Trained project "${targetProject.name}" with FAQ: "${cleanQuestion}"`);
        res.status(201).json({
            success: true,
            message: `Successfully trained AI for "${targetProject.name}"`,
            faq: { question: cleanQuestion, answer: cleanAnswer, keywords: cleanKeywords },
            project: targetProject,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to insert training data' });
    }
}
// PUT /api/ai-chat/training-data/:projectId/:faqIndex - Edit an existing FAQ
async function updateTrainingFaq(req, res) {
    try {
        const projectId = String(req.params.projectId);
        const faqIndex = String(req.params.faqIndex);
        const { question, answer, keywords } = req.body;
        const index = parseInt(faqIndex, 10);
        const project = await project_model_1.default.findById(projectId);
        if (!project) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        if (isNaN(index) || index < 0 || index >= project.faqs.length) {
            res.status(400).json({ success: false, error: 'Invalid FAQ index' });
            return;
        }
        if (question && question.trim())
            project.faqs[index].question = question.trim();
        if (answer && answer.trim())
            project.faqs[index].answer = answer.trim();
        if (Array.isArray(keywords))
            project.faqs[index].keywords = keywords.map((k) => k.trim());
        await project.save();
        res.json({ success: true, message: 'FAQ updated successfully', faqs: project.faqs });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to update FAQ' });
    }
}
// DELETE /api/ai-chat/training-data/:projectId/:faqIndex - Remove an FAQ
async function deleteTrainingFaq(req, res) {
    try {
        const projectId = String(req.params.projectId);
        const faqIndex = String(req.params.faqIndex);
        const index = parseInt(faqIndex, 10);
        const project = await project_model_1.default.findById(projectId);
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
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to delete FAQ' });
    }
}
// ─────────────────────────────────────────────────────────────
// 💬 FIRST MESSAGE CONFIGURATION ("Pehle kya msg krna h")
// ─────────────────────────────────────────────────────────────
// GET /api/ai-chat/first-message - Get configured first message & Step 1 question
async function getFirstMessage(req, res) {
    try {
        const { getGlobalWelcomeMessage } = await Promise.resolve().then(() => __importStar(require('../services/botSettingService')));
        const globalWelcome = await getGlobalWelcomeMessage();
        const projectId = req.query.projectId;
        let project = null;
        if (projectId) {
            project = await project_model_1.default.findById(projectId).select('name welcomeMessage').lean();
        }
        const firstStep = await botFlow_model_1.default.findOne({ isActive: true }).sort({ stepOrder: 1 }).lean();
        const resolvedWelcome = (projectId && project?.welcomeMessage && project.welcomeMessage.trim())
            ? project.welcomeMessage.trim()
            : globalWelcome;
        res.json({
            success: true,
            globalWelcomeMessage: globalWelcome,
            projectName: project?.name || 'All Leads (Universal)',
            welcomeMessage: resolvedWelcome,
            step1Question: firstStep?.question || 'Which property type interests you?',
            step1Options: firstStep?.options || [],
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to fetch first message configuration' });
    }
}
// POST /api/ai-chat/first-message - Set what message to send first
async function setFirstMessage(req, res) {
    try {
        const { projectId, welcomeMessage, step1Question, step1Options } = req.body;
        const { setGlobalWelcomeMessage } = await Promise.resolve().then(() => __importStar(require('../services/botSettingService')));
        let project = null;
        if (welcomeMessage !== undefined) {
            if (!projectId) {
                // Universal First Message for ALL leads!
                await setGlobalWelcomeMessage(welcomeMessage);
            }
            else {
                // Project-specific override
                project = await project_model_1.default.findByIdAndUpdate(projectId, { $set: { welcomeMessage: welcomeMessage.trim() } }, { new: true });
            }
        }
        // Optionally update Step 1 question/options in BotFlow if provided
        let updatedStep1 = null;
        if (step1Question && step1Question.trim()) {
            const highest = await botFlow_model_1.default.findOne({ stepOrder: 1 });
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
            message: !projectId
                ? 'Universal First Message saved for ALL leads successfully'
                : 'First message updated for project successfully',
            welcomeMessage,
            project,
            step1: updatedStep1,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to update first message' });
    }
}
// DELETE /api/ai-chat/first-message or /api/ai-chat/first-message/:projectId - Clear/delete welcome message
async function deleteFirstMessage(req, res) {
    try {
        const projectId = (req.params.projectId || req.query.projectId || req.body?.projectId);
        const { setGlobalWelcomeMessage } = await Promise.resolve().then(() => __importStar(require('../services/botSettingService')));
        let project = null;
        if (!projectId) {
            await setGlobalWelcomeMessage('');
            await project_model_1.default.updateMany({}, { $set: { welcomeMessage: '' } });
        }
        else {
            project = await project_model_1.default.findByIdAndUpdate(projectId, { $set: { welcomeMessage: '' } }, { new: true });
        }
        res.json({
            success: true,
            message: 'First welcome message cleared/deleted successfully',
            project,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to delete first message' });
    }
}
// ─────────────────────────────────────────────────────────────
// ❓ AUTO-LEARNED CUSTOMER QUESTIONS
// ─────────────────────────────────────────────────────────────
// GET /api/ai-chat/learned-questions - List auto-discovered customer questions
async function listLearnedQuestions(req, res) {
    try {
        const status = req.query.status || 'pending';
        const projectId = req.query.projectId;
        const filter = { status };
        if (projectId) {
            filter.projectId = projectId;
        }
        const questions = await learnedQuestion_model_1.default.find(filter)
            .populate('projectId', 'name slug location')
            .sort({ occurrences: -1, updatedAt: -1 })
            .lean();
        res.json({ success: true, questions });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to fetch learned questions' });
    }
}
// POST /api/ai-chat/learned-questions/:id/approve - Approve question + answer and inject into Project FAQs
async function approveQuestion(req, res) {
    try {
        const id = String(req.params.id);
        const { answer, question, keywords } = req.body;
        if (!answer || !answer.trim()) {
            res.status(400).json({ success: false, error: 'Answer is required to approve and train AI' });
            return;
        }
        const result = await (0, aiLearningService_1.approveLearnedQuestion)(id, answer, question, keywords);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to approve learned question' });
    }
}
// DELETE /api/ai-chat/learned-questions/:id - Dismiss / reject learned question
async function rejectQuestion(req, res) {
    try {
        const id = String(req.params.id);
        await (0, aiLearningService_1.rejectLearnedQuestion)(id);
        res.json({ success: true, message: 'Question dismissed' });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to dismiss question' });
    }
}
// POST /api/ai-chat/test-query - Test how AI evaluates a question in real-time
async function testAiQuery(req, res) {
    try {
        const { query, projectId } = req.body;
        if (!query || !query.trim()) {
            res.status(400).json({ success: false, error: 'Query is required for test' });
            return;
        }
        const cleanQuery = query.trim();
        let project = null;
        if (projectId) {
            project = await project_model_1.default.findById(projectId).lean();
        }
        else {
            project = await project_model_1.default.findOne({ isActive: true }).lean();
        }
        if (!project) {
            res.status(404).json({ success: false, error: 'No active project found for test' });
            return;
        }
        const { findDirectFaqAnswer, findCrossSellProject } = await Promise.resolve().then(() => __importStar(require('../services/projectKnowledgeService')));
        const { isSiteVisitIntent, parseSlotDateTime, isHandoffRequested } = await Promise.resolve().then(() => __importStar(require('../services/aiChatService')));
        const { extractAndSaveLeadPreferences } = await Promise.resolve().then(() => __importStar(require('../services/aiLearningService')));
        const directFaqAnswer = findDirectFaqAnswer(project, cleanQuery);
        const isSiteVisit = isSiteVisitIntent(cleanQuery);
        const parsedSlot = isSiteVisit ? parseSlotDateTime(cleanQuery) : null;
        const isHandoff = isHandoffRequested(cleanQuery);
        const crossSell = await findCrossSellProject(project._id, cleanQuery);
        const dummyId = new (await Promise.resolve().then(() => __importStar(require('mongoose')))).Types.ObjectId();
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
                matchedTrainedFaqs: (project.faqs || []).filter((f) => cleanQuery.toLowerCase().includes((f.question || '').toLowerCase()) ||
                    (f.keywords || []).some((k) => cleanQuery.toLowerCase().includes(k.toLowerCase()))),
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Error testing AI query' });
    }
}
//# sourceMappingURL=aiChat.controller.js.map