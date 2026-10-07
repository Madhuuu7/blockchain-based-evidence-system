import "../helpers/setup.mjs";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDb, stopDb, clearDb } from "../helpers/db.mjs";
import { WALLETS, authHeader } from "../helpers/auth.mjs";
import { makeChain, installChainMock, installIpfsMock } from "../helpers/chain.mjs";

/**
 * The evidence lifecycle around verification: upload, finalize, list, read,
 * and custody history - plus who is allowed to do each.
 *
 * Registration is deliberately two-stage. The server never holds a key, so it
 * cannot write to the chain; the officer signs from MetaMask. Upload stores the
 * bytes and returns a draft, the officer signs, and finalize records the id the
 * chain assigned. The tests below cover what happens between those halves,
 * including an officer trying to finalize someone else's draft.
 */
const FILE = Buffer.from("seized device photograph bytes");

const chain = installChainMock(makeChain());
const ipfs = installIpfsMock();

const { createApp } = await import("../../src/app.js");
const { recomputeCid } = await import("../../src/services/pinataService.js");
const Evidence = (await import("../../src/models/Evidence.js")).default;
const AccessLog = (await import("../../src/models/AccessLog.js")).default;

const app = createApp({ rateLimit: false, logging: false });

before(async () => {
  await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  chain.rpcDown = false;
  chain.evidence.clear();
  chain.custody.clear();
  ipfs.store.clear();
  ipfs.state.gatewayDown = false;
});

function uploadRequest(role = "OFFICER", fields = {}) {
  const req = request(app).post("/api/evidence/upload").set(authHeader(role));
  const body = {
    caseId: "CASE-2026-001",
    description: "Photograph of seized laptop",
    fileType: "image/png",
    ...fields
  };

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) req.field(key, value);
  }

  return req.attach("file", FILE, "laptop.png");
}

describe("POST /api/evidence/upload", () => {
  it("stores the file and returns a draft with its CID", async () => {
    const res = await uploadRequest();

    assert.equal(res.status, 201);
    assert.ok(res.body.draftId);
    assert.equal(res.body.cid, await recomputeCid(FILE));
  });

  it("creates the mirror document as pending-chain, with no evidenceId yet", async () => {
    const res = await uploadRequest();
    const doc = await Evidence.findById(res.body.draftId);

    assert.equal(doc.status, "pending-chain");
    assert.equal(doc.evidenceId, undefined, "the id only exists once the chain assigns it");
    assert.equal(doc.registeredBy, WALLETS.OFFICER);
  });

  it("records where the bytes actually ended up", async () => {
    const res = await uploadRequest();

    assert.equal(res.body.storage, "pinata");
    assert.equal((await Evidence.findById(res.body.draftId)).storage, "pinata");
  });

  it("says plainly in the message which promise was kept", async () => {
    const res = await uploadRequest();
    assert.match(res.body.message, /pinned to IPFS/);
  });

  it("refuses an upload with no file", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .set(authHeader("OFFICER"))
      .field("caseId", "CASE-2026-001")
      .field("description", "no file attached")
      .field("fileType", "image/png");

    assert.equal(res.status, 400);
    assert.match(res.body.error, /No file provided/);
  });

  it("requires caseId, description and fileType", async () => {
    for (const missing of ["caseId", "description", "fileType"]) {
      const res = await uploadRequest("OFFICER", { [missing]: undefined });
      assert.equal(res.status, 400, `omitting ${missing} should be rejected`);
    }
  });

  it("is refused for every role except OFFICER", async () => {
    for (const role of ["ADMIN", "INVESTIGATOR", "JUDICIARY"]) {
      assert.equal((await uploadRequest(role)).status, 403, `${role} must not register evidence`);
    }
  });

  it("is refused without a session token", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .attach("file", FILE, "laptop.png");

    assert.equal(res.status, 401);
  });
});

describe("POST /api/evidence/finalize", () => {
  async function draft() {
    return (await uploadRequest()).body.draftId;
  }

  it("attaches the on-chain id and transaction hash to the draft", async () => {
    const draftId = await draft();

    const res = await request(app)
      .post("/api/evidence/finalize")
      .set(authHeader("OFFICER"))
      .send({ draftId, evidenceId: 7, txHash: "0xabc123" });

    assert.equal(res.status, 200);
    assert.equal(res.body.evidenceId, 7);
    assert.equal(res.body.status, "confirmed");

    const doc = await Evidence.findById(draftId);
    assert.equal(doc.evidenceId, 7);
    assert.equal(doc.txHash, "0xabc123");
  });

  it("requires draftId, evidenceId and txHash", async () => {
    const draftId = await draft();

    assert.equal(
      (await request(app).post("/api/evidence/finalize").set(authHeader("OFFICER")).send({ draftId })).status,
      400
    );
    assert.equal(
      (await request(app)
        .post("/api/evidence/finalize")
        .set(authHeader("OFFICER"))
        .send({ draftId, evidenceId: 1 })).status,
      400
    );
  });

  it("returns 404 for a draft that does not exist", async () => {
    const res = await request(app)
      .post("/api/evidence/finalize")
      .set(authHeader("OFFICER"))
      .send({ draftId: "507f1f77bcf86cd799439011", evidenceId: 1, txHash: "0xabc" });

    assert.equal(res.status, 404);
  });

  it("refuses to let one officer finalize another officer's draft", async () => {
    // The uploading wallet is the one that signed; nobody else gets to attach
    // a transaction hash to it.
    const draftId = await draft();
    const otherOfficer = "0x1111111111111111111111111111111111111111";
    chain.roles[otherOfficer] = "OFFICER";

    const jwtLib = (await import("jsonwebtoken")).default;
    const token = jwtLib.sign({ wallet: otherOfficer }, process.env.JWT_SECRET);

    const res = await request(app)
      .post("/api/evidence/finalize")
      .set({ Authorization: `Bearer ${token}` })
      .send({ draftId, evidenceId: 9, txHash: "0xdeadbeef" });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /Only the uploading officer/);
    assert.equal((await Evidence.findById(draftId)).status, "pending-chain");
  });
});

