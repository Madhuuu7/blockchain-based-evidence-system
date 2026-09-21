import mongoose from "mongoose";

const authNonceSchema = new mongoose.Schema(
  {
    walletAddress: { type: String, required: true, lowercase: true, index: true },
    nonce: { type: String, required: true },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

authNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("AuthNonce", authNonceSchema);
