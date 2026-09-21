import { Request, Response } from 'express';
import BotFlow, { FlowOption } from '../models/botFlow.model';

const DEFAULT_SEEDED_STEPS = [
  {
    stepOrder: 1,
    stepKey: 'property_interest',
    question: 'Which property type interests you?',
    options: [
      {
        id: '2bhk',
        title: '2BHK Apartment',
        detailText: '2BHK Apartments start from ₹45L, 900-1100 sq.ft, available in prime locations.',
      },
      {
        id: '3bhk',
        title: '3BHK Apartment',
        detailText: '3BHK Apartments start from ₹75L, 1400-1700 sq.ft with modern amenities.',
      },
      {
        id: 'villa',
        title: 'Luxury Villa',
        detailText: 'Luxury Villas start from ₹1.2Cr, 2400+ sq.ft with private garden.',
      },
      {
        id: 'plot',
        title: 'Residential Plot',
        detailText: 'Gated community residential plots starting from ₹25L.',
      },
    ],
    isActive: true,
  },
  {
    stepOrder: 2,
    stepKey: 'budget_range',
    question: "What is your budget range?",
    options: [
      { id: 'under_50l', title: 'Under ₹50 Lakhs' },
      { id: '50l_1cr', title: '₹50 Lakhs - ₹1 Crore' },
      { id: 'above_1cr', title: 'Above ₹1 Crore' },
    ],
    isActive: true,
  },
];

// GET /api/bot-flow
export async function getBotFlow(req: Request, res: Response): Promise<void> {
  try {
    let steps = await BotFlow.find().sort({ stepOrder: 1 }).lean();

    // Auto-seed if empty so system works immediately
    if (!steps || steps.length === 0) {
      await BotFlow.insertMany(DEFAULT_SEEDED_STEPS);
      steps = await BotFlow.find().sort({ stepOrder: 1 }).lean();
    }

    res.json(steps);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch bot flow steps',
      error: (err as Error).message,
    });
  }
}

// POST /api/bot-flow
export async function createBotFlowStep(req: Request, res: Response): Promise<void> {
  try {
    const { question, options, stepOrder, isActive } = req.body;

    if (!question || !question.trim()) {
      res.status(400).json({ message: 'Question text is required' });
      return;
    }

    if (!Array.isArray(options) || options.length === 0) {
      res.status(400).json({ message: 'At least one option is required' });
      return;
    }

    // Sanitize options
    const sanitizedOptions: FlowOption[] = options.map((opt: any, index: number) => ({
      id: opt.id?.toString().trim() || `opt_${Date.now()}_${index + 1}`,
      title: opt.title?.toString().trim() || `Option ${index + 1}`,
      detailText: opt.detailText?.toString().trim() || '',
    }));

    let nextOrder = stepOrder;
    if (typeof nextOrder !== 'number') {
      const highest = await BotFlow.findOne().sort({ stepOrder: -1 }).lean();
      nextOrder = (highest?.stepOrder ?? 0) + 1;
    }

    const stepKey = `step_${Date.now()}`;

    const newStep = await BotFlow.create({
      stepOrder: nextOrder,
      stepKey,
      question: question.trim(),
      options: sanitizedOptions,
      isActive: isActive !== false,
    });

    res.status(201).json(newStep);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to create bot flow step',
      error: (err as Error).message,
    });
  }
}

// PUT /api/bot-flow/:id
export async function updateBotFlowStep(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { question, options, stepOrder, isActive } = req.body;

    const step = await BotFlow.findById(id);
    if (!step) {
      res.status(404).json({ message: 'Step not found' });
      return;
    }

    if (question !== undefined) step.question = question.trim();
    if (typeof stepOrder === 'number') step.stepOrder = stepOrder;
    if (typeof isActive === 'boolean') step.isActive = isActive;

    if (Array.isArray(options)) {
      if (options.length === 0) {
        res.status(400).json({ message: 'At least one option is required' });
        return;
      }
      step.options = options.map((opt: any, index: number) => ({
        id: opt.id?.toString().trim() || `opt_${Date.now()}_${index + 1}`,
        title: opt.title?.toString().trim() || `Option ${index + 1}`,
        detailText: opt.detailText?.toString().trim() || '',
      }));
    }

    await step.save();
    res.json(step);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to update bot flow step',
      error: (err as Error).message,
    });
  }
}

// DELETE /api/bot-flow/:id
export async function deleteBotFlowStep(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await BotFlow.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({ message: 'Step not found' });
      return;
    }

    // Re-index remaining steps to ensure clean 1..N order
    const remaining = await BotFlow.find().sort({ stepOrder: 1 });
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].stepOrder = i + 1;
      await remaining[i].save();
    }

    res.json({ message: 'Step deleted successfully' });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to delete bot flow step',
      error: (err as Error).message,
    });
  }
}

// POST /api/bot-flow/reorder
export async function reorderBotFlowSteps(req: Request, res: Response): Promise<void> {
  try {
    const { stepIds } = req.body;
    if (!Array.isArray(stepIds)) {
      res.status(400).json({ message: 'stepIds array is required' });
      return;
    }

    for (let i = 0; i < stepIds.length; i++) {
      await BotFlow.findByIdAndUpdate(stepIds[i], { stepOrder: i + 1 });
    }

    const updated = await BotFlow.find().sort({ stepOrder: 1 }).lean();
    res.json(updated);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to reorder steps',
      error: (err as Error).message,
    });
  }
}
