import mongoose from 'mongoose';
import Project, { IProject, IProjectFAQ } from '../models/project.model';

export async function getProjectFacts(
  projectId: string | mongoose.Types.ObjectId,
  userMessage?: string
): Promise<string> {
  const project = await Project.findById(projectId).lean();
  if (!project || !project.isActive) {
    return '';
  }

  const lines: string[] = [];

  // Core Fact Sheet
  lines.push(`PROJECT: ${project.name}`);
  if (project.developer) lines.push(`DEVELOPER: ${project.developer}`);
  if (project.location) lines.push(`LOCATION: ${project.location}`);
  if (project.priceRange) lines.push(`PRICE RANGE: ${project.priceRange}`);
  if (project.possession) lines.push(`POSSESSION: ${project.possession}`);
  if (project.reraNumber) lines.push(`RERA: ${project.reraNumber}`);
  if (project.paymentPlan) lines.push(`PAYMENT PLAN: ${project.paymentPlan}`);
  if (project.siteVisitInfo) lines.push(`SITE VISIT: ${project.siteVisitInfo}`);
  if (project.currentOffers) lines.push(`OFFERS: ${project.currentOffers}`);
  if (project.summary) lines.push(`SUMMARY: ${project.summary}`);

  // Unit Types & Space (Sizes)
  if (project.unitTypes && project.unitTypes.length > 0) {
    const units = project.unitTypes
      .map(u => `${u.type}${u.sizeSqft ? ` [Space: ${u.sizeSqft}]` : ''}${u.priceFrom ? ` [Rate: From ${u.priceFrom}]` : ''}`)
      .join('; ');
    lines.push(`UNITS & SPACES: ${units}`);
  }

  // Amenities
  if (project.amenities && project.amenities.length > 0) {
    lines.push(`AMENITIES: ${project.amenities.join(', ')}`);
  }

  // Strict restrictions (Do Not Say)
  if (project.doNotSay && project.doNotSay.length > 0) {
    lines.push(`DO NOT SAY: ${project.doNotSay.join('; ')}`);
  }

  // Top 3 relevant FAQs
  const faqs = project.faqs || [];
  let selectedFaqs: IProjectFAQ[] = [];

  if (userMessage && userMessage.trim()) {
    const tokens = userMessage.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    // Score FAQs based on token matches in question, answer, and keywords
    const scoredFaqs = faqs.map(faq => {
      let score = 0;
      const qLower = faq.question.toLowerCase();
      const aLower = faq.answer.toLowerCase();
      const kwLower = (faq.keywords || []).map(k => k.toLowerCase());

      for (const token of tokens) {
        if (qLower.includes(token)) score += 3;
        if (kwLower.some(k => k.includes(token))) score += 4;
        if (aLower.includes(token)) score += 1;
      }
      return { faq, score };
    });

    scoredFaqs.sort((a, b) => b.score - a.score);
    selectedFaqs = scoredFaqs.slice(0, 3).map(s => s.faq);
  } else {
    selectedFaqs = faqs.slice(0, 3);
  }

  if (selectedFaqs.length > 0) {
    lines.push('FAQS:');
    for (const f of selectedFaqs) {
      lines.push(`Q: ${f.question} | A: ${f.answer}`);
    }
  }

  const rawFacts = lines.join('\n');

  // Hard cap at ~2500 characters
  if (rawFacts.length > 2500) {
    return rawFacts.slice(0, 2490) + '...';
  }

  return rawFacts;
}

/**
 * Matches user query against trained FAQs, keywords, and core project attributes
 * Returns exact verified answer if match confidence is high, or null.
 */
