import { ethers } from "ethers";
import { env } from "../config/env.js";
import { contractAbi } from "./blockchainService.js";
import Alert from "../models/Alert.js";
import Evidence from "../models/Evidence.js";

const POLL_INTERVAL_MS = 4000;

/**
 * Subscribes to on-chain events and mirrors the relevant ones into MongoDB.
 *
 * IMPORTANT: this intentionally does NOT use contract.on(eventName, handler)
 * (ethers v6's filter-subscription API, backed by eth_newFilter +
 * eth_getFilterChanges). Hardhat's local JSON-RPC node does not reliably
 * support persistent filters — especially across a node restart — which
 * causes ethers' FilterIdEventSubscriber to throw
 * "TypeError: results is not iterable" repeatedly. That failure is silent
 * from the app's perspective: no error surfaces to the user, alerts just
 * never arrive.
 *
 * Instead, this polls contract.queryFilter(...) directly against a block
 * range on a fixed interval. This works identically against Hardhat,
 * Sepolia, or any other JSON-RPC endpoint, and has no dependency on
 * filter-subscription support.
 */
export function startEventListener() {
  if (!env.contractAddress || !env.rpcUrl) {
    console.warn("[eventListener] CONTRACT_ADDRESS or RPC_URL missing — event listener not started.");
    return;
  }

  const provider = new ethers.JsonRpcProvider(env.rpcUrl);
  const contract = new ethers.Contract(env.contractAddress, contractAbi, provider);

  let lastProcessedBlock = null;

  async function poll() {
    try {
      const currentBlock = await provider.getBlockNumber();

      if (lastProcessedBlock === null) {
        // First run: don't replay the entire chain history, just start
        // watching from here (Hardhat can also happily re-scan from 0 if
        // you want that during a demo — see note below).
        lastProcessedBlock = currentBlock;
        return;
      }

      if (currentBlock <= lastProcessedBlock) {
        return; // no new blocks
      }

      const fromBlock = lastProcessedBlock + 1;
      const toBlock = currentBlock;

      const [accessDeniedLogs, evidenceRegisteredLogs] = await Promise.all([
        contract.queryFilter(contract.filters.AccessDenied(), fromBlock, toBlock),
        contract.queryFilter(contract.filters.EvidenceRegistered(), fromBlock, toBlock)
      ]);

      for (const log of accessDeniedLogs) {
        const { wallet, evidenceId, reason } = log.args;
        try {
          await Alert.create({
            type: "AccessDenied",
            walletAddress: wallet.toLowerCase(),
            evidenceId: Number(evidenceId),
            txHash: log.transactionHash,
            message: `Unauthorized access attempt on evidence #${evidenceId} by ${wallet}: ${reason}`
          });
          console.log(`[eventListener] AccessDenied alert saved for evidence #${evidenceId} (tx ${log.transactionHash})`);
        } catch (err) {
          console.error("[eventListener] Failed to persist AccessDenied alert:", err.message);
        }
      }

      for (const log of evidenceRegisteredLogs) {
        const { evidenceId, caseId, cid } = log.args;
        try {
          await Evidence.findOneAndUpdate(
            { caseId, cid, status: "pending-chain" },
            { evidenceId: Number(evidenceId), status: "confirmed", txHash: log.transactionHash },
            { sort: { createdAt: -1 } }
          );
          console.log(`[eventListener] Evidence #${evidenceId} confirmed on-chain (tx ${log.transactionHash})`);
        } catch (err) {
          console.error("[eventListener] Failed to confirm evidence:", err.message);
        }
      }

      lastProcessedBlock = toBlock;
    } catch (err) {
      console.error("[eventListener] Poll error:", err.message);
      // Don't advance lastProcessedBlock on failure — we'll retry the same
      // range next tick rather than silently skipping blocks.
    }
  }

  console.log(`[eventListener] Polling for AccessDenied and EvidenceRegistered events every ${POLL_INTERVAL_MS}ms...`);
  poll(); // run once immediately to set the starting block
  setInterval(poll, POLL_INTERVAL_MS);
}