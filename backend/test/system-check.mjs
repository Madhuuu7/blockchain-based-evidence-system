/**
 * Preflight check for a configured, running environment.
 *
 * This is deliberately NOT part of `npm test`. It asserts against the real
 * MongoDB, the real Pinata key and the real RPC endpoint, so it answers "is
 * this deployment wired up correctly" - a different question from "is the code
 * correct", which the offline suite answers without any of them.
 *
 * It used to sit in `npm test` and assert that one specific document,
 * CASE-2026-015, existed in the live Atlas cluster. That made the suite pass
 * on exactly one laptop with one database in one state, and fail for anyone
 * else who cloned the repo.
 *
 * Run it before a demo:  npm run check
 *
 * Each check reports rather than throws where it can, so one missing piece
 * does not hide the state of everything else. The exit code is non-zero if any
 * required check failed.
 */
import dns from "dns";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { env } from "../src/config/env.js";
import { recomputeCid } from "../src/services/pinataService.js";

if (process.env.DNS_SERVERS) {
  try {
    dns.setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean));
  } catch {
    /* the override is best-effort; the Mongo check below reports the result */
  }
}

const results = [];

function record(name, ok, detail, { required = true } = {}) {
  results.push({ name, ok, detail, required });
  const mark = ok ? "PASS" : required ? "FAIL" : "WARN";
  console.log(`  [${mark}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function checkCidDerivation() {
  try {
    const cid = await recomputeCid(Buffer.from("preflight"));
    record("CID derivation", /^bafkrei/.test(cid), cid);
  } catch (err) {
    record("CID derivation", false, err.message);
  }
}

async function checkMongo() {
  if (!env.mongodbUri) return record("MongoDB", false, "MONGODB_URI is not set");

  try {
    await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 15000 });
    const collections = await mongoose.connection.db.listCollections().toArray();
    record("MongoDB", true, `connected, ${collections.length} collection(s)`);
    await mongoose.disconnect();
  } catch (err) {
    record("MongoDB", false, err.message.split("\n")[0]);
  }
}

async function checkRpcAndContract() {
  if (!env.rpcUrl) return record("Ethereum RPC", false, "RPC_URL is not set");

  let provider;
  try {
    provider = new ethers.JsonRpcProvider(env.rpcUrl);
    const network = await provider.getNetwork();
    record("Ethereum RPC", true, `chainId ${network.chainId}`);
  } catch (err) {
    return record("Ethereum RPC", false, err.message.split("\n")[0]);
  }

  if (!env.contractAddress) return record("Contract", false, "CONTRACT_ADDRESS is not set");

  try {
    const code = await provider.getCode(env.contractAddress);
    record(
      "Contract deployed",
      code && code !== "0x",
      code && code !== "0x"
        ? `${env.contractAddress} (${(code.length - 2) / 2} bytes)`
        : `nothing deployed at ${env.contractAddress} on this network`
    );
  } catch (err) {
    record("Contract deployed", false, err.message.split("\n")[0]);
  }
}

async function checkPinataScope() {
  if (!env.pinataJwt) {
    return record("Pinata", false, "PINATA_JWT is not set - uploads fall back to the local cache", {
      required: false
    });
  }

  // testAuthentication only proves the key is valid. The scope that matters is
  // pinFileToIPFS, and the only honest way to check it is to pin something.
  try {
    const FormData = (await import("form-data")).default;
    const fetch = (await import("node-fetch")).default;

    const form = new FormData();
    form.append("file", Buffer.from(`preflight ${new Date().toISOString()}`), {
      filename: "preflight.txt"
    });
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.pinataJwt}`, ...form.getHeaders() },
      body: form
    });

    if (response.ok) {
      const data = await response.json();
      record("Pinata pinFileToIPFS", true, `pinned ${data.IpfsHash}`);
    } else {
      const body = await response.text();
      record(
        "Pinata pinFileToIPFS",
        false,
        `${response.status} ${body.slice(0, 120)} - uploads will fall back to the local cache`,
        { required: false }
      );
    }
  } catch (err) {
    record("Pinata pinFileToIPFS", false, err.message, { required: false });
  }
}

console.log("\nEvidence system preflight\n");

await checkCidDerivation();
await checkMongo();
await checkRpcAndContract();
await checkPinataScope();

const failed = results.filter((r) => !r.ok && r.required);
const warned = results.filter((r) => !r.ok && !r.required);

console.log(
  `\n${results.filter((r) => r.ok).length}/${results.length} checks passed` +
    (warned.length ? `, ${warned.length} warning(s)` : "") +
    "\n"
);

if (failed.length) {
  console.error(`Required checks failed: ${failed.map((r) => r.name).join(", ")}\n`);
  process.exit(1);
}
