import React, { useState } from "react";
import { useWeb3 } from "../context/Web3Context.jsx";

const CHAIN_NAMES = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia",
  31337: "Hardhat Local"
};

const describe = (id) => CHAIN_NAMES[id] || `chain ID ${id}`;

/**
 * Warns when the wallet is on a different network from the deployment, and
 * offers to move it.
 *
 * Saying "wrong network, please switch" and stopping there is not much help:
 * MetaMask hides test networks by default and the toggle that reveals them has
 * moved between versions, so the instruction can be followed correctly and
 * still fail. The button asks the wallet to switch directly, and to add the
 * network first if it does not know it.
 *
 * Nothing renders until the wallet has actually reported a chain, so this is
 * silent for a visitor who has not connected yet.
 */
export default function NetworkBanner() {
  const { isWrongNetwork, chainId, expectedChainId, switchNetwork } = useWeb3();
  const [switching, setSwitching] = useState(false);

  if (!isWrongNetwork) return null;

  const handleSwitch = async () => {
    setSwitching(true);
    try {
      await switchNetwork();
    } catch {
      // switchNetwork reports its own failures through connectError. Catching
      // here as well keeps an unexpected throw from escaping as an unhandled
      // rejection and leaving the button stuck mid-switch.
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-status-warn/40 bg-status-warn/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ocean-900">
            Your wallet is on {describe(chainId)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            This deployment reads and writes on {describe(expectedChainId)}. Evidence and roles
            will not load until the wallet is on the same network.
          </p>
        </div>

        <button
          onClick={handleSwitch}
          disabled={switching}
          className="shrink-0 rounded bg-accent-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-700 disabled:opacity-60"
        >
          {switching ? "Check MetaMask…" : `Switch to ${describe(expectedChainId)}`}
        </button>
      </div>
    </div>
  );
}
