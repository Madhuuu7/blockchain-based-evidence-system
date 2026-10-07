import "../helpers/setup.mjs";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDb, stopDb, clearDb } from "../helpers/db.mjs";
import { WALLETS, authHeader } from "../helpers/auth.mjs";
import { makeChain, installChainMock, installIpfsMock } from "../helpers/chain.mjs";
import { recomputeCid } from "../../src/services/pinataService.js";

/**
 * POST /api/evidence/:id/verify - the endpoint the project exists for.
 *
 * This once returned a hardcoded `true`, so every file passed including
 * tampered ones. These tests exist so that cannot come back silently: the
 * verdict has to be derived from the bytes a gateway actually served, and a
 * tampered file has to fail.
 *
 * The three states are kept apart deliberately and asserted separately:
 *   - the verdict        - do the bytes still hash to the on-chain CID
 *   - the mirror state   - missing / consistent / divergent in MongoDB
 *   - the alert trail    - what an administrator ends up seeing
 */
const ORIGINAL = Buffer.from("Chat log export, seized 2026-02-11, device A.\n");
const TAMPERED = Buffer.from("Chat log export, seized 2026-02-11, device B.\n");

const chain = installChainMock(makeChain());
const ipfs = installIpfsMock();

const { createApp } = await import("../../src/app.js");
const Evidence = (await import("../../src/models/Evidence.js")).default;
const Alert = (await import("../../src/models/Alert.js")).default;
const AccessLog = (await import("../../src/models/AccessLog.js")).default;

const app = createApp({ rateLimit: false, logging: false });

let originalCid;

before(async () => {
  await startDb();
  originalCid = await recomputeCid(ORIGINAL);
});

after(async () => {
  await stopDb();
});

beforeEach(async () => {
  await clearDb();

  chain.rpcDown = false;
  ipfs.state.gatewayDown = false;
  ipfs.store.clear();
  chain.evidence.clear();

  // The honest baseline: the chain records a CID, and the gateway holds bytes
  // that really do hash to it.
  ipfs.store.set(originalCid, ORIGINAL);
  chain.evidence.set("1", {
    evidenceId: 1,
    caseId: "CASE-2026-001",
    cid: originalCid,
    description: "Chat log export",
    fileType: "text/plain",
    registeredBy: WALLETS.OFFICER,
    timestamp: 1770000000,
    status: "Registered"
  });
});

async function seedMirror(overrides = {}) {
  return Evidence.create({
    evidenceId: 1,
    caseId: "CASE-2026-001",
    cid: originalCid,
    description: "Chat log export",
    fileType: "text/plain",
    registeredBy: WALLETS.OFFICER,
    status: "confirmed",
    ...overrides
  });
}

describe("POST /api/evidence/:id/verify - intact evidence", () => {
  it("passes when the served bytes hash to the on-chain CID", async () => {
    await seedMirror();

    const res = await request(app)
      .post("/api/evidence/1/verify")
      .set(authHeader("INVESTIGATOR"));

    assert.equal(res.status, 200);
    assert.equal(res.body.result, "Integrity Verified");
    assert.equal(res.body.status, "verified");
    assert.equal(res.body.recomputedCid, originalCid);
    assert.equal(res.body.onChainCid, originalCid);
    assert.equal(res.body.databaseRecord, "consistent");
  });

  it("returns a sha256 that matches the content independently of the CID", async () => {
    await seedMirror();
    const res = await request(app).post("/api/evidence/1/verify").set(authHeader("JUDICIARY"));

    const { createHash } = await import("crypto");
    assert.equal(res.body.sha256Hash, createHash("sha256").update(ORIGINAL).digest("hex"));
  });

  it("promotes the mirror document to verified", async () => {
    await seedMirror({ status: "confirmed" });
    await request(app).post("/api/evidence/1/verify").set(authHeader("ADMIN"));

    assert.equal((await Evidence.findOne({ evidenceId: 1 })).status, "verified");
  });

  it("raises no alert when everything agrees", async () => {
    await seedMirror();
    await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    assert.equal(await Alert.countDocuments({}), 0);
  });

  it("records the verification in the access log", async () => {
    await seedMirror();
    await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    const logs = await AccessLog.find({ evidenceId: 1, action: "verify" });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].walletAddress, WALLETS.INVESTIGATOR);
  });
});

