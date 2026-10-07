import "../helpers/setup.mjs";
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { WALLETS, tokenFor } from "../helpers/auth.mjs";
import { makeChain, installChainMock } from "../helpers/chain.mjs";

const chain = installChainMock(makeChain());
const { requireAuth, requireRole } = await import("../../src/middleware/auth.js");

/** Minimal Express double - records what the handler did rather than sending. */
function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (payload) => ((res.body = payload), res);
  return res;
}

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", () => {
    const res = mockRes();
    const next = mock.fn();
    requireAuth({ headers: {} }, res, next);

    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /Missing authorization token/);
    assert.equal(next.mock.callCount(), 0, "must not continue past a missing token");
  });

  it("rejects a header that is not a Bearer token", () => {
    const res = mockRes();
    const next = mock.fn();
    requireAuth({ headers: { authorization: `Basic ${tokenFor(WALLETS.ADMIN)}` } }, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  });

  it("rejects a token signed with the wrong secret", () => {
    const forged = jwt.sign({ wallet: WALLETS.ADMIN }, "not-the-real-secret");
    const res = mockRes();
    const next = mock.fn();
    requireAuth({ headers: { authorization: `Bearer ${forged}` } }, res, next);

    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /Invalid or expired/);
    assert.equal(next.mock.callCount(), 0);
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ wallet: WALLETS.ADMIN }, process.env.JWT_SECRET, {
      expiresIn: "-1s"
    });
    const res = mockRes();
    const next = mock.fn();
    requireAuth({ headers: { authorization: `Bearer ${expired}` } }, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  });

  it("accepts a valid token and lowercases the wallet onto the request", () => {
    const mixedCase = "0xD59C546811E9F6DF6B09EC3A63D0DA98D2A2093C";
    const signed = jwt.sign({ wallet: mixedCase }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${signed}` } };
    const next = mock.fn();

    requireAuth(req, mockRes(), next);

    assert.equal(next.mock.callCount(), 1);
    assert.equal(req.wallet, mixedCase.toLowerCase(), "downstream lookups are case-sensitive");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    chain.roles[WALLETS.OFFICER] = "OFFICER";
  });

  it("allows a caller holding the permitted role", async () => {
    const req = { wallet: WALLETS.OFFICER };
    const next = mock.fn();
    await requireRole("OFFICER")(req, mockRes(), next);

    assert.equal(next.mock.callCount(), 1);
    assert.equal(req.role, "OFFICER");
  });

  it("allows any one of several permitted roles", async () => {
    const next = mock.fn();
    await requireRole("INVESTIGATOR", "JUDICIARY", "ADMIN")(
      { wallet: WALLETS.JUDICIARY },
      mockRes(),
      next
    );

    assert.equal(next.mock.callCount(), 1);
  });

  it("rejects a caller holding a different role with 403", async () => {
    const res = mockRes();
    const next = mock.fn();
    await requireRole("ADMIN")({ wallet: WALLETS.OFFICER }, res, next);

    assert.equal(res.statusCode, 403);
    assert.equal(next.mock.callCount(), 0);
  });

  it("rejects a wallet with no role at all", async () => {
    const res = mockRes();
    await requireRole("OFFICER")({ wallet: WALLETS.NONE }, res, mock.fn());

    assert.equal(res.statusCode, 403);
  });

  it("reads the role from the chain on every request, never from the token", async () => {
    // The session token carries no role by design. Revoking on-chain has to
    // take effect on the very next request, with no re-login and no cache to
    // wait out.
    const next = mock.fn();
    await requireRole("OFFICER")({ wallet: WALLETS.OFFICER }, mockRes(), next);
    assert.equal(next.mock.callCount(), 1);

    chain.roles[WALLETS.OFFICER] = "NONE";

    const res = mockRes();
    const afterRevoke = mock.fn();
    await requireRole("OFFICER")({ wallet: WALLETS.OFFICER }, res, afterRevoke);

    assert.equal(res.statusCode, 403, "a revoked role must be refused immediately");
    assert.equal(afterRevoke.mock.callCount(), 0);
  });

  it("fails closed with 503 when the chain is unreachable", async () => {
    // An RPC outage must never be read as "no restrictions apply".
    chain.rpcDown = true;

    const res = mockRes();
    const next = mock.fn();
    await requireRole("ADMIN")({ wallet: WALLETS.ADMIN }, res, next);

    chain.rpcDown = false;

    assert.equal(res.statusCode, 503);
    assert.equal(next.mock.callCount(), 0, "must not fall through when the role is unknown");
  });
});
