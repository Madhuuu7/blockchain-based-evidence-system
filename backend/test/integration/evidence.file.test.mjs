import "../helpers/setup.mjs";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDb, stopDb, clearDb } from "../helpers/db.mjs";
import { WALLETS, authHeader } from "../helpers/auth.mjs";
import { makeChain, installChainMock, installIpfsMock } from "../helpers/chain.mjs";

/**
 * GET /api/evidence/:id/file - the bytes of an exhibit, for viewing.
 *
 * The exhibit's recorded "fileType" is a label an officer typed, and this
 * endpoint used to send that label as the Content-Type. A photograph labelled
 * "screenshot" therefore arrived as `Content-Type: screenshot`, which no
 * browser can display. The type now comes from the bytes.
 */

// A real 1x1 PNG, so the body is something a browser would actually render.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const UNKNOWN = Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff, 0x00, 0x10, 0x00]);

const chain = installChainMock(makeChain());
const ipfs = installIpfsMock();

const { createApp } = await import("../../src/app.js");
const app = createApp({ rateLimit: false, logging: false });

function register(id, cid, body, fileType) {
  ipfs.store.set(cid, body);
  chain.evidence.set(String(id), {
    evidenceId: id,
    caseId: "CASE-2026-001",
    cid,
    description: "Exhibit",
    fileType,
    registeredBy: WALLETS.OFFICER,
    timestamp: 1770000000,
    status: "Registered"
  });
}

before(async () => {
  await startDb();
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

  register(1, "cid-photo", PNG, "screenshot");
  register(2, "cid-unknown", UNKNOWN, "disk-image");
});

describe("GET /api/evidence/:id/file", () => {
  it("serves a photograph as an image whatever label the officer typed", async () => {
    const res = await request(app)
      .get("/api/evidence/1/file")
      .set(authHeader("JUDICIARY"))
      .buffer(true)
      .parse((response, done) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });

    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.match(res.headers["content-disposition"], /^inline; filename="evidence-1\.png"$/);
    assert.ok(res.body.equals(PNG), "the bytes must arrive unaltered");
  });

  it("does not let the exhibit be cached outside the session", async () => {
    const res = await request(app).get("/api/evidence/1/file").set(authHeader("OFFICER"));
    assert.equal(res.headers["cache-control"], "private, no-store");
  });

  it("serves an unrecognised format as a download, never as the typed label", async () => {
    const res = await request(app).get("/api/evidence/2/file").set(authHeader("INVESTIGATOR"));

    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "application/octet-stream");
    assert.match(res.headers["content-disposition"], /evidence-2\.bin/);
  });

  it("refuses a wallet with no role", async () => {
    const res = await request(app).get("/api/evidence/1/file").set(authHeader("NONE"));
    assert.equal(res.status, 403);
  });

  it("refuses a request with no session", async () => {
    const res = await request(app).get("/api/evidence/1/file");
    assert.equal(res.status, 401);
  });
});
