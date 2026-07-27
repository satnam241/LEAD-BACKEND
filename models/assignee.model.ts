// models/assignee.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IAssignee extends Document {
  name: string;
  createdAt?: Date;
}

const AssigneeSchema = new Schema<IAssignee>(
  {
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

AssigneeSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

export default mongoose.model<IAssignee>("Assignee", AssigneeSchema);