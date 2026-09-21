import mongoose from "mongoose";

const evidenceSchema = new mongoose.Schema(
  {
    evidenceId: { type: Number, index: true },
    caseId: { type: String, required: true, index: true },
    cid: { type: String, required: true },
    description: { type: String },
    fileType: { type: String },
    fileSize: { type: Number },
    registeredBy: { type: String, required: true, lowercase: true },
    txHash: { type: String },
    status: {
      type: String,
      enum: ["pending-chain", "confirmed", "verified", "flagged"],
      default: "pending-chain"
    }
  },
  { timestamps: true }
);

evidenceSchema.index({ description: "text", fileType: "text" });

export default mongoose.model("Evidence", evidenceSchema);
