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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const UnitTypeSchema = new mongoose_1.Schema({
    type: { type: String, required: true, trim: true },
    sizeSqft: { type: String, default: '', trim: true },
    priceFrom: { type: String, default: '', trim: true },
}, { _id: false });
const ProjectFAQSchema = new mongoose_1.Schema({
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
    keywords: [{ type: String, trim: true }],
}, { _id: false });
const ProjectSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    keywords: [{ type: String, trim: true }],
    summary: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    developer: { type: String, default: '', trim: true },
    priceRange: { type: String, default: '', trim: true },
    unitTypes: [UnitTypeSchema],
    amenities: [{ type: String, trim: true }],
    possession: { type: String, default: '', trim: true },
    reraNumber: { type: String, default: '', trim: true },
    paymentPlan: { type: String, default: '', trim: true },
    siteVisitInfo: { type: String, default: '', trim: true },
    currentOffers: { type: String, default: '', trim: true },
    doNotSay: [{ type: String, trim: true }],
    faqs: [ProjectFAQSchema],
    welcomeMessage: { type: String, default: '', trim: true },
    images: [{ type: String, trim: true }],
    videos: [{ type: String, trim: true }],
    map: { type: String, default: '', trim: true },
    brochure: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });
// Text index for keyword and FAQ search
ProjectSchema.index({
    name: 'text',
    keywords: 'text',
    summary: 'text',
    'faqs.question': 'text',
    'faqs.answer': 'text',
    'faqs.keywords': 'text',
}, {
    weights: {
        name: 10,
        keywords: 8,
        'faqs.question': 6,
        'faqs.keywords': 5,
        'faqs.answer': 3,
        summary: 2,
    },
    name: 'project_text_idx',
});
exports.default = mongoose_1.default.model('Project', ProjectSchema);
//# sourceMappingURL=project.model.js.map