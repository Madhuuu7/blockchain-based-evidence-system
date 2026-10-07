import "../helpers/setup.mjs";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDb, stopDb, clearDb } from "../helpers/db.mjs";
import { WALLETS, authHeader } from "../helpers/auth.mjs";
import { makeChain, installChainMock } from "../helpers/chain.mjs";

/**
 * Cases are the off-chain grouping that evidence hangs off. They live only in
 * MongoDB - the chain stores the caseId as a string on each record and knows
 * nothing else about them - so the thing to defend here is the uniqueness of
 * the caseId and who may open one.
 */
const chain = installChainMock(makeChain());

const { createApp } = await import("../../src/app.js");
const Case = (await import("../../src/models/Case.js")).default;
const Evidence = (await import("../../src/models/Evidence.js")).default;

const app = createApp({ rateLimit: false, logging: false });

before(async () => {
  await startDb();
  // The unique index on caseId is what makes the duplicate test meaningful,
  // and it is only built when mongoose syncs it.
  await Case.syncIndexes();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  chain.rpcDown = false;
});

describe("POST /api/cases", () => {
  it("opens a case attributed to the caller", async () => {
    const res = await request(app)
      .post("/api/cases")
      .set(authHeader("OFFICER"))
      .send({ caseId: "CASE-2026-100", title: "Phishing ring", description: "Multi-victim" });

    assert.equal(res.status, 201);
    assert.equal(res.body.caseId, "CASE-2026-100");
    assert.equal(res.body.createdBy, WALLETS.OFFICER);
    assert.equal(res.body.status, "open");
  });

  it("requires caseId and title", async () => {
    assert.equal(
      (await request(app).post("/api/cases").set(authHeader("OFFICER")).send({ title: "no id" }))
        .status,
      400
    );
    assert.equal(
      (await request(app).post("/api/cases").set(authHeader("OFFICER")).send({ caseId: "CASE-X" }))
        .status,
      400
    );
  });

  it("refuses a duplicate caseId with 409 rather than a 500", async () => {
    const body = { caseId: "CASE-2026-101", title: "First" };
    assert.equal((await request(app).post("/api/cases").set(authHeader("OFFICER")).send(body)).status, 201);

    const duplicate = await request(app)
      .post("/api/cases")
      .set(authHeader("OFFICER"))
      .send({ ...body, title: "Second" });

    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error, /already exists/);
  });

  it("allows OFFICER, INVESTIGATOR and ADMIN to open a case", async () => {
    for (const [i, role] of ["OFFICER", "INVESTIGATOR", "ADMIN"].entries()) {
      const res = await request(app)
        .post("/api/cases")
        .set(authHeader(role))
        .send({ caseId: `CASE-ROLE-${i}`, title: role });

      assert.equal(res.status, 201, `${role} should be able to open a case`);
    }
  });

  it("refuses JUDICIARY, who adjudicates rather than opens cases", async () => {
    const res = await request(app)
      .post("/api/cases")
      .set(authHeader("JUDICIARY"))
      .send({ caseId: "CASE-J", title: "nope" });

    assert.equal(res.status, 403);
  });

  it("refuses an unauthenticated request", async () => {
    const res = await request(app).post("/api/cases").send({ caseId: "CASE-N", title: "nope" });
    assert.equal(res.status, 401);
  });
});

describe("GET /api/cases/:caseId", () => {
  beforeEach(async () => {
    await Case.create({ caseId: "CASE-2026-200", title: "Ransomware", createdBy: WALLETS.OFFICER });
  });

  it("returns the case with a count of its evidence", async () => {
    await Evidence.create([
      { evidenceId: 1, caseId: "CASE-2026-200", cid: "bafkreia", registeredBy: WALLETS.OFFICER },
      { evidenceId: 2, caseId: "CASE-2026-200", cid: "bafkreib", registeredBy: WALLETS.OFFICER }
    ]);

    const res = await request(app).get("/api/cases/CASE-2026-200").set(authHeader("JUDICIARY"));

    assert.equal(res.status, 200);
    assert.equal(res.body.title, "Ransomware");
    assert.equal(res.body.evidenceCount, 2);
  });

  it("reports zero evidence for an empty case rather than omitting the field", async () => {
    const res = await request(app).get("/api/cases/CASE-2026-200").set(authHeader("ADMIN"));
    assert.equal(res.body.evidenceCount, 0);
  });

  it("returns 404 for a case that does not exist", async () => {
    assert.equal((await request(app).get("/api/cases/NOPE").set(authHeader("ADMIN"))).status, 404);
  });

  it("counts only evidence belonging to that case", async () => {
    await Evidence.create([
      { evidenceId: 1, caseId: "CASE-2026-200", cid: "bafkreia", registeredBy: WALLETS.OFFICER },
      { evidenceId: 2, caseId: "CASE-OTHER", cid: "bafkreib", registeredBy: WALLETS.OFFICER }
    ]);

    const res = await request(app).get("/api/cases/CASE-2026-200").set(authHeader("ADMIN"));
    assert.equal(res.body.evidenceCount, 1);
  });
});

describe("GET /api/cases", () => {
  beforeEach(async () => {
    await Case.create([
      { caseId: "CASE-1", title: "One", createdBy: WALLETS.OFFICER },
      { caseId: "CASE-2", title: "Two", createdBy: WALLETS.OFFICER },
      { caseId: "CASE-3", title: "Three", createdBy: WALLETS.INVESTIGATOR }
    ]);
  });

  it("lists cases with a total", async () => {
    const res = await request(app).get("/api/cases").set(authHeader("JUDICIARY"));

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.results.length, 3);
  });

  it("paginates without misreporting the total", async () => {
    const res = await request(app).get("/api/cases?page=1&limit=2").set(authHeader("ADMIN"));

    assert.equal(res.body.results.length, 2);
    assert.equal(res.body.total, 3);
  });

  it("is readable by any authenticated role", async () => {
    for (const role of ["ADMIN", "OFFICER", "INVESTIGATOR", "JUDICIARY"]) {
      assert.equal((await request(app).get("/api/cases").set(authHeader(role))).status, 200);
    }
  });

  it("refuses an unauthenticated request", async () => {
    assert.equal((await request(app).get("/api/cases")).status, 401);
  });
});
