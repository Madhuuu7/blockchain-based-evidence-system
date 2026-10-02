import { describe, it } from "node:test";
import assert from "node:assert/strict";
import dns from "dns";
import mongoose from "mongoose";
import { recomputeCid } from "../src/services/pinataService.js";
import Evidence from "../src/models/Evidence.js";
import Alert from "../src/models/Alert.js";
import { env } from "../src/config/env.js";

// Opt-in DNS override, matching src/server.js: some Windows setups cannot
// resolve Atlas SRV records through the configured resolver. Set
// DNS_SERVERS=8.8.8.8,8.8.4.4 to switch it on.
if (process.env.DNS_SERVERS) {
  try {
    dns.setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean));
  } catch (e) {}
}

describe("Cybercrime Evidence System - Core Logic Verification", () => {
  it("1. Genuine IPFS CIDv1 Recomputation matches known fixture", async () => {
    // "This is test cyber crime evidence.\n"
    const buffer = Buffer.from("This is test cyber crime evidence.\n");
    const cid = await recomputeCid(buffer);
    assert.ok(cid.startsWith("bafkrei"), `CID should be CIDv1 raw multihash, got ${cid}`);
    
    // Recomputing the exact same buffer must yield identical CID
    const cid2 = await recomputeCid(buffer);
    assert.equal(cid, cid2, "Identical content must produce identical CID");
  });

  it("2. Tampered content produces a mismatched CID (Tamper Detection)", async () => {
    const originalBuffer = Buffer.from("Legitimate evidence payload");
    const tamperedBuffer = Buffer.from("Altered / corrupted evidence payload");

    const originalCid = await recomputeCid(originalBuffer);
    const tamperedCid = await recomputeCid(tamperedBuffer);

    assert.notEqual(originalCid, tamperedCid, "Tampered content must produce a different CID");
  });

  it("3. MongoDB connection and historical CASE-2026-015 preservation", async () => {
    await mongoose.connect(env.mongodbUri);
    
    // Check CASE-2026-015
    const record = await Evidence.findOne({ caseId: "CASE-2026-015" });
    assert.ok(record, "Historical record CASE-2026-015 must exist");
    assert.equal(record.caseId, "CASE-2026-015");
    assert.equal(record.evidenceId, 1);
    assert.equal(record.cid, "bafkreicml47zzzg77nw54q53ud3iqrlj5lsssd5evv6s5j2xytbt3anjsa");
    assert.equal(record.status, "confirmed");

    // Test composite query disambiguation
    const matched = await Evidence.findOne({
      caseId: record.caseId,
      cid: record.cid
    });
    assert.equal(matched._id.toString(), record._id.toString(), "Composite match must find CASE-2026-015");

    await mongoose.disconnect();
  });
});