describe("POST /api/evidence/:id/verify - tampered evidence", () => {
  beforeEach(() => {
    // The gateway serves different bytes under the CID the chain committed to.
    // This is the attack the system is built to catch.
    ipfs.store.set(originalCid, TAMPERED);
  });

  it("fails the verdict when the bytes no longer match the CID", async () => {
    await seedMirror();

    const res = await request(app)
      .post("/api/evidence/1/verify")
      .set(authHeader("INVESTIGATOR"));

    assert.equal(res.status, 200);
    assert.equal(res.body.result, "Integrity Violation");
    assert.equal(res.body.status, "flagged");
  });

  it("reports the recomputed CID so the discrepancy is visible, not just asserted", async () => {
    await seedMirror();
    const res = await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    assert.notEqual(res.body.recomputedCid, res.body.onChainCid);
    assert.equal(res.body.recomputedCid, await recomputeCid(TAMPERED));
  });

  it("raises an IntegrityViolation alert naming both CIDs", async () => {
    await seedMirror();
    await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    const alerts = await Alert.find({ type: "IntegrityViolation" });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /does not match the on-chain CID/);
    assert.match(alerts[0].message, new RegExp(originalCid));
  });

  it("flags the mirror document rather than leaving it confirmed", async () => {
    await seedMirror({ status: "confirmed" });
    await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    assert.equal((await Evidence.findOne({ evidenceId: 1 })).status, "flagged");
  });
});

describe("POST /api/evidence/:id/verify - the off-chain mirror", () => {
  it("reports a missing mirror as missing, which is neither pass nor violation", async () => {
    // No MongoDB document at all. The file is still intact, so the verdict
    // stands - but the caller is told the mirror was not found rather than
    // being handed a silent success.
    const res = await request(app)
      .post("/api/evidence/1/verify")
      .set(authHeader("INVESTIGATOR"));

    assert.equal(res.body.result, "Integrity Verified");
    assert.equal(res.body.databaseRecord, "missing");
  });

  it("reports a divergent mirror while keeping the chain verdict intact", async () => {
    await seedMirror({ cid: await recomputeCid(Buffer.from("a different file entirely")) });

    const res = await request(app)
      .post("/api/evidence/1/verify")
      .set(authHeader("INVESTIGATOR"));

    assert.equal(res.body.result, "Integrity Verified", "the bytes are fine; the database is not");
    assert.equal(res.body.databaseRecord, "divergent");
  });

  it("raises a separate alert for a divergent mirror", async () => {
    await seedMirror({ cid: await recomputeCid(Buffer.from("a different file entirely")) });
    await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    const alerts = await Alert.find({ type: "IntegrityViolation" });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /Database mismatch/);
    assert.match(alerts[0].message, /blockchain record is authoritative/);
  });

  it("does not let a divergent mirror be reported as verified", async () => {
    await seedMirror({ cid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "confirmed" });
    await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    assert.equal((await Evidence.findOne({ evidenceId: 1 })).status, "flagged");
  });

  it("does not fall back onto a different evidence item in the same case", async () => {
    // A case normally holds several exhibits. When the mirror for the one
    // being verified is absent, the lookup must report it absent - not reach
    // for a sibling document, whose CID legitimately differs and would be
    // read as tampering with the database.
    await Evidence.create({
      evidenceId: 2,
      caseId: "CASE-2026-001",
      cid: await recomputeCid(Buffer.from("a second, unrelated exhibit")),
      description: "Seized USB image",
      fileType: "application/octet-stream",
      registeredBy: WALLETS.OFFICER,
      status: "confirmed"
    });

    const res = await request(app)
      .post("/api/evidence/1/verify")
      .set(authHeader("INVESTIGATOR"));

    assert.equal(
      res.body.databaseRecord,
      "missing",
      "evidence #1 has no mirror; exhibit #2 is a different file and must not stand in for it"
    );
    assert.equal(
      await Alert.countDocuments({ type: "IntegrityViolation" }),
      0,
      "a missing mirror is not a database mismatch and must not raise an alert"
    );
    assert.equal(
      (await Evidence.findOne({ evidenceId: 2 })).status,
      "confirmed",
      "verifying #1 must not flag #2"
    );
  });

  it("still adopts an unlinked document in the case, which a redeploy can leave behind", async () => {
    // A redeployed chain renumbers from 1 while MongoDB keeps its documents,
    // and an upload whose transaction never confirmed sits in the case with no
    // id at all. That document has no competing identity, so it is allowed to
    // match - this is the case the fallback exists for.
    await Evidence.create({
      caseId: "CASE-2026-001",
      cid: originalCid,
      description: "Chat log export",
      fileType: "text/plain",
      registeredBy: WALLETS.OFFICER,
      status: "pending-chain"
    });

    const res = await request(app)
      .post("/api/evidence/1/verify")
      .set(authHeader("INVESTIGATOR"));

    assert.equal(res.body.databaseRecord, "consistent");
  });

  it("matches the mirror on case plus on-chain id, not on the CID", async () => {
    // Matching on the CID would only ever return documents that already agree
    // with the chain, which is the one thing this check exists to test. A
    // document with the right identity but the wrong CID must be found, and
    // then reported as divergent.
    await seedMirror({ cid: "bafkreizzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" });

    const res = await request(app)
      .post("/api/evidence/1/verify")
      .set(authHeader("INVESTIGATOR"));

    assert.equal(res.body.databaseRecord, "divergent", "the wrong-CID document must still be found");
  });
});

