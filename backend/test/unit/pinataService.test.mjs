import "../helpers/setup.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { CID } from "multiformats/cid";
import { recomputeCid } from "../../src/services/pinataService.js";

/**
 * CID recomputation is the mechanism the whole integrity claim rests on: the
 * verdict in verifyEvidence is "do these bytes still hash to what the chain
 * recorded". These tests pin that behaviour at the lowest level.
 */
describe("pinataService.recomputeCid", () => {
  it("produces a CIDv1 raw-codec identifier", async () => {
    const cid = await recomputeCid(Buffer.from("This is test cyber crime evidence.\n"));
    assert.match(cid, /^bafkrei[a-z2-7]+$/, `expected a CIDv1 raw multihash, got ${cid}`);
  });

  it("is deterministic - identical bytes always yield the identical CID", async () => {
    const first = await recomputeCid(Buffer.from("chain of custody matters"));
    const second = await recomputeCid(Buffer.from("chain of custody matters"));
    assert.equal(first, second);
  });

  it("detects tampering - a single changed digit changes the CID", async () => {
    const original = Buffer.from("Suspect transferred 5000 INR at 14:32.");
    const tampered = Buffer.from("Suspect transferred 9000 INR at 14:32.");

    assert.notEqual(await recomputeCid(original), await recomputeCid(tampered));
  });

  it("detects truncation and appending, not only substitution", async () => {
    const base = Buffer.from("forensic disk image header");
    const baseCid = await recomputeCid(base);

    assert.notEqual(await recomputeCid(base.subarray(0, base.length - 1)), baseCid);
    assert.notEqual(await recomputeCid(Buffer.concat([base, Buffer.from("!")])), baseCid);
  });

  it("handles an empty buffer without throwing", async () => {
    assert.match(await recomputeCid(Buffer.alloc(0)), /^bafkrei[a-z2-7]+$/);
  });

  it("embeds the sha256 of the content, so the CID is checkable by hand", async () => {
    // A CIDv1 raw multihash carries the digest verbatim. Recomputing the
    // sha256 separately and finding it inside the CID is what makes this
    // verification rather than a comparison of two copies of one string.
    const bytes = Buffer.from("independently checkable");
    const parsed = CID.parse(await recomputeCid(bytes));
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");

    assert.equal(Buffer.from(parsed.multihash.digest).toString("hex"), digest);
  });

  it("stays stable for binary content, not only text", async () => {
    const binary = Buffer.from([0x00, 0xff, 0x7f, 0x80, 0x01, 0xfe]);
    assert.equal(await recomputeCid(binary), await recomputeCid(Buffer.from(binary)));
  });
});
