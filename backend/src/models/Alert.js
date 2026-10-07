import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        // Raised from on-chain events by the event listener.
        "AccessDenied",
        // Raised by verifyEvidence when content no longer matches the chain.
        "IntegrityViolation",
        // Raised at sign-in: a bad signature, a replayed or expired nonce, or
        // a wallet that proved ownership but holds no role on the contract.
        "LoginDenied",
        // Raised when an authenticated session calls an endpoint its role is
        // not permitted to use.
        "UnauthorizedApi"
      ],
      required: true
    },
    walletAddress: { type: String, lowercase: true },
    evidenceId: { type: Number },
    txHash: { type: String },
    // The endpoint involved, for the two API-side alert types.
    route: { type: String },
    message: { type: String, required: true },
    // How many times this same event has repeated inside the grouping window.
    // Someone probing the login endpoint produces one alert with a rising
    // count rather than thousands of rows that bury everything else.
    occurrences: { type: Number, default: 1 },
    lastSeenAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Supports the grouping lookup in securityAlertService.
alertSchema.index({ type: 1, walletAddress: 1, resolved: 1, lastSeenAt: -1 });

export default mongoose.model("Alert", alertSchema);