describe("POST /api/evidence/:id/verify - failure handling", () => {
  it("rejects a non-numeric evidence id with 400", async () => {
    const res = await request(app).post("/api/evidence/abc/verify").set(authHeader("ADMIN"));
    assert.equal(res.status, 400);
  });

  it("rejects a zero or negative evidence id with 400", async () => {
    assert.equal((await request(app).post("/api/evidence/0/verify").set(authHeader("ADMIN"))).status, 400);
    assert.equal((await request(app).post("/api/evidence/-3/verify").set(authHeader("ADMIN"))).status, 400);
  });

  it("returns 403 for an evidence id that does not exist on chain", async () => {
    const res = await request(app).post("/api/evidence/999/verify").set(authHeader("ADMIN"));
    assert.equal(res.status, 403);
  });

  it("surfaces a gateway outage as an error instead of a passing verdict", async () => {
    // If the bytes cannot be fetched, nothing has been verified. Reporting
    // success here would be the original bug in a new form.
    await seedMirror();
    ipfs.state.gatewayDown = true;

    const res = await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    assert.notEqual(res.status, 200, "an unfetchable file must not verify");
    assert.ok(res.body.error, "the failure must be reported, not swallowed");
  });

  it("does not mark anything verified when the gateway is down", async () => {
    await seedMirror({ status: "confirmed" });
    ipfs.state.gatewayDown = true;

    await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    assert.equal((await Evidence.findOne({ evidenceId: 1 })).status, "confirmed");
  });

  it("tells the caller the result still needs recording on-chain", async () => {
    await seedMirror();
    const res = await request(app).post("/api/evidence/1/verify").set(authHeader("INVESTIGATOR"));

    assert.match(res.body.note, /recordVerification/);
  });
});

describe("POST /api/evidence/:id/verify - access control", () => {
  it("refuses an unauthenticated request", async () => {
    assert.equal((await request(app).post("/api/evidence/1/verify")).status, 401);
  });

  it("refuses an OFFICER, who registers evidence but does not adjudicate it", async () => {
    const res = await request(app).post("/api/evidence/1/verify").set(authHeader("OFFICER"));
    assert.equal(res.status, 403);
  });

  it("allows INVESTIGATOR, JUDICIARY and ADMIN", async () => {
    for (const role of ["INVESTIGATOR", "JUDICIARY", "ADMIN"]) {
      await seedMirror();
      const res = await request(app).post("/api/evidence/1/verify").set(authHeader(role));
      assert.equal(res.status, 200, `${role} should be permitted to verify`);
      await clearDb();
    }
  });
});
