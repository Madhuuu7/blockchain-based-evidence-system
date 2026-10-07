import "../helpers/setup.mjs";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDb, stopDb, clearDb } from "../helpers/db.mjs";
import { WALLETS, authHeader } from "../helpers/auth.mjs";
import { makeChain, installChainMock } from "../helpers/chain.mjs";

/**
 * The two administrator surfaces: the alert feed and the user register.
 *
 * Both are ADMIN-only, and the user register has a property worth pinning -
 * it reports the role the contract currently holds, not the cached label in
 * MongoDB. The cache exists for fast reads and is allowed to drift when a role
 * changes on chain; anything that displays it as fact would be misleading.
 */
const chain = installChainMock(makeChain());

const { createApp } = await import("../../src/app.js");
const Alert = (await import("../../src/models/Alert.js")).default;
const User = (await import("../../src/models/User.js")).default;

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
  chain.roles[WALLETS.OFFICER] = "OFFICER";
  chain.roles[WALLETS.INVESTIGATOR] = "INVESTIGATOR";
  chain.roleLookupFailures.clear();
});

describe("GET /api/alerts", () => {
  beforeEach(async () => {
    await Alert.create([
      { type: "IntegrityViolation", message: "CID mismatch on #1", evidenceId: 1 },
      { type: "AccessDenied", message: "unauthorised read of #2", evidenceId: 2 },
      { type: "AccessDenied", message: "resolved already", evidenceId: 3, resolved: true }
    ]);
  });

  it("returns the alert feed with a total", async () => {
    const res = await request(app).get("/api/alerts").set(authHeader("ADMIN"));

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
  });

  it("filters by type", async () => {
    const res = await request(app).get("/api/alerts?type=AccessDenied").set(authHeader("ADMIN"));
    assert.equal(res.body.total, 2);
  });

  it("filters by resolved state", async () => {
    const open = await request(app).get("/api/alerts?resolved=false").set(authHeader("ADMIN"));
    const closed = await request(app).get("/api/alerts?resolved=true").set(authHeader("ADMIN"));

    assert.equal(open.body.total, 2);
    assert.equal(closed.body.total, 1);
  });

  it("is refused for every non-admin role", async () => {
    for (const role of ["OFFICER", "INVESTIGATOR", "JUDICIARY"]) {
      assert.equal(
        (await request(app).get("/api/alerts").set(authHeader(role))).status,
        403,
        `${role} must not read the alert feed`
      );
    }
  });

  it("is refused without a session token", async () => {
    assert.equal((await request(app).get("/api/alerts")).status, 401);
  });
});

describe("POST /api/alerts/:id/resolve", () => {
  it("marks an alert resolved and returns it", async () => {
    const alert = await Alert.create({ type: "AccessDenied", message: "unauthorised read" });

    const res = await request(app)
      .post(`/api/alerts/${alert._id}/resolve`)
      .set(authHeader("ADMIN"));

    assert.equal(res.status, 200);
    assert.equal(res.body.resolved, true);
    assert.equal((await Alert.findById(alert._id)).resolved, true);
  });

  it("returns 404 for an alert that does not exist", async () => {
    const res = await request(app)
      .post("/api/alerts/507f1f77bcf86cd799439011/resolve")
      .set(authHeader("ADMIN"));

    assert.equal(res.status, 404);
  });

  it("is refused for a non-admin", async () => {
    const alert = await Alert.create({ type: "AccessDenied", message: "unauthorised read" });

    const res = await request(app)
      .post(`/api/alerts/${alert._id}/resolve`)
      .set(authHeader("INVESTIGATOR"));

    assert.equal(res.status, 403);
    assert.equal((await Alert.findById(alert._id)).resolved, false, "the alert must be untouched");
  });
});

