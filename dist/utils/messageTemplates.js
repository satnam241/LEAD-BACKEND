"use strict";
// utils/messageTemplates.ts
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResolvedDefaultMessage = exports.resolveTemplateText = exports.getDefaultMessage = void 0;
const getDefaultMessage = (leadName) => {
    return `Hi ${leadName || "there"}, 👋

Thank you for showing interest in our properties.

We’ve successfully received your request, and one of our Senior Property Advisors will connect with you shortly to assist you with details, pricing, and site visits.

In the meantime, feel free to reply to this message if you have any questions — we are here to help!

Warm regards,  
🏡 Real Estate Advisory Team`;
};
exports.getDefaultMessage = getDefaultMessage;
/**
 * Replaces placeholders like {{1}}, {{2}} or {{name}}, {{project}}, {{budget}}, {{phone}}
 */
const resolveTemplateText = (templateText, vars) => {
    if (!templateText)
        return '';
    let result = templateText;
    for (const [key, val] of Object.entries(vars)) {
        // Matches {{key}}, {{ key }}, etc.
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        result = result.replace(regex, val || '');
    }
    return result.trim();
};
exports.resolveTemplateText = resolveTemplateText;
/**
 * Fetches dynamic default template from MongoDB (configured by admin)
 * Falls back to getDefaultMessage if no custom default template is set.
 */
const getResolvedDefaultMessage = async (lead) => {
    try {
        const Template = (await Promise.resolve().then(() => __importStar(require('../models/template.model')))).default;
        let tmpl = await Template.findOne({ isDefault: true }).lean();
        if (!tmpl) {
            tmpl = await Template.findOne({ name: { $in: ['default', 'welcome', 'default_welcome'] } }).lean();
        }
        if (tmpl && tmpl.bodyText) {
            const vars = {
                '1': lead?.fullName || 'there',
                '2': (lead?.projectId && lead.projectId.name) || 'our properties',
                '3': lead?.whatIsYourBudget || '',
                name: lead?.fullName || 'there',
                leadName: lead?.fullName || 'there',
                phone: lead?.phone || '',
                email: lead?.email || '',
                project: (lead?.projectId && lead.projectId.name) || 'our properties',
                budget: lead?.whatIsYourBudget || '',
                timeline: lead?.whenAreYouPlanningToPurchase || '',
            };
            // Also map variables array if template uses indexed variables ({{1}}, {{2}}...)
            if (Array.isArray(tmpl.variables)) {
                tmpl.variables.forEach((vName, idx) => {
                    const varIndex = String(idx + 1);
                    if (vName === 'name' || vName === 'fullName')
                        vars[varIndex] = lead?.fullName || 'there';
                    else if (vName === 'project' || vName === 'propertyName')
                        vars[varIndex] = (lead?.projectId && lead.projectId.name) || 'our properties';
                    else if (vName === 'budget')
                        vars[varIndex] = lead?.whatIsYourBudget || '';
                    else if (vName === 'phone')
                        vars[varIndex] = lead?.phone || '';
                });
            }
            return (0, exports.resolveTemplateText)(tmpl.bodyText, vars);
        }
    }
    catch (err) {
        console.error('Error resolving dynamic default template:', err);
    }
    return (0, exports.getDefaultMessage)(lead?.fullName);
};
exports.getResolvedDefaultMessage = getResolvedDefaultMessage;
//# sourceMappingURL=messageTemplates.js.map