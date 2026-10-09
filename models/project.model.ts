import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUnitType {
  type: string;        // e.g. "2 BHK", "3 BHK", "Villa", "Plot"
  sizeSqft: string;    // e.g. "1150 - 1300 sq.ft."
  priceFrom: string;   // e.g. "₹55 Lakhs"
}

export interface IProjectFAQ {
  question: string;
  answer: string;
  keywords: string[];
}

export interface IProject extends Document {
  name: string;
  slug: string;
  keywords: string[];
  summary: string;
  location: string;
  developer: string;
  priceRange: string;
  unitTypes: IUnitType[];
  amenities: string[];
  possession: string;
  reraNumber: string;
  paymentPlan: string;
  siteVisitInfo: string;
  currentOffers: string;
  doNotSay: string[];
  faqs: IProjectFAQ[];
  welcomeMessage?: string;
  images?: string[];
  videos?: string[];
  map?: string;
  brochure?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UnitTypeSchema = new Schema<IUnitType>(
  {
    type: { type: String, required: true, trim: true },
    sizeSqft: { type: String, default: '', trim: true },
    priceFrom: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const ProjectFAQSchema = new Schema<IProjectFAQ>(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
    keywords: [{ type: String, trim: true }],
  },
  { _id: false }
);

const ProjectSchema = new Schema<IProject>(
  {
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
  },
  { timestamps: true }
);

// Text index for keyword and FAQ search
ProjectSchema.index(
  {
    name: 'text',
    keywords: 'text',
    summary: 'text',
    'faqs.question': 'text',
    'faqs.answer': 'text',
    'faqs.keywords': 'text',
  },
  {
    weights: {
      name: 10,
      keywords: 8,
      'faqs.question': 6,
      'faqs.keywords': 5,
      'faqs.answer': 3,
      summary: 2,
    },
    name: 'project_text_idx',
  }
);

export default mongoose.model<IProject>('Project', ProjectSchema);
