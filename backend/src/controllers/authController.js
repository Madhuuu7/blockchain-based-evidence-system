import { ethers } from "ethers";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import AuthNonce from "../models/AuthNonce.js";
import User from "../models/User.js";
import { getRoleForAddress } from "../services/blockchainService.js";
import { recordSecurityAlert } from "../services/securityAlertService.js";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function requestNonce(req, res, next) {
  try {
    const { address } = req.body;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "Valid wallet address required" });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    await AuthNonce.create({
      walletAddress: address.toLowerCase(),
      nonce,
      expiresAt: new Date(Date.now() + NONCE_TTL_MS)
    });

    const message =
      `Sign in to the Blockchain Evidence System.\n\n` +
      `Wallet: ${address}\nNonce: ${nonce}\nIssued: ${new Date().toISOString()}`;

    res.json({ message });
  } catch (err) {
    next(err);
  }
}

export async function verifySignature(req, res, next) {
  try {
    const { address, signature, message } = req.body;
    if (!address || !signature || !message) {
      return res.status(400).json({ error: "address, signature, and message are required" });
    }

    // Extract the nonce back out of the signed message and confirm it's
    // a valid, unused, unexpired nonce we actually issued.
    const nonceMatch = message.match(/Nonce:\s*([a-f0-9]+)/i);
    if (!nonceMatch) {
      return res.status(400).json({ error: "Malformed sign-in message" });
    }
    const nonce = nonceMatch[1];

    const record = await AuthNonce.findOne({
      walletAddress: address.toLowerCase(),
      nonce,
      used: false,
      expiresAt: { $gt: new Date() }
    });
    if (!record) {
      // Either a nonce this server never issued, one already spent, or one
      // past its five minutes. A replayed nonce in particular means someone is
      // reusing a captured sign-in.
      await recordSecurityAlert({
        type: "LoginDenied",
        walletAddress: address,
        route: "POST /api/auth/verify",
        message:
          `Sign-in refused for ${address}: the nonce was never issued, has expired, ` +
          `or has already been used.`
      });

      return res.status(401).json({ error: "Nonce invalid, expired, or already used" });
    }

    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      // Someone claimed an address they cannot sign for. This is the
      // impersonation attempt, and it is the single most important thing on
      // this endpoint to surface.
      await recordSecurityAlert({
        type: "LoginDenied",
        walletAddress: address,
        route: "POST /api/auth/verify",
        message:
          `Sign-in refused for ${address}: the signature was produced by ${recovered}, ` +
          `not by the address claimed.`
      });

      return res.status(401).json({ error: "Signature does not match provided address" });
    }

    record.used = true;
    await record.save();

    // Role is read fresh from the contract at login time — never trusted
    // from the client.
    const role = await getRoleForAddress(address);

    if (role === "NONE") {
      // The signature was genuine, so this wallet really is who it says - it
      // simply has no role. Worth recording: an unknown wallet proving
      // ownership and probing the system is exactly what an administrator
      // should see, and nothing else in the system would report it.
      await recordSecurityAlert({
        type: "LoginDenied",
        walletAddress: address,
        route: "POST /api/auth/verify",
        message:
          `Sign-in by ${address} succeeded but the wallet holds no role on the ` +
          `contract. No access was granted.`
      });
    }

    await User.findOneAndUpdate(
      { walletAddress: address.toLowerCase() },
      { roleCache: role, lastLoginAt: new Date() },
      { upsert: true }
    );

    const token = jwt.sign({ wallet: address.toLowerCase() }, env.jwtSecret, { expiresIn: "12h" });

    res.json({ token, role, address: address.toLowerCase() });
  } catch (err) {
    next(err);
  }
}
