import "../helpers/setup.mjs";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ethers } from "ethers";
import { startDb, stopDb, clearDb } from "../helpers/db.mjs";
import { WALLETS, authHeader } from "../helpers/auth.mjs";
import { makeChain, installChainMock } from "../helpers/chain.mjs";

/**
 * Security alerts raised by the API itself.
 *
 * The event listener mirrors on-chain AccessDenied events and verifyEvidence
 * raises IntegrityViolation, but neither sees anything that happens at the
 * door. Someone probing the site - replaying a captured sign-in, claiming an
 * address they cannot sign for, or walking the API with a valid session -
 * previously left no trace an administrator could find.
 */
const signer = ethers.Wallet.createRandom();
const impostor = ethers.Wallet.createRandom();

const chain = installChainMock(
  makeChain({ roles: { [signer.address.toLowerCase()]: "OFFICER" } })
);

const { createApp } = await import("../../src/app.js");
const { recordSecurityAlert } = await import("../../src/services/securityAlertService.js");
const Alert = (await import("../../src/models/Alert.js")).default;

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
  chain.roles[signer.address.toLowerCase()] = "OFFICER";
});

async function nonceFor(address) {
  const res = await request(app).post("/api/auth/nonce").send({ address });
  return res.body.message;
}

describe("sign-in alerts", () => {
  it("raises an alert when a signature does not match the claimed address", async () => {
    // The impersonation attempt: claim the officer's address, sign with another key.
    const message = await nonceFor(signer.address);

    const res = await request(app).post("/api/auth/verify").send({
      address: signer.address,
      signature: await impostor.signMessage(message),
      message
    });

    assert.equal(res.status, 401);

    const alerts = await Alert.find({ type: "LoginDenied" });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /signature was produced by/);
    assert.equal(alerts[0].walletAddress, signer.address.toLowerCase());
  });

  it("raises an alert when a captured sign-in is replayed", async () => {
    const message = await nonceFor(signer.address);
    const body = {
      address: signer.address,
      signature: await signer.signMessage(message),
      message
    };

    await request(app).post("/api/auth/verify").send(body);
    await Alert.deleteMany({});

    const replay = await request(app).post("/api/auth/verify").send(body);

    assert.equal(replay.status, 401);
    const alerts = await Alert.find({ type: "LoginDenied" });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /already been used/);
  });

  it("raises an alert when a wallet signs in correctly but holds no role", async () => {
    // Genuine signature, unknown wallet. Nothing else in the system would
    // report this, and it is exactly what probing looks like.
    const stranger = ethers.Wallet.createRandom();
    const message = await nonceFor(stranger.address);

    const res = await request(app).post("/api/auth/verify").send({
      address: stranger.address,
      signature: await stranger.signMessage(message),
      message
    });

    assert.equal(res.status, 200, "signing in is proof of ownership and still succeeds");
    assert.equal(res.body.role, "NONE");

    const alerts = await Alert.find({ type: "LoginDenied" });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /holds no role/);
  });

  it("raises no alert for a normal successful sign-in", async () => {
    const message = await nonceFor(signer.address);

    await request(app).post("/api/auth/verify").send({
      address: signer.address,
      signature: await signer.signMessage(message),
      message
    });

    assert.equal(await Alert.countDocuments({}), 0, "ordinary use must not fill the feed");
  });
});

describe("unauthorised API alerts", () => {
  it("raises an alert when a session reaches for a route its role cannot use", async () => {
    const res = await request(app).get("/api/alerts").set(authHeader("OFFICER"));

    assert.equal(res.status, 403);

    const alerts = await Alert.find({ type: "UnauthorizedApi" });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].walletAddress, WALLETS.OFFICER);
    assert.match(alerts[0].message, /holds OFFICER/);
  });

  it("records which route was refused", async () => {
    await request(app).post("/api/users/role").set(authHeader("JUDICIARY")).send({});

    const alert = await Alert.findOne({ type: "UnauthorizedApi" });
    assert.match(alert.message, /\/api\/users\/role/);
  });

  it("raises no alert when a permitted role uses a route normally", async () => {
    await request(app).get("/api/alerts").set(authHeader("ADMIN"));

    assert.equal(await Alert.countDocuments({ type: "UnauthorizedApi" }), 0);
  });

  it("still refuses the request even if the alert cannot be written", async () => {
    // The refusal is the control; the alert is the record of it. Losing the
    // record must never turn a clean 403 into a 500.
    const original = Alert.findOne;
    Alert.findOne = () => {
      throw new Error("database unavailable");
    };

    const res = await request(app).get("/api/alerts").set(authHeader("OFFICER"));
    Alert.findOne = original;

    assert.equal(res.status, 403);
  });
});

