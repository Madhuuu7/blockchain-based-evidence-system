import { ethers } from "ethers";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import AuthNonce from "../models/AuthNonce.js";
import User from "../models/User.js";
import { getRoleForAddress } from "../services/blockchainService.js";

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
      return res.status(401).json({ error: "Nonce invalid, expired, or already used" });
    }

    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Signature does not match provided address" });
    }

    record.used = true;
    await record.save();

    // Role is read fresh from the contract at login time — never trusted
    // from the client.
    const role = await getRoleForAddress(address);

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