describe("GET /api/users", () => {
  beforeEach(async () => {
    await User.create([
      { walletAddress: WALLETS.OFFICER, name: "Officer A", roleCache: "OFFICER" },
      { walletAddress: WALLETS.INVESTIGATOR, name: "Investigator B", roleCache: "INVESTIGATOR" }
    ]);
  });

  it("lists users", async () => {
    const res = await request(app).get("/api/users").set(authHeader("ADMIN"));

    assert.equal(res.status, 200);
    assert.equal(res.body.results.length, 2);
  });

  it("reports the live on-chain role alongside the cached one", async () => {
    // The cache says OFFICER; the chain has since said otherwise. The endpoint
    // must show what the contract currently enforces.
    chain.roles[WALLETS.OFFICER] = "NONE";

    const res = await request(app).get("/api/users").set(authHeader("ADMIN"));
    const officer = res.body.results.find((u) => u.walletAddress === WALLETS.OFFICER);

    assert.equal(officer.roleCache, "OFFICER", "the stale cache is still shown as the cache");
    assert.equal(officer.liveRole, "NONE", "the live role is what the chain says now");
  });

  it("falls back to the cached role when one lookup fails", async () => {
    // Degrading to the last known value beats failing the whole admin screen,
    // as long as nothing treats it as authorisation - which requireRole does
    // not. A blanket outage would stop the admin's own role check first, so
    // this fails the lookup for one wallet and leaves the rest answering.
    chain.roleLookupFailures.add(WALLETS.OFFICER);

    const res = await request(app).get("/api/users").set(authHeader("ADMIN"));
    chain.roleLookupFailures.clear();

    assert.equal(res.status, 200);
    const officer = res.body.results.find((u) => u.walletAddress === WALLETS.OFFICER);
    assert.equal(officer.liveRole, "OFFICER", "the cached value stands in for the unreachable one");
  });

  it("is refused for every non-admin role", async () => {
    for (const role of ["OFFICER", "INVESTIGATOR", "JUDICIARY"]) {
      assert.equal((await request(app).get("/api/users").set(authHeader(role))).status, 403);
    }
  });
});

describe("POST /api/users/role", () => {
  it("syncs the cached label to whatever the contract says", async () => {
    chain.roles[WALLETS.OFFICER] = "INVESTIGATOR";

    const res = await request(app)
      .post("/api/users/role")
      .set(authHeader("ADMIN"))
      .send({ walletAddress: WALLETS.OFFICER });

    assert.equal(res.status, 200);
    assert.equal(res.body.roleCache, "INVESTIGATOR");
  });

  it("creates the user record if this is the first time the wallet is seen", async () => {
    const fresh = "0x2222222222222222222222222222222222222222";
    chain.roles[fresh] = "JUDICIARY";

    const res = await request(app)
      .post("/api/users/role")
      .set(authHeader("ADMIN"))
      .send({ walletAddress: fresh });

    assert.equal(res.status, 200);
    assert.ok(await User.findOne({ walletAddress: fresh }));
  });

  it("never grants a role itself - it only copies what the chain already holds", async () => {
    // This endpoint updates a label. The contract is the only place a role is
    // actually set, and a wallet with no role must stay NONE here.
    const stranger = "0x3333333333333333333333333333333333333333";

    const res = await request(app)
      .post("/api/users/role")
      .set(authHeader("ADMIN"))
      .send({ walletAddress: stranger });

    assert.equal(res.body.roleCache, "NONE");
  });

  it("requires a walletAddress", async () => {
    const res = await request(app).post("/api/users/role").set(authHeader("ADMIN")).send({});
    assert.equal(res.status, 400);
  });

  it("is refused for a non-admin", async () => {
    const res = await request(app)
      .post("/api/users/role")
      .set(authHeader("OFFICER"))
      .send({ walletAddress: WALLETS.OFFICER });

    assert.equal(res.status, 403);
  });
});

describe("the application shell", () => {
  it("answers a health check without a token", async () => {
    const res = await request(app).get("/api/health");

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
  });

  it("returns a JSON 404 for an unknown route rather than HTML", async () => {
    const res = await request(app).get("/api/nothing-here").set(authHeader("ADMIN"));

    assert.equal(res.status, 404);
    assert.match(res.body.error, /No route for GET/);
  });
});
