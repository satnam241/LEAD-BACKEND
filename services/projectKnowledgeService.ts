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
