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
    // Where the bytes actually ended up. "pinata" means replicated on the IPFS
    // network; "local-cache" means this server holds the only copy, which is
    // a materially weaker guarantee than the architecture claims and so is
    // recorded rather than assumed.
    storage: {
      type: String,
      enum: ["pinata", "local-cache"],
      default: "pinata"
    },
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
