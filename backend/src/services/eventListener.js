import { ethers } from "ethers";
import { env } from "../config/env.js";
import { contractAbi } from "./blockchainService.js";
import Alert from "../models/Alert.js";
import Evidence from "../models/Evidence.js";

const POLL_INTERVAL_MS = 2000;

/**
 * Subscribes to on-chain events and mirrors the relevant ones into MongoDB.
 *
 * NOTE: This polls contract.queryFilter(...) directly against block ranges.
 * This is robust against local Hardhat node restarts and does not fail with
 * Ethers v6 FilterIdEventSubscriber "results is not iterable" errors.
 */
let pollTimer = null;
let lastProcessedBlock = null;

export function startEventListener() {
  if (!env.contractAddress || !env.rpcUrl) {
    console.warn("[eventListener] CONTRACT_ADDRESS or RPC_URL missing — event listener not started.");
    return;
  }

  const provider = new ethers.JsonRpcProvider(env.rpcUrl);
  const contract = new ethers.Contract(env.contractAddress, contractAbi, provider);

  async function poll() {
    try {
      const currentBlock = await provider.getBlockNumber();

      // Handle Hardhat node restarts where chain resets to block 0
      if (lastProcessedBlock !== null && currentBlock < lastProcessedBlock) {
        console.log(`[eventListener] Node reset detected (block ${currentBlock} < ${lastProcessedBlock}). Resetting tracker.`);
        lastProcessedBlock = null;
      }

      if (lastProcessedBlock === null) {
        // On first run, scan up to 100 recent blocks so we don't drop events that occurred
        // immediately prior to backend startup or during local testing
        lastProcessedBlock = Math.max(0, currentBlock - 100);
      }

      if (currentBlock < lastProcessedBlock) {
        return;
      }

      const fromBlock = lastProcessedBlock === currentBlock ? currentBlock : lastProcessedBlock + 1;
      const toBlock = currentBlock;

      if (fromBlock <= toBlock) {
        const [accessDeniedLogs, evidenceRegisteredLogs] = await Promise.all([
          contract.queryFilter(contract.filters.AccessDenied(), fromBlock, toBlock),
          contract.queryFilter(contract.filters.EvidenceRegistered(), fromBlock, toBlock)
        ]);

        for (const log of accessDeniedLogs) {
          const { wallet, evidenceId, reason } = log.args;
          try {
            // Deduplicate by txHash to avoid redundant alerts
            const existing = await Alert.findOne({
              txHash: log.transactionHash,
              type: "AccessDenied"
            });

            if (!existing) {
              await Alert.create({
                type: "AccessDenied",
                walletAddress: wallet.toLowerCase(),
                evidenceId: Number(evidenceId),
                txHash: log.transactionHash,
                message: `Unauthorized access attempt on evidence #${evidenceId} by ${wallet}: ${reason}`
              });
              console.log(`[eventListener] AccessDenied alert saved for evidence #${evidenceId} (tx ${log.transactionHash})`);
            }
          } catch (err) {
            console.error("[eventListener] Failed to persist AccessDenied alert:", err.message);
          }
        }

        for (const log of evidenceRegisteredLogs) {
          const { evidenceId, caseId, cid } = log.args;
          try {
            await Evidence.findOneAndUpdate(
              { caseId, cid },
              { evidenceId: Number(evidenceId), status: "confirmed", txHash: log.transactionHash },
              { sort: { createdAt: -1 } }
            );
            console.log(`[eventListener] Evidence #${evidenceId} confirmed on-chain (tx ${log.transactionHash})`);
          } catch (err) {
            console.error("[eventListener] Failed to confirm evidence:", err.message);
          }
        }

        lastProcessedBlock = toBlock;
      }
    } catch (err) {
      if (err.code === "ECONNREFUSED" || err.message?.includes("could not detect network")) {
        console.warn(`[eventListener] Waiting for blockchain node at ${env.rpcUrl}...`);
      } else {
        console.error("[eventListener] Poll error:", err.message);
      }
    }
  }

  console.log(`[eventListener] Polling for AccessDenied and EvidenceRegistered events every ${POLL_INTERVAL_MS}ms on ${env.rpcUrl}...`);
  poll();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopEventListener() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}