import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["AccessDenied", "IntegrityViolation"], required: true },
    walletAddress: { type: String, lowercase: true },
    evidenceId: { type: Number },
    txHash: { type: String },
    message: { type: String, required: true },
    resolved: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model("Alert", alertSchema);
