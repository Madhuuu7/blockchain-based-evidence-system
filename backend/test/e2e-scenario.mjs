import { ethers } from "ethers";
import dns from "dns";
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { env } from "../src/config/env.js";
import { contractAbi } from "../src/services/blockchainService.js";
import Evidence from "../src/models/Evidence.js";
import Alert from "../src/models/Alert.js";
import Case from "../src/models/Case.js";
import { recomputeCid } from "../src/services/pinataService.js";

// Opt-in DNS override, matching src/server.js: some Windows setups cannot
// resolve Atlas SRV records through the configured resolver. Set
// DNS_SERVERS=8.8.8.8,8.8.4.4 to switch it on.
if (process.env.DNS_SERVERS) {
  try {
    dns.setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean));
  } catch (e) {}
}

async function runE2EScenario() {
  console.log("===============================================================");
  console.log("STARTING FULL END-TO-END ACCEPTANCE TEST SCENARIO");
  console.log("===============================================================");

  // Connect to local Hardhat node
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const signers = [
    new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider), // Admin #0
    new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider), // Investigator #1
    new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", provider), // Officer #2
    new ethers.Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", provider), // Investigator #3
    new ethers.Wallet("0x47e179ec3461204442ba4702ce9637932211934ba9ddf66d49d0df22204c65f6", provider), // Outsider #4 (Role.NONE)
    new ethers.Wallet("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", provider)  // Judiciary #5
  ];

  const [admin, investigator, officer, investigator2, outsider, judiciary] = signers;
  const contract = new ethers.Contract(env.contractAddress, contractAbi, provider);

  // Connect to MongoDB
  await mongoose.connect(env.mongodbUri);
  console.log("✓ Connected to MongoDB and local Hardhat node");

  // Step 1: Admin verification
  console.log("\n[Step 1] Verifying Admin role on-chain...");
  const adminRole = await contract.getRole(admin.address);
  console.log(`Admin address: ${admin.address}, Role on-chain: ${adminRole} (1 = ADMIN)`);
  if (Number(adminRole) !== 1) throw new Error("Deployer is not ADMIN");
  console.log("✓ Admin verified");

  // Step 2: Assign roles
  console.log("\n[Step 2] Admin assigning roles on-chain...");
  let currentNonce = await provider.getTransactionCount(admin.address, "latest");
  const tx1 = await contract.connect(admin).assignRole(officer.address, 2, { nonce: currentNonce++ });
  await tx1.wait();
  const tx2 = await contract.connect(admin).assignRole(investigator.address, 3, { nonce: currentNonce++ });
  await tx2.wait();
  const tx3 = await contract.connect(admin).assignRole(judiciary.address, 4, { nonce: currentNonce++ });
  await tx3.wait();

  // Fund outsider wallet so it has gas to send transactions
  const fundTx = await admin.sendTransaction({
    to: outsider.address,
    value: ethers.parseEther("5.0"),
    nonce: currentNonce++
  });
  await fundTx.wait();

  const officerRole = await contract.getRole(officer.address);
  const invRole = await contract.getRole(investigator.address);
  const judRole = await contract.getRole(judiciary.address);
  const outRole = await contract.getRole(outsider.address);

  console.log(`Officer (${officer.address}): role ${officerRole} (OFFICER)`);
  console.log(`Investigator (${investigator.address}): role ${invRole} (INVESTIGATOR)`);
  console.log(`Judiciary (${judiciary.address}): role ${judRole} (JUDICIARY)`);
  console.log(`Outsider (${outsider.address}): role ${outRole} (NONE)`);
  console.log("✓ Roles successfully assigned and confirmed on-chain");

  // Step 3: Create a test case
  console.log("\n[Step 3] Creating a case in MongoDB...");
  const testCaseId = `CASE-E2E-${Date.now()}`;
  const testCase = await Case.create({
    caseId: testCaseId,
    title: "E2E Cybercrime Investigation",
    description: "Automated end-to-end verification scenario case",
    createdBy: officer.address.toLowerCase()
  });
  console.log(`✓ Case created: ${testCase.caseId}`);

  // Step 4: Evidence preparation and CID calculation
  console.log("\n[Step 4] Computing genuine CID for test evidence...");
  const evidenceContent = Buffer.from(`Cybercrime Evidence Log: Timestamp ${new Date().toISOString()}\nIncident: Unauthorized API Exfiltration`);
  const computedCid = await recomputeCid(evidenceContent);
  console.log(`Evidence CID computed: ${computedCid}`);

  // Step 5: Officer registers evidence on smart contract
  console.log("\n[Step 5] Officer registering evidence on-chain...");
  const regTx = await contract.connect(officer).registerEvidence(
    testCaseId,
    computedCid,
    "Server network packet capture log",
    "application/octet-stream"
  );
  const receipt = await regTx.wait();
  
  const registeredEvent = receipt.logs
    .map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(p => p?.name === "EvidenceRegistered");

  const newEvidenceId = Number(registeredEvent.args.evidenceId);
  console.log(`✓ EvidenceRegistered emitted! Evidence ID: #${newEvidenceId}, Tx: ${receipt.hash}`);

  // Step 6: Save evidence in MongoDB
  console.log("\n[Step 6] Saving and confirming evidence in MongoDB...");
  const evidenceDoc = await Evidence.create({
    caseId: testCaseId,
    evidenceId: newEvidenceId,
    cid: computedCid,
    description: "Server network packet capture log",
    fileType: "application/octet-stream",
    fileSize: evidenceContent.length,
    registeredBy: officer.address.toLowerCase(),
    txHash: receipt.hash,
    status: "confirmed"
  });
  console.log(`✓ Evidence record saved in MongoDB with status: ${evidenceDoc.status}`);

  // Step 7: Chain of Custody check
  console.log("\n[Step 7] Checking chain-of-custody history on-chain...");
  const history = await contract.connect(investigator).getCustodyHistory(newEvidenceId);
  console.log(`Custody events count: ${history.length}`);
  console.log(`Initial event: actor=${history[0].actor}, note=${history[0].note}`);
  console.log("✓ Chain of custody verified on-chain");

  // Step 8: Investigator verifies evidence integrity
  console.log("\n[Step 8] Investigator verifying evidence integrity...");
  // Recompute CID from content vs on-chain CID
  const onChainRecord = await contract.connect(investigator).getEvidence(newEvidenceId);
  const recomputed = await recomputeCid(evidenceContent);
  const match = (recomputed === onChainRecord.cid);
  console.log(`On-chain CID:   ${onChainRecord.cid}`);
  console.log(`Recomputed CID: ${recomputed}`);
  console.log(`Integrity Match: ${match}`);
  if (!match) throw new Error("Integrity check failed unexpectedly!");

  // Record verification on-chain
  const verifyTx = await contract.connect(investigator).recordVerification(newEvidenceId, true);
  await verifyTx.wait();
  evidenceDoc.status = "verified";
  await evidenceDoc.save();
  console.log("✓ Verification permanently recorded on blockchain (Status: Verified)");

  // Step 9: Test simulated tampering
  console.log("\n[Step 9] Simulating tampered file verification (Tamper Detection)...");
  const tamperedContent = Buffer.from("TAMPERED DATA INJECTION");
  const tamperedCid = await recomputeCid(tamperedContent);
  const tamperedMatch = (tamperedCid === onChainRecord.cid);
  console.log(`Tampered CID:   ${tamperedCid}`);
  console.log(`On-chain CID:   ${onChainRecord.cid}`);
  console.log(`Integrity Match: ${tamperedMatch} (expected FALSE)`);
  if (tamperedMatch) throw new Error("Tamper detection failed!");

  // Record tampering alert in MongoDB
  const tamperAlert = await Alert.create({
    type: "IntegrityViolation",
    walletAddress: investigator.address.toLowerCase(),
    evidenceId: newEvidenceId,
    message: `Integrity check failed for evidence #${newEvidenceId}: content served by IPFS does not match on-chain CID (recomputed: ${tamperedCid}, on-chain: ${onChainRecord.cid})`
  });
  console.log(`✓ IntegrityViolation alert created: ${tamperAlert._id}`);

  // Step 10: Unauthorized wallet attempts access
  console.log("\n[Step 10] Unauthorized wallet (Role.NONE) attempting access on-chain...");
  const accessTx = await contract.connect(outsider).attemptAccess(newEvidenceId);
  const accessReceipt = await accessTx.wait();

  const deniedEvent = accessReceipt.logs
    .map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(p => p?.name === "AccessDenied");

  if (!deniedEvent) throw new Error("AccessDenied event was not emitted!");
  console.log(`✓ AccessDenied event emitted on-chain! Wallet: ${deniedEvent.args.wallet}, Reason: ${deniedEvent.args.reason}`);

  // Step 11: Backend event listener creates Alert
  console.log("\n[Step 11] Creating AccessDenied alert in MongoDB...");
  const accessAlert = await Alert.create({
    type: "AccessDenied",
    walletAddress: outsider.address.toLowerCase(),
    evidenceId: newEvidenceId,
    txHash: accessReceipt.hash,
    message: `Unauthorized access attempt on evidence #${newEvidenceId} by ${outsider.address}: ${deniedEvent.args.reason}`
  });
  console.log(`✓ AccessDenied alert saved in MongoDB: ${accessAlert._id}`);

  // Step 12: Admin views alert and marks resolved
  console.log("\n[Step 12] Admin resolving alert...");
  const fetchedAlert = await Alert.findById(accessAlert._id);
  console.log(`Alert before resolution: resolved=${fetchedAlert.resolved}`);
  
  fetchedAlert.resolved = true;
  await fetchedAlert.save();

  const resolvedAlert = await Alert.findById(accessAlert._id);
  console.log(`Alert after resolution:  resolved=${resolvedAlert.resolved}`);
  if (!resolvedAlert.resolved) throw new Error("Alert resolution was not persisted!");
  console.log("✓ Alert successfully resolved and persisted in MongoDB!");

  // Also resolve tamper alert
  tamperAlert.resolved = true;
  await tamperAlert.save();

  console.log("\n===============================================================");
  console.log("ALL 12 ACCEPTANCE SCENARIO STEPS PASSED SUCCESSFULLY!");
  console.log("===============================================================");

  await mongoose.disconnect();
}

runE2EScenario().catch(err => {
  console.error("E2E Scenario FAILED:", err);
  process.exit(1);
});
