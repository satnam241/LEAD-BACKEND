"use strict";
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
exports.listLearnedQuestions = listLearnedQuestions;
exports.approveQuestion = approveQuestion;
exports.rejectQuestion = rejectQuestion;
const llmService_1 = require("../services/llmService");
const conversationMessage_model_1 = __importDefault(require("../models/conversationMessage.model"));
const conversationState_model_1 = __importDefault(require("../models/conversationState.model"));
const learnedQuestion_model_1 = __importDefault(require("../models/learnedQuestion.model"));
const project_model_1 = __importDefault(require("../models/project.model"));
const botFlow_model_1 = __importDefault(require("../models/botFlow.model"));
const aiLearningService_1 = require("../services/aiLearningService");
// GET /api/ai-chat/health - Check Local Llamafile LLM health and queue status
async function getAiHealth(_req, res) {
    try {
        const online = await (0, llmService_1.isLLMUp)();
        const queueLength = (0, llmService_1.getLLMQueueLength)();
        res.json({
            success: true,
            online,
            queueLength,
            model: llmService_1.LLM_MODEL,
            baseUrl: llmService_1.LLM_BASE_URL,
            message: online
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
        const projectId = req.query.projectId;
        let project = null;
        if (projectId) {
            project = await project_model_1.default.findById(projectId).select('name welcomeMessage').lean();
        }
        else {
            project = await project_model_1.default.findOne({ isActive: true }).select('name welcomeMessage').lean();
        }
        const firstStep = await botFlow_model_1.default.findOne({ isActive: true }).sort({ stepOrder: 1 }).lean();
        res.json({
            success: true,
            projectName: project?.name || 'Default Project',
            welcomeMessage: project?.welcomeMessage || '',
            step1Question: firstStep?.question || '',
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
        // Update project welcomeMessage if provided
        let project = null;
        if (welcomeMessage !== undefined) {
            if (projectId) {
                project = await project_model_1.default.findByIdAndUpdate(projectId, { $set: { welcomeMessage: welcomeMessage.trim() } }, { new: true });
            }
            else {
                await project_model_1.default.updateMany({}, { $set: { welcomeMessage: welcomeMessage.trim() } });
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
            message: 'First message settings updated successfully',
            welcomeMessage,
            project,
            step1: updatedStep1,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to update first message' });
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
//# sourceMappingURL=aiChat.controller.js.map