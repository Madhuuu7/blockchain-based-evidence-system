import { mock } from "node:test";
import { WALLETS } from "./auth.mjs";

/**
 * A stand-in for the Ethereum node.
 *
 * The contract itself is covered by 19 Hardhat tests against a real EVM, so
 * what the API tests need is not another chain - it is control. Pointing these
 * at a live node would mean every assertion about an unauthorised caller, a
 * missing evidence id or an RPC outage depended on first arranging that state
 * on chain, and an outage cannot be arranged at all.
 *
 * So the chain becomes a table and the HTTP layer is tested against it: who
 * holds which role, which evidence exists, and what the chain says the CID is.
 *
 * Every method reads its state through the returned object rather than
 * capturing it, so a test can revoke a role or take the RPC down mid-test and
 * the already-imported module sees the change.
 */
export function makeChain(overrides = {}) {
  const chain = {
    roles: {
      [WALLETS.ADMIN]: "ADMIN",
      [WALLETS.OFFICER]: "OFFICER",
      [WALLETS.INVESTIGATOR]: "INVESTIGATOR",
      [WALLETS.JUDICIARY]: "JUDICIARY",
      ...(overrides.roles || {})
    },

    evidence: new Map(Object.entries(overrides.evidence || {})),
    custody: new Map(Object.entries(overrides.custody || {})),

    /** Flip to true to simulate an unreachable Ethereum node. */
    rpcDown: Boolean(overrides.rpcDown),

    /**
     * Addresses whose role lookup fails while the rest of the chain answers
     * normally. A blanket outage cannot exercise a per-record fallback, since
     * the caller's own role check fails first and the request never gets that
     * far - this models the partial failure instead.
     */
    roleLookupFailures: new Set(overrides.roleLookupFailures || []),

    ROLE_NAMES: ["NONE", "ADMIN", "OFFICER", "INVESTIGATOR", "JUDICIARY"],

    async getRoleForAddress(address) {
      if (chain.rpcDown) throw new Error("could not detect network");
      if (!address) throw new Error("Wallet address is required");
      if (chain.roleLookupFailures.has(String(address).toLowerCase())) {
        throw new Error("could not detect network");
      }
      return chain.roles[String(address).toLowerCase()] ?? "NONE";
    },

    async getEvidenceFromChain(evidenceId, callerAddress) {
      if (chain.rpcDown) throw new Error("could not detect network");
      if (!callerAddress) throw new Error("Caller wallet address is required");

      // Mirrors the contract: a wallet with no role cannot read evidence.
      const role = chain.roles[String(callerAddress).toLowerCase()] ?? "NONE";
      if (role === "NONE") {
        throw new Error("execution reverted: caller has no assigned role");
      }

      const record = chain.evidence.get(String(evidenceId));
      if (!record) throw new Error("execution reverted: evidence does not exist");

      return { ...record };
    },

    async getCustodyHistoryFromChain(evidenceId, callerAddress) {
      if (chain.rpcDown) throw new Error("could not detect network");
      if (!callerAddress) throw new Error("Caller wallet address is required");

      const role = chain.roles[String(callerAddress).toLowerCase()] ?? "NONE";
      if (role === "NONE") {
        throw new Error("execution reverted: caller has no assigned role");
      }

      return chain.custody.get(String(evidenceId)) || [];
    },

    getProvider: () => ({}),
    getContract: () => ({}),
    contractAbi: []
  };

  return chain;
}

/** Replaces blockchainService for the current test process. */
export function installChainMock(chain) {
  mock.module(new URL("../../src/services/blockchainService.js", import.meta.url).href, {
    namedExports: chain
  });
  return chain;
}

/**
 * Replaces the IPFS side with a content-addressed map standing in for a
 * gateway, so a test can serve bytes that do not match their CID - which is
 * the tampering case, and cannot be arranged against a real gateway.
 */
export function installIpfsMock({ files = {}, gatewayDown = false } = {}) {
  const store = new Map(Object.entries(files));
  const real = import("../../src/services/pinataService.js");
  const state = { gatewayDown };

  mock.module(new URL("../../src/services/pinataService.js", import.meta.url).href, {
    namedExports: {
      async fetchFromIpfs(cid) {
        if (state.gatewayDown) {
          throw new Error(`Failed to fetch CID ${cid} from IPFS gateway (504)`);
        }
        if (!store.has(cid)) {
          throw new Error(`Failed to fetch CID ${cid} from IPFS gateway (404)`);
        }
        return store.get(cid);
      },

      async uploadToPinata(buffer) {
        const { recomputeCid } = await real;
        const cid = await recomputeCid(buffer);
        store.set(cid, buffer);
        return { cid, storage: "pinata" };
      },

      async recomputeCid(buffer) {
        const { recomputeCid } = await real;
        return recomputeCid(buffer);
      }
    }
  });

  return { store, state };
}
