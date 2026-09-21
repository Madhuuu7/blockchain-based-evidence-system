import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { env } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const abi = JSON.parse(
  readFileSync(
    path.join(__dirname, "../config/contractAbi.json"),
    "utf-8"
  )
);

export const ROLE_NAMES = [
  "NONE",
  "ADMIN",
  "OFFICER",
  "INVESTIGATOR",
  "JUDICIARY"
];

let provider = null;
let readOnlyContract = null;


// -----------------------------------------------------------------------------
// Ethereum provider
// -----------------------------------------------------------------------------
export function getProvider() {
  if (!env.rpcUrl) {
    throw new Error(
      "RPC_URL not configured — cannot connect to Ethereum network."
    );
  }

  if (!provider) {
    provider = new ethers.JsonRpcProvider(env.rpcUrl);
  }

  return provider;
}


// -----------------------------------------------------------------------------
// Read-only EvidenceRegistry contract
// -----------------------------------------------------------------------------
export function getContract() {
  if (!env.contractAddress) {
    throw new Error(
      "CONTRACT_ADDRESS not configured — deploy the contract first."
    );
  }

  if (!readOnlyContract) {
    readOnlyContract = new ethers.Contract(
      env.contractAddress,
      abi,
      getProvider()
    );
  }

  return readOnlyContract;
}


// -----------------------------------------------------------------------------
// Get wallet role
// -----------------------------------------------------------------------------
export async function getRoleForAddress(address) {
  if (!address) {
    throw new Error("Wallet address is required");
  }

  const contract = getContract();

  const roleIndex = await contract.getRole(address);

  return ROLE_NAMES[Number(roleIndex)] ?? "NONE";
}


// -----------------------------------------------------------------------------
// Get evidence from blockchain
//
// IMPORTANT:
// `callerAddress` is passed as the `from` address.
//
// This allows Solidity to see:
//
//     msg.sender == callerAddress
//
// and therefore correctly check:
//
//     roles[msg.sender] != Role.NONE
// -----------------------------------------------------------------------------
export async function getEvidenceFromChain(evidenceId, callerAddress) {
  if (!callerAddress) {
    throw new Error("Caller wallet address is required");
  }

  const contract = getContract();

  const record = await contract.getEvidence(
    evidenceId,
    {
      from: callerAddress
    }
  );

  return {
    evidenceId: Number(record.evidenceId),
    caseId: record.caseId,
    cid: record.cid,
    description: record.description,
    fileType: record.fileType,
    registeredBy: record.registeredBy,
    timestamp: Number(record.timestamp),
    status: [
      "Registered",
      "UnderReview",
      "Verified",
      "Flagged"
    ][Number(record.status)]
  };
}

export async function getCustodyHistoryFromChain(
  evidenceId,
  callerAddress
) {
  if (!callerAddress) {
    throw new Error("Caller wallet address is required");
  }

  const contract = getContract();

  const events = await contract.getCustodyHistory(
    evidenceId,
    {
      from: callerAddress
    }
  );

  return events.map((e) => ({
    action: [
      "Registered",
      "Accessed",
      "Transferred",
      "Verified"
    ][Number(e.action)],
    actor: e.actor,
    timestamp: Number(e.timestamp),
    note: e.note
  }));
}
// -----------------------------------------------------------------------------
// Export ABI
// -----------------------------------------------------------------------------
export {
  abi as contractAbi
};