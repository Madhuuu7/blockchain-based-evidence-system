import mongoose from "mongoose";

const accessLogSchema = new mongoose.Schema(
  {
    evidenceId: { type: Number, required: true, index: true },
    walletAddress: { type: String, required: true, lowercase: true },
    action: { type: String, enum: ["view", "verify", "transfer"], required: true },
    txHash: { type: String },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model("AccessLog", accessLogSchema);
