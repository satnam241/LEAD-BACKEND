import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAssignee extends Document {
  tenantId?: Types.ObjectId | null;
  name: string;
  createdAt?: Date;
}

const AssigneeSchema = new Schema<IAssignee>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

AssigneeSchema.index(
  { tenantId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

export default mongoose.model<IAssignee>("Assignee", AssigneeSchema);