export function findDirectFaqAnswer(project: any, userMessage: string): string | null {
  if (!project || !userMessage || !userMessage.trim()) return null;

  const rawLower = userMessage.toLowerCase().trim();
  const cleanMsg = rawLower.replace(/[^\w\s\u0900-\u097F]/gi, ' ');
  const tokens = cleanMsg.split(/\s+/).filter(t => t.length >= 3);

  // 1. Check trained FAQs in project
  const faqs = project.faqs || [];
  let bestFaq: any = null;
  let highestScore = 0;

  for (const faq of faqs) {
    let score = 0;
    const qLower = (faq.question || '').toLowerCase().trim();
    const aLower = (faq.answer || '').toLowerCase().trim();
    const keywords: string[] = (faq.keywords || []).map((k: string) => k.toLowerCase().trim()).filter(Boolean);

    // Exact or phrase match with question
    if (rawLower.includes(qLower) || qLower.includes(rawLower)) {
      score += 15;
    }

    // Keyword matches (very high priority!)
    for (const kw of keywords) {
      if (rawLower.includes(kw) || cleanMsg.includes(kw)) {
        score += 8;
      }
    }

    // Token overlap
    for (const token of tokens) {
      if (qLower.includes(token)) score += 3;
      if (keywords.some(kw => kw.includes(token))) score += 4;
      if (aLower.includes(token)) score += 1;
    }

    if (score > highestScore) {
      highestScore = score;
      bestFaq = faq;
    }
  }

  // If trained FAQ match has strong confidence (score >= 6), return its answer directly
  if (bestFaq && highestScore >= 6 && bestFaq.answer && bestFaq.answer.trim()) {
    return bestFaq.answer.trim();
  }

  // 2. Attribute-based intelligent matching (Price, Location, Possession, Sizes)
  const isAskingPrice = ['price', 'rate', 'budget', 'cost', 'kitne', 'kimat', 'amount', 'pricing', 'lakh', 'cr'].some(w => rawLower.includes(w));
  if (isAskingPrice && project.priceRange) {
    let priceReply = `The price range for *${project.name}* is *${project.priceRange}*.`;
    if (project.unitTypes && project.unitTypes.length > 0) {
      const unitDetails = project.unitTypes
        .filter((u: any) => u.priceFrom)
        .map((u: any) => `• ${u.type}: Starting from ${u.priceFrom}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`)
        .join('\n');
      if (unitDetails) priceReply += `\n\n${unitDetails}`;
    }
    return priceReply;
  }

  const isAskingLocation = ['location', 'address', 'kahan', 'kahape', 'sector', 'road', 'where', 'situated'].some(w => rawLower.includes(w));
  if (isAskingLocation && project.location) {
    return `*${project.name}* is located at *${project.location}*.\nWould you like more details on nearby connectivity or a site visit?`;
  }

  const isAskingPossession = ['possession', 'ready', 'move in', 'construction', 'timeline', 'kab tak', 'delivery', 'handover'].some(w => rawLower.includes(w));
  if (isAskingPossession && project.possession) {
    return `The possession timeline for *${project.name}* is *${project.possession}*.`;
  }

  const isAskingSizes = ['size', 'sqft', 'sq.ft', 'units', 'flat', 'apartment', 'bhk', 'configuration'].some(w => rawLower.includes(w));
  if (isAskingSizes && project.unitTypes && project.unitTypes.length > 0) {
    const unitList = project.unitTypes
      .map((u: any) => `• *${u.type}*${u.sizeSqft ? ` — Space: ${u.sizeSqft}` : ''}${u.priceFrom ? ` — Rate: ${u.priceFrom}` : ''}`)
      .join('\n');
    return `Available configurations at *${project.name}*:\n\n${unitList}\n\nWhich configuration best suits your requirement?`;
  }

  return null;
}

/**
 * Dynamically queries all active properties from MongoDB to provide a live portfolio catalogue
 * NO static / hardcoded data - everything loaded directly from database.
 */
export async function getDynamicPortfolioCatalogue(
  excludeProjectId?: string | mongoose.Types.ObjectId
): Promise<string> {
  const query: any = { isActive: true };
  if (excludeProjectId) {
    query._id = { $ne: excludeProjectId };
  }

  const projects = await Project.find(query)
    .select('name location priceRange unitTypes developer summary')
    .lean();

  if (!projects || projects.length === 0) {
    return 'No other active properties currently available in the database.';
  }

  const lines: string[] = [];
  for (const p of projects) {
    const spaces = (p.unitTypes || [])
      .map(u => `${u.type}${u.sizeSqft ? ` (Space: ${u.sizeSqft})` : ''}${u.priceFrom ? ` (Rate: ${u.priceFrom})` : ''}`)
      .join(', ');

    lines.push(
      `• Project: "${p.name}"\n  📍 Location: ${p.location || 'Available on request'}\n  📐 Space/Units: ${
        spaces || 'Unit space details on request'
      }\n  💰 Rate/Price Range: ${p.priceRange || 'Available on request'}`
    );
  }

  return lines.join('\n\n');
}
