import { Types } from 'mongoose';

export interface CampaignFilters {
  source?: string;
  assignedTo?: string;
  dateFrom?: string | Date;
  dateTo?: string | Date;
}

// Minimal shape of your Lead documents, based on fields referenced by your api.ts.
export interface LeadLike {
  _id: Types.ObjectId;
  fullName?: string;
  name?: string;
  phone: string;
  status?: string;
  source?: string;
  assignedTo?: string;
  property?: string;
  propertyInterest?: string;
  extraFields?: Record<string, unknown>;
  followUp?: { active?: boolean };
  createdAt?: Date;
}