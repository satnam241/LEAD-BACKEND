"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectFacts = getProjectFacts;
exports.parsePriceToLakhs = parsePriceToLakhs;
exports.findDirectFaqAnswer = findDirectFaqAnswer;
exports.findCrossSellProject = findCrossSellProject;
exports.getDynamicPortfolioCatalogue = getDynamicPortfolioCatalogue;
const project_model_1 = __importDefault(require("../models/project.model"));
async function getProjectFacts(projectId, userMessage) {
    const project = await project_model_1.default.findById(projectId).lean();
    if (!project || !project.isActive) {
        return '';
    }
    const lines = [];
    // Core Fact Sheet
    lines.push(`PROJECT: ${project.name}`);
    if (project.developer)
        lines.push(`DEVELOPER: ${project.developer}`);
    if (project.location)
        lines.push(`LOCATION: ${project.location}`);
    if (project.priceRange)
        lines.push(`PRICE RANGE: ${project.priceRange}`);
    if (project.possession)
        lines.push(`POSSESSION: ${project.possession}`);
    if (project.reraNumber)
        lines.push(`RERA: ${project.reraNumber}`);
    if (project.paymentPlan)
        lines.push(`PAYMENT PLAN: ${project.paymentPlan}`);
    if (project.siteVisitInfo)
        lines.push(`SITE VISIT: ${project.siteVisitInfo}`);
    if (project.currentOffers)
        lines.push(`OFFERS: ${project.currentOffers}`);
    if (project.summary)
        lines.push(`SUMMARY: ${project.summary}`);
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
    let selectedFaqs = [];
    if (userMessage && userMessage.trim()) {
        const tokens = userMessage.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        // Score FAQs based on token matches in question, answer, and keywords
        const scoredFaqs = faqs.map(faq => {
            let score = 0;
            const qLower = faq.question.toLowerCase();
            const aLower = faq.answer.toLowerCase();
            const kwLower = (faq.keywords || []).map(k => k.toLowerCase());
            for (const token of tokens) {
                if (qLower.includes(token))
                    score += 3;
                if (kwLower.some(k => k.includes(token)))
                    score += 4;
                if (aLower.includes(token))
                    score += 1;
            }
            return { faq, score };
        });
        scoredFaqs.sort((a, b) => b.score - a.score);
        selectedFaqs = scoredFaqs.slice(0, 10).map(s => s.faq);
    }
    else {
        selectedFaqs = faqs.slice(0, 10);
    }
    if (selectedFaqs.length > 0) {
        lines.push('FAQS:');
        for (const f of selectedFaqs) {
            lines.push(`Q: ${f.question} | A: ${f.answer}`);
        }
    }
    const rawFacts = lines.join('\n');
    // Cap at ~3500 characters
    if (rawFacts.length > 3500) {
        return rawFacts.slice(0, 3490) + '...';
    }
    return rawFacts;
}
/**
 * Parses price text (e.g. "50 Lakhs", "1.2 Cr", "75L") into numeric Lakhs
 */
function parsePriceToLakhs(str) {
    if (!str)
        return null;
    const matchCr = str.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)/i);
    if (matchCr)
        return parseFloat(matchCr[1]) * 100;
    const matchLakh = str.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l\b)/i);
    if (matchLakh)
        return parseFloat(matchLakh[1]);
    return null;
}
/**
 * Matches user query against trained FAQs, keywords, and core project attributes
 * Returns exact verified answer if match confidence is high, or null.
 */
