import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    walletAddress: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String },
    badgeId: { type: String },
    // Cached for fast UI reads only — NEVER used as the source of truth for
    // authorization. Every sensitive action re-checks contract.getRole().
    roleCache: {
      type: String,
      enum: ["NONE", "ADMIN", "OFFICER", "INVESTIGATOR", "JUDICIARY"],
      default: "NONE"
    },
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