describe("alert grouping", () => {
  it("groups repeats of the same event instead of flooding the feed", async () => {
    // A script hammering the login endpoint would otherwise produce thousands
    // of rows and bury every real alert.
    for (let i = 0; i < 5; i++) {
      await request(app).get("/api/alerts").set(authHeader("OFFICER"));
    }

    const alerts = await Alert.find({ type: "UnauthorizedApi" });
    assert.equal(alerts.length, 1, "five attempts, one alert");
    assert.equal(alerts[0].occurrences, 5);
  });

  it("advances lastSeenAt as the repeats come in", async () => {
    await request(app).get("/api/alerts").set(authHeader("OFFICER"));
    const first = await Alert.findOne({ type: "UnauthorizedApi" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await request(app).get("/api/alerts").set(authHeader("OFFICER"));
    const second = await Alert.findOne({ type: "UnauthorizedApi" });

    assert.ok(second.lastSeenAt > first.lastSeenAt);
  });

  it("keeps different wallets apart", async () => {
    await request(app).get("/api/alerts").set(authHeader("OFFICER"));
    await request(app).get("/api/alerts").set(authHeader("INVESTIGATOR"));

    assert.equal(await Alert.countDocuments({ type: "UnauthorizedApi" }), 2);
  });

  it("keeps different alert types apart", async () => {
    await recordSecurityAlert({
      type: "LoginDenied",
      walletAddress: WALLETS.OFFICER,
      message: "one"
    });
    await recordSecurityAlert({
      type: "UnauthorizedApi",
      walletAddress: WALLETS.OFFICER,
      message: "two"
    });

    assert.equal(await Alert.countDocuments({}), 2);
  });

  it("starts a new alert once the previous one has been resolved", async () => {
    // An administrator who has dealt with something should see it again if it
    // comes back, rather than have the count quietly rise on a closed row.
    await recordSecurityAlert({
      type: "LoginDenied",
      walletAddress: WALLETS.OFFICER,
      message: "first wave"
    });
    await Alert.updateMany({}, { resolved: true });

    await recordSecurityAlert({
      type: "LoginDenied",
      walletAddress: WALLETS.OFFICER,
      message: "second wave"
    });

    assert.equal(await Alert.countDocuments({}), 2);
    assert.equal(await Alert.countDocuments({ resolved: false }), 1);
  });

  it("does not group events that fall outside the window", async () => {
    await recordSecurityAlert({
      type: "LoginDenied",
      walletAddress: WALLETS.OFFICER,
      message: "long ago"
    });

    // Push the existing alert's last sighting back beyond the grouping window.
    await Alert.updateMany({}, { lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) });

    await recordSecurityAlert({
      type: "LoginDenied",
      walletAddress: WALLETS.OFFICER,
      message: "today"
    });

    assert.equal(await Alert.countDocuments({}), 2);
  });
});

describe("the alert feed shows the new types", () => {
  beforeEach(async () => {
    await recordSecurityAlert({
      type: "LoginDenied",
      walletAddress: WALLETS.NONE,
      message: "bad signature"
    });
    await recordSecurityAlert({
      type: "UnauthorizedApi",
      walletAddress: WALLETS.OFFICER,
      message: "wrong role"
    });
  });

  it("lists them alongside the on-chain ones", async () => {
    const res = await request(app).get("/api/alerts").set(authHeader("ADMIN"));

    const types = res.body.results.map((a) => a.type);
    assert.ok(types.includes("LoginDenied"));
    assert.ok(types.includes("UnauthorizedApi"));
  });

  it("can be filtered down to sign-in failures", async () => {
    const res = await request(app).get("/api/alerts?type=LoginDenied").set(authHeader("ADMIN"));

    assert.equal(res.body.total, 1);
    assert.equal(res.body.results[0].type, "LoginDenied");
  });

  it("exposes the occurrence count so a burst is visible", async () => {
    await recordSecurityAlert({
      type: "LoginDenied",
      walletAddress: WALLETS.NONE,
      message: "bad signature again"
    });

    const res = await request(app).get("/api/alerts?type=LoginDenied").set(authHeader("ADMIN"));
    assert.equal(res.body.results[0].occurrences, 2);
  });
});
