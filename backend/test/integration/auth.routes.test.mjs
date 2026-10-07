import "../helpers/setup.mjs";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ethers } from "ethers";
import jwt from "jsonwebtoken";
import { startDb, stopDb, clearDb } from "../helpers/db.mjs";
import { makeChain, installChainMock } from "../helpers/chain.mjs";

/**
 * Wallet sign-in: /api/auth/nonce then /api/auth/verify.
 *
 * The property worth defending is that holding an address proves nothing - the
 * caller has to sign a nonce this server issued, once, before it expires. The
 * tests below try the obvious ways around that.
 */
const signer = ethers.Wallet.createRandom();
const otherSigner = ethers.Wallet.createRandom();

const chain = installChainMock(
  makeChain({ roles: { [signer.address.toLowerCase()]: "OFFICER" } })
);

const { createApp } = await import("../../src/app.js");
const AuthNonce = (await import("../../src/models/AuthNonce.js")).default;
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
  chain.roles[signer.address.toLowerCase()] = "OFFICER";
});

/** Walks the real flow: ask for a challenge, sign it, exchange it for a token. */
async function signIn(wallet = signer) {
  const nonceRes = await request(app).post("/api/auth/nonce").send({ address: wallet.address });
  const message = nonceRes.body.message;
  const signature = await wallet.signMessage(message);

  return request(app)
    .post("/api/auth/verify")
    .send({ address: wallet.address, signature, message });
}

describe("POST /api/auth/nonce", () => {
  it("issues a message containing a fresh nonce", async () => {
    const res = await request(app).post("/api/auth/nonce").send({ address: signer.address });

    assert.equal(res.status, 200);
    assert.match(res.body.message, /Nonce:\s*[a-f0-9]{32}/);
    assert.match(res.body.message, new RegExp(signer.address));
  });

  it("persists the nonce as unused", async () => {
    await request(app).post("/api/auth/nonce").send({ address: signer.address });

    const record = await AuthNonce.findOne({ walletAddress: signer.address.toLowerCase() });
    assert.ok(record);
    assert.equal(record.used, false);
  });

  it("issues a different nonce each time", async () => {
    const a = await request(app).post("/api/auth/nonce").send({ address: signer.address });
    const b = await request(app).post("/api/auth/nonce").send({ address: signer.address });

    assert.notEqual(a.body.message, b.body.message);
  });

  it("rejects a malformed address", async () => {
    const res = await request(app).post("/api/auth/nonce").send({ address: "not-an-address" });
    assert.equal(res.status, 400);
  });

  it("rejects a missing address", async () => {
    assert.equal((await request(app).post("/api/auth/nonce").send({})).status, 400);
  });
});

describe("POST /api/auth/verify", () => {
  it("returns a session token for a correctly signed nonce", async () => {
    const res = await signIn();

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.address, signer.address.toLowerCase());
    assert.equal(res.body.role, "OFFICER");
  });

  it("issues a token carrying the wallet and nothing about the role", async () => {
    // Role lives on chain and is re-read per request. A role baked into the
    // token would survive revocation until it expired.
    const { token } = (await signIn()).body;
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    assert.equal(payload.wallet, signer.address.toLowerCase());
    assert.equal(payload.role, undefined, "the token must not carry a role claim");
  });

  it("reads the role from the chain at sign-in, not from the client", async () => {
    chain.roles[signer.address.toLowerCase()] = "JUDICIARY";
    assert.equal((await signIn()).body.role, "JUDICIARY");
  });

  it("records the login against the user with the live role cached", async () => {
    await signIn();

    const user = await User.findOne({ walletAddress: signer.address.toLowerCase() });
    assert.equal(user.roleCache, "OFFICER");
    assert.ok(user.lastLoginAt);
  });

  it("refuses a signature from a different wallet than the one claimed", async () => {
    // The impersonation attempt: claim the officer's address, sign with your own.
    const nonceRes = await request(app).post("/api/auth/nonce").send({ address: signer.address });
    const signature = await otherSigner.signMessage(nonceRes.body.message);

    const res = await request(app).post("/api/auth/verify").send({
      address: signer.address,
      signature,
      message: nonceRes.body.message
    });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /Signature does not match/);
  });

  it("refuses a nonce that was never issued", async () => {
    const message =
      "Sign in to the Blockchain Evidence System.\n\n" +
      `Wallet: ${signer.address}\nNonce: ffffffffffffffffffffffffffffffff\nIssued: ${new Date().toISOString()}`;

    const res = await request(app).post("/api/auth/verify").send({
      address: signer.address,
      signature: await signer.signMessage(message),
      message
    });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /Nonce invalid, expired, or already used/);
  });

  it("refuses to replay a nonce that has already been spent", async () => {
    const nonceRes = await request(app).post("/api/auth/nonce").send({ address: signer.address });
    const body = {
      address: signer.address,
      signature: await signer.signMessage(nonceRes.body.message),
      message: nonceRes.body.message
    };

    assert.equal((await request(app).post("/api/auth/verify").send(body)).status, 200);

    const replay = await request(app).post("/api/auth/verify").send(body);
    assert.equal(replay.status, 401, "a captured sign-in must not be reusable");
  });

  it("refuses an expired nonce", async () => {
    const nonceRes = await request(app).post("/api/auth/nonce").send({ address: signer.address });
    await AuthNonce.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).post("/api/auth/verify").send({
      address: signer.address,
      signature: await signer.signMessage(nonceRes.body.message),
      message: nonceRes.body.message
    });

    assert.equal(res.status, 401);
  });

  it("refuses a message with no nonce in it", async () => {
    const message = "Please just let me in";
    const res = await request(app).post("/api/auth/verify").send({
      address: signer.address,
      signature: await signer.signMessage(message),
      message
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Malformed sign-in message/);
  });

  it("requires address, signature and message together", async () => {
    assert.equal((await request(app).post("/api/auth/verify").send({})).status, 400);
    assert.equal(
      (await request(app).post("/api/auth/verify").send({ address: signer.address })).status,
      400
    );
  });

  it("signs in a wallet that holds no role, reporting NONE rather than failing", async () => {
    // Signing in is proof of address ownership. What that address may do is a
    // separate question, answered per request by requireRole.
    const stranger = ethers.Wallet.createRandom();
    const res = await signIn(stranger);

    assert.equal(res.status, 200);
    assert.equal(res.body.role, "NONE");
  });
});