describe("GET /api/evidence", () => {
  beforeEach(async () => {
    await Evidence.create([
      {
        evidenceId: 1,
        caseId: "CASE-A",
        cid: "bafkreia1",
        description: "laptop photo",
        fileType: "image/png",
        registeredBy: WALLETS.OFFICER,
        status: "confirmed"
      },
      {
        evidenceId: 2,
        caseId: "CASE-A",
        cid: "bafkreia2",
        description: "chat log",
        fileType: "text/plain",
        registeredBy: WALLETS.OFFICER,
        status: "verified"
      },
      {
        evidenceId: 3,
        caseId: "CASE-B",
        cid: "bafkreib1",
        description: "disk image",
        fileType: "application/octet-stream",
        registeredBy: WALLETS.OFFICER,
        status: "flagged"
      }
    ]);
  });

  it("lists everything with a total", async () => {
    const res = await request(app).get("/api/evidence").set(authHeader("JUDICIARY"));

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.results.length, 3);
  });

  it("filters by case", async () => {
    const res = await request(app).get("/api/evidence?caseId=CASE-A").set(authHeader("ADMIN"));
    assert.equal(res.body.total, 2);
  });

  it("filters by status", async () => {
    const res = await request(app).get("/api/evidence?status=flagged").set(authHeader("ADMIN"));

    assert.equal(res.body.total, 1);
    assert.equal(res.body.results[0].evidenceId, 3);
  });

  it("filters by file type", async () => {
    const res = await request(app).get("/api/evidence?fileType=text/plain").set(authHeader("ADMIN"));
    assert.equal(res.body.total, 1);
  });

  it("paginates", async () => {
    const page1 = await request(app).get("/api/evidence?page=1&limit=2").set(authHeader("ADMIN"));
    const page2 = await request(app).get("/api/evidence?page=2&limit=2").set(authHeader("ADMIN"));

    assert.equal(page1.body.results.length, 2);
    assert.equal(page2.body.results.length, 1);
    assert.equal(page2.body.total, 3, "total counts matches, not the page");
  });

  it("requires a session token", async () => {
    assert.equal((await request(app).get("/api/evidence")).status, 401);
  });
});

describe("GET /api/evidence/:id", () => {
  beforeEach(() => {
    chain.evidence.set("1", {
      evidenceId: 1,
      caseId: "CASE-2026-001",
      cid: "bafkreiexample",
      description: "Chat log export",
      fileType: "text/plain",
      registeredBy: WALLETS.OFFICER,
      timestamp: 1770000000,
      status: "Registered"
    });
  });

  it("returns the record as the chain holds it", async () => {
    const res = await request(app).get("/api/evidence/1").set(authHeader("INVESTIGATOR"));

    assert.equal(res.status, 200);
    assert.equal(res.body.caseId, "CASE-2026-001");
    assert.equal(res.body.cid, "bafkreiexample");
  });

  it("writes an access log entry naming the caller", async () => {
    await request(app).get("/api/evidence/1").set(authHeader("JUDICIARY"));

    const logs = await AccessLog.find({ evidenceId: 1, action: "view" });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].walletAddress, WALLETS.JUDICIARY);
  });

  it("rejects a non-numeric id with 400", async () => {
    assert.equal((await request(app).get("/api/evidence/abc").set(authHeader("ADMIN"))).status, 400);
  });

  it("returns 403 for a wallet holding no role", async () => {
    const jwtLib = (await import("jsonwebtoken")).default;
    const token = jwtLib.sign({ wallet: WALLETS.NONE }, process.env.JWT_SECRET);

    const res = await request(app).get("/api/evidence/1").set({ Authorization: `Bearer ${token}` });
    assert.equal(res.status, 403);
  });

  it("returns 403 for an id the chain does not have", async () => {
    assert.equal((await request(app).get("/api/evidence/404").set(authHeader("ADMIN"))).status, 403);
  });
});

describe("GET /api/evidence/:id/history", () => {
  beforeEach(() => {
    chain.evidence.set("1", {
      evidenceId: 1,
      caseId: "CASE-2026-001",
      cid: "bafkreiexample",
      description: "Chat log",
      fileType: "text/plain",
      registeredBy: WALLETS.OFFICER,
      timestamp: 1770000000,
      status: "Registered"
    });
    chain.custody.set("1", [
      { action: "Registered", actor: WALLETS.OFFICER, timestamp: 1770000000, note: "initial" },
      { action: "Transferred", actor: WALLETS.INVESTIGATOR, timestamp: 1770000600, note: "to lab" }
    ]);
  });

  it("returns the custody chain in order", async () => {
    const res = await request(app).get("/api/evidence/1/history").set(authHeader("INVESTIGATOR"));

    assert.equal(res.status, 200);
    const events = Array.isArray(res.body) ? res.body : res.body.history || res.body.results;
    assert.equal(events.length, 2);
    assert.equal(events[0].action, "Registered");
    assert.equal(events[1].action, "Transferred");
  });

  it("returns 403 for a wallet holding no role", async () => {
    const jwtLib = (await import("jsonwebtoken")).default;
    const token = jwtLib.sign({ wallet: WALLETS.NONE }, process.env.JWT_SECRET);

    const res = await request(app)
      .get("/api/evidence/1/history")
      .set({ Authorization: `Bearer ${token}` });

    assert.equal(res.status, 403);
  });
});
