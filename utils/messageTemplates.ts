// utils/messageTemplates.ts
import mongoose from 'mongoose';

export const getDefaultMessage = (leadName?: string): string => {
  return `Hi ${leadName || "there"}, 👋

Thank you for showing interest in our properties.

We’ve successfully received your request, and one of our Senior Property Advisors will connect with you shortly to assist you with details, pricing, and site visits.

In the meantime, feel free to reply to this message if you have any questions — we are here to help!

Warm regards,  
🏡 Real Estate Advisory Team`;
};

/**
 * Replaces placeholders like {{1}}, {{2}} or {{name}}, {{project}}, {{budget}}, {{phone}}
 */
export const resolveTemplateText = (templateText: string, vars: Record<string, string>): string => {
  if (!templateText) return '';
  let result = templateText;

  for (const [key, val] of Object.entries(vars)) {
    // Matches {{key}}, {{ key }}, etc.
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, val || '');
  }

  return result.trim();
};

/**
 * Fetches dynamic default template from MongoDB (configured by admin)
 * Falls back to getDefaultMessage if no custom default template is set.
 */
export const getResolvedDefaultMessage = async (lead?: any): Promise<string> => {
  try {
    const leadName = lead?.fullName && !lead.fullName.startsWith('WhatsApp Lead') ? lead.fullName.trim() : '';

    // Resolve project details if available
    let projectDoc: any = lead?.project || lead?.projectId;
    if (projectDoc && (typeof projectDoc === 'string' || projectDoc instanceof mongoose.Types.ObjectId)) {
      const Project = (await import('../models/project.model')).default;
      projectDoc = await Project.findById(projectDoc).select('name location priceRange welcomeMessage').lean();
    }
    const projName = projectDoc?.name || 'our prime properties';
    const projLocation = projectDoc?.location || '';
    const projPrice = projectDoc?.priceRange || '';

    // 1. Highest Priority: Project-specific welcome message if configured by Admin
    if (projectDoc?.welcomeMessage && projectDoc.welcomeMessage.trim()) {
      return projectDoc.welcomeMessage.trim()
        .replace(/{{name}}/gi, leadName || 'there')
        .replace(/{{leadName}}/gi, leadName || 'there')
        .replace(/{{project}}/gi, projName)
        .replace(/{{projectName}}/gi, projName)
        .replace(/{{location}}/gi, projLocation)
        .replace(/{{price}}/gi, projPrice)
        .trim();
    }

    // 2. Second Priority: Universal First Message configured by Admin for ALL leads
    const { getGlobalWelcomeMessage } = await import('../services/botSettingService');
    const globalMsg = await getGlobalWelcomeMessage();
    if (globalMsg && globalMsg.trim()) {
      return globalMsg
        .replace(/{{name}}/gi, leadName || 'there')
        .replace(/{{leadName}}/gi, leadName || 'there')
        .replace(/{{project}}/gi, projName)
        .replace(/{{projectName}}/gi, projName)
        .replace(/{{location}}/gi, projLocation)
        .replace(/{{price}}/gi, projPrice)
        .trim();
    }

    // 3. Third Priority: Template marked as default in templates collection
    const Template = (await import('../models/template.model')).default;
    let tmpl = await Template.findOne({ isDefault: true }).lean();

    if (!tmpl) {
      tmpl = await Template.findOne({ name: { $in: ['default', 'welcome', 'default_welcome'] } }).lean();
    }

    if (tmpl && tmpl.bodyText) {
      const vars: Record<string, string> = {
        '1': leadName || 'there',
        '2': projName,
        '3': lead?.whatIsYourBudget || '',
        name: leadName || 'there',
        leadName: leadName || 'there',
        phone: lead?.phone || '',
        email: lead?.email || '',
        project: projName,
        projectName: projName,
        location: projLocation,
        price: projPrice,
        budget: lead?.whatIsYourBudget || '',
        timeline: lead?.whenAreYouPlanningToPurchase || '',
      };

      if (Array.isArray(tmpl.variables)) {
        tmpl.variables.forEach((vName, idx) => {
          const varIndex = String(idx + 1);
          if (vName === 'name' || vName === 'fullName') vars[varIndex] = leadName || 'there';
          else if (vName === 'project' || vName === 'propertyName') vars[varIndex] = projName;
          else if (vName === 'budget') vars[varIndex] = lead?.whatIsYourBudget || '';
          else if (vName === 'phone') vars[varIndex] = lead?.phone || '';
        });
      }

      return resolveTemplateText(tmpl.bodyText, vars);
    }
  } catch (err) {
    console.error('Error resolving dynamic default template:', err);
  }

  const fallbackLeadName = lead?.fullName && !lead.fullName.startsWith('WhatsApp Lead') ? lead.fullName.trim() : '';
  return getDefaultMessage(fallbackLeadName);
};