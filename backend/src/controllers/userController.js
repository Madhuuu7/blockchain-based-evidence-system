import User from "../models/User.js";
import { getRoleForAddress } from "../services/blockchainService.js";

// GET /api/users — ADMIN only. Role shown is re-verified live from chain
// for each user rather than trusting the cached value, since roleCache can
// drift if a role was changed directly on-chain by another admin.
export async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort("-createdAt").limit(200);
    const withLiveRole = await Promise.all(
      users.map(async (u) => {
        const liveRole = await getRoleForAddress(u.walletAddress).catch(() => u.roleCache);
        return { ...u.toObject(), liveRole };
      })
    );
    res.json({ results: withLiveRole });
  } catch (err) {
    next(err);
  }
}

// POST /api/users/role — this endpoint only updates the MongoDB cache
// label AFTER the admin has already called assignRole()/removeRole() on
// the contract from the frontend (via MetaMask). It never grants roles
// itself — the contract is the only place roles are actually set.
export async function syncUserRole(req, res, next) {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });

    const liveRole = await getRoleForAddress(walletAddress);
    const user = await User.findOneAndUpdate(
      { walletAddress: walletAddress.toLowerCase() },
      { roleCache: liveRole },
      { upsert: true, new: true }
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
}
