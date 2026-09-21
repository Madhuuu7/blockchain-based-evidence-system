import mongoose from "mongoose";

const caseSchema = new mongoose.Schema(
  {
    caseId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    createdBy: { type: String, required: true, lowercase: true },
    status: { type: String, enum: ["open", "under-investigation", "closed"], default: "open" }
  },
  { timestamps: true }
);

export default mongoose.model("Case", caseSchema);
