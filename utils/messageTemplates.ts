// utils/messageTemplates.ts

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
    const Template = (await import('../models/template.model')).default;
    let tmpl = await Template.findOne({ isDefault: true }).lean();

    if (!tmpl) {
      tmpl = await Template.findOne({ name: { $in: ['default', 'welcome', 'default_welcome'] } }).lean();
    }

    if (tmpl && tmpl.bodyText) {
      const vars: Record<string, string> = {
        '1': lead?.fullName || 'there',
        '2': (lead?.projectId && (lead.projectId as any).name) || 'our properties',
        '3': lead?.whatIsYourBudget || '',
        name: lead?.fullName || 'there',
        leadName: lead?.fullName || 'there',
        phone: lead?.phone || '',
        email: lead?.email || '',
        project: (lead?.projectId && (lead.projectId as any).name) || 'our properties',
        budget: lead?.whatIsYourBudget || '',
        timeline: lead?.whenAreYouPlanningToPurchase || '',
      };

      // Also map variables array if template uses indexed variables ({{1}}, {{2}}...)
      if (Array.isArray(tmpl.variables)) {
        tmpl.variables.forEach((vName, idx) => {
          const varIndex = String(idx + 1);
          if (vName === 'name' || vName === 'fullName') vars[varIndex] = lead?.fullName || 'there';
          else if (vName === 'project' || vName === 'propertyName') vars[varIndex] = (lead?.projectId && (lead.projectId as any).name) || 'our properties';
          else if (vName === 'budget') vars[varIndex] = lead?.whatIsYourBudget || '';
          else if (vName === 'phone') vars[varIndex] = lead?.phone || '';
        });
      }

      return resolveTemplateText(tmpl.bodyText, vars);
    }
  } catch (err) {
    console.error('Error resolving dynamic default template:', err);
  }

  return getDefaultMessage(lead?.fullName);
};