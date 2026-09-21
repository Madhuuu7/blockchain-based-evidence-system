import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { getRoleForAddress } from "../services/blockchainService.js";

/**
 * Verifies the session JWT (issued after wallet-signature verification in
 * /api/auth/verify). Attaches req.wallet (lowercase address) to the request.
 * This is NOT authorization by itself — role is re-checked per route via
 * requireRole() below, always sourced from the contract.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.wallet = payload.wallet.toLowerCase();
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session token" });
  }
}

/**
 * Re-derives the caller's role directly from the smart contract (never
 * trusts a role claim from the client or from MongoDB) and rejects the
 * request if it doesn't match one of the allowed roles.
 */
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const role = await getRoleForAddress(req.wallet);
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: `Requires one of roles [${allowedRoles.join(", ")}], caller has ${role}` });
      }
      req.role = role;
      next();
    } catch (err) {
      console.error("[auth] role check failed:", err.message);
      return res.status(503).json({ error: "Unable to verify role against the blockchain" });
    }
  };
}