function findDirectFaqAnswer(project, userMessage) {
    if (!project || !userMessage || !userMessage.trim())
        return null;
    const rawLower = userMessage.toLowerCase().trim();
    const cleanMsg = rawLower.replace(/[^\w\s\u0900-\u097F]/gi, ' ');
    const tokens = cleanMsg.split(/\s+/).filter(t => t.length >= 2);
    // 1. Check trained FAQs in project
    const faqs = project.faqs || [];
    let bestFaq = null;
    let highestScore = 0;
    for (const faq of faqs) {
        let score = 0;
        const qLower = (faq.question || '').toLowerCase().trim();
        const aLower = (faq.answer || '').toLowerCase().trim();
        const keywords = (faq.keywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean);
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
            if (qLower.includes(token))
                score += 3;
            if (keywords.some(kw => kw.includes(token)))
                score += 4;
            if (aLower.includes(token))
                score += 1;
        }
        if (score > highestScore) {
            highestScore = score;
            bestFaq = faq;
        }
    }
    // If trained FAQ match has confidence (score >= 4), return its answer directly
    if (bestFaq && highestScore >= 4 && bestFaq.answer && bestFaq.answer.trim()) {
        return bestFaq.answer.trim();
    }
    // 2. Intelligent Conversational & Small-Talk Handling (Weather, Small Talk, Bot Identity, Off-topic)
    if (/\b(weather|mausam|temperature|forecast|baarish|rain|garmi|thand|cold|hot today)\b/i.test(rawLower)) {
        return `Haha, main weather forecast toh nahi bata sakta kyunki main *${project?.name || 'Property'}* ka Real Estate Advisor hoon! 🌤️ Lekin agar aap yahan plots ki location, pricing ya sample flat visit ke baare mein jaanna chahte hain, toh main zaroor guide kar sakta hoon. Kya aap location ya plot sizes explore karna chahenge?`;
    }
    if (/\b(kaise ho|how are you|kya haal|kya chal raha|sab theek|sab kaisa hai|kese ho)\b/i.test(rawLower)) {
        return `Main bilkul badhiya hoon, thank you! 😊 Aasha hai aap bhi ache honge. Main *${project?.name || 'is project'}* ke regarding aapki kya madad kar sakta hoon? Kya aap pricing ya plot sizes dekhna chahenge?`;
    }
    if (/\b(who are you|tum kaun ho|aap kaun ho|kya naam hai|bot ho|robot ho|ai ho|kya tum ai ho)\b/i.test(rawLower)) {
        return `Main *${project?.name || 'Property Advisory'}* ka dedicated Property Consultant hoon 🏡 Main aapko is project ki live pricing, plot layouts, location aur site visit arrange karne mein guide karta hoon. Aap is property mein kya explore karna chahenge?`;
    }
    if (/\b(thanks|thank you|shukriya|dhanyawad)\b/i.test(rawLower)) {
        return `Most welcome! 🤝 Agar *${project?.name || 'is property'}* ke regarding koi bhi sawal ho ya site visit plan karni ho, toh zaroor batayein.`;
    }
    if (/\b(joke|jokes|gana|song|movie|film|cricket|match|modi|politics)\b/i.test(rawLower)) {
        return `Haha, mera poora focus toh aapko *${project?.name || 'hamare project'}* mein best property dilwane par hai! 🏡 Kya hum pricing ya site visit ke baare mein baat karein?`;
    }
    // 3. Attribute-based intelligent matching (Price, Location, Possession, Sizes)
    const isAskingPrice = ['price', 'rate', 'budget', 'cost', 'kitne', 'kimat', 'amount', 'pricing', 'lakh', 'cr', 'bhav', 'paisa', 'costing'].some(w => rawLower.includes(w));
    if (isAskingPrice && project.priceRange) {
        let priceReply = `The price range for *${project.name}* is *${project.priceRange}*.`;
        if (project.unitTypes && project.unitTypes.length > 0) {
            const unitDetails = project.unitTypes
                .filter((u) => u.priceFrom)
                .map((u) => `• ${u.type}: Starting from ${u.priceFrom}${u.sizeSqft ? ` (${u.sizeSqft})` : ''}`)
                .join('\n');
            if (unitDetails)
                priceReply += `\n\n${unitDetails}`;
        }
        return priceReply;
    }
    const isAskingLocation = ['location', 'address', 'kahan', 'kahape', 'sector', 'road', 'where', 'situated', 'landmark', 'pataa', 'site kahan'].some(w => rawLower.includes(w));
    if (isAskingLocation && project.location) {
        return `*${project.name}* is located at *${project.location}*.\nWould you like more details on nearby connectivity or a site visit?`;
    }
    const isAskingPossession = ['possession', 'ready', 'move in', 'construction', 'timeline', 'kab tak', 'delivery', 'handover', 'completion'].some(w => rawLower.includes(w));
    if (isAskingPossession && project.possession) {
        return `The possession timeline for *${project.name}* is *${project.possession}*.`;
    }
    const isAskingSizes = ['size', 'sqft', 'sq.ft', 'units', 'flat', 'apartment', 'bhk', 'configuration', 'space', 'layouts'].some(w => rawLower.includes(w));
    if (isAskingSizes && project.unitTypes && project.unitTypes.length > 0) {
        const unitList = project.unitTypes
            .map((u) => `• *${u.type}*${u.sizeSqft ? ` — Space: ${u.sizeSqft}` : ''}${u.priceFrom ? ` — Rate: ${u.priceFrom}` : ''}`)
            .join('\n');
        return `Available configurations at *${project.name}*:\n\n${unitList}\n\nWhich configuration best suits your requirement?`;
    }
    return null;
}
/**
 * Cross-Selling Budget Engine:
 * Finds another active project from the portfolio if the buyer's budget is lower than current project
 */
async function findCrossSellProject(currentProjectId, budgetStr) {
    try {
        const budgetLakhs = parsePriceToLakhs(budgetStr);
        if (!budgetLakhs)
            return null;
        const otherProjects = await project_model_1.default.find({
            _id: { $ne: currentProjectId },
            isActive: true,
        }).lean();
        for (const proj of otherProjects) {
            const projPriceLakhs = parsePriceToLakhs(proj.priceRange || '');
            if (projPriceLakhs && projPriceLakhs <= budgetLakhs * 1.2) {
                return proj;
            }
            if (proj.unitTypes && proj.unitTypes.length > 0) {
                for (const u of proj.unitTypes) {
                    const uPrice = parsePriceToLakhs(u.priceFrom || '');
                    if (uPrice && uPrice <= budgetLakhs * 1.2) {
                        return proj;
                    }
                }
            }
        }
    }
    catch (err) {
        console.error('Error finding cross-sell project:', err);
    }
    return null;
}
/**
 * Dynamically queries all active properties from MongoDB to provide a live portfolio catalogue
 * NO static / hardcoded data - everything loaded directly from database.
 */
async function getDynamicPortfolioCatalogue(excludeProjectId) {
    const query = { isActive: true };
    if (excludeProjectId) {
        query._id = { $ne: excludeProjectId };
    }
    const projects = await project_model_1.default.find(query)
        .select('name location priceRange unitTypes developer summary')
        .lean();
    if (!projects || projects.length === 0) {
        return 'No other active properties currently available in the database.';
    }
    const lines = [];
    for (const p of projects) {
        const spaces = (p.unitTypes || [])
            .map(u => `${u.type}${u.sizeSqft ? ` (Space: ${u.sizeSqft})` : ''}${u.priceFrom ? ` (Rate: ${u.priceFrom})` : ''}`)
            .join(', ');
        lines.push(`• Project: "${p.name}"\n  📍 Location: ${p.location || 'Available on request'}\n  📐 Space/Units: ${spaces || 'Unit space details on request'}\n  💰 Rate/Price Range: ${p.priceRange || 'Available on request'}`);
    }
    return lines.join('\n\n');
}
//# sourceMappingURL=projectKnowledgeService.js.map