# Comprehensive Testing Documentation

This document covers all automated test suites and end-to-end integration testing for the Blockchain-Based Cybercrime Evidence Management System.

---

## 1. Smart Contract Unit Tests (Hardhat + Chai)

**Location:** `blockchain/test/EvidenceRegistry.test.js`

### Execution:
```bash
cd blockchain
npx hardhat test
```

### Coverage (19 Passing Tests):
1. **Deployment:** Deployer bootstrapped as `ADMIN` (Account #0).
2. **Admin Role:** `getRole(deployer)` correctly returns `Role.ADMIN` (1).
3. **Role Assignment:** ADMIN assigns `Role.OFFICER` and emits `RoleAssigned`.
4. **Unauthorized Role Assignment:** Non-admin cannot assign roles (reverts).
5. **Role Removal:** ADMIN can remove roles and emits `RoleRemoved`.
6. **Evidence Registration:** OFFICER registers evidence and emits `EvidenceRegistered`.
7. **Unauthorized Registration:** Non-officer is rejected with `incorrect role for this action`.
8. **Evidence Retrieval:** Authorized roles read evidence via `getEvidence()`.
9. **Authorized Access Probe:** `attemptAccess()` returns true and logs `AccessEvent`.
10. **Hard Access Gate:** `getEvidence()` reverts for `Role.NONE`.
11. **Non-Reverting Unauthorized Probe:** `attemptAccess()` succeeds for `Role.NONE` and emits `AccessDenied` without rolling back logs.
12. **Chain of Custody Registration Event:** Initial `Registered` event appended to timeline.
13. **Custody Transfer:** INVESTIGATOR transfers custody to another assigned wallet, emitting `TransferEvent`.
14. **Transfer Recipient Check:** Rejects transfer to a wallet with `Role.NONE`.
15. **Input Validation:** Rejects empty `caseId`.
16. **Non-Existent Records:** Reverts operations on non-existent `evidenceId`.
17. **Duplicate Prevention:** Rejects duplicate `(caseId, cid)` pair via duplicate guard.
18. **Verification Recording:** INVESTIGATOR records integrity verified, sets `EvidenceStatus.Verified`.
19. **Integrity Flagging:** JUDICIARY records violation, sets `EvidenceStatus.Flagged`.

---

## 2. Backend Automated Unit & Integration Tests

**Location:** `backend/test/system-check.mjs`

### Execution:
```bash
cd backend
npm test
```

### Coverage:
1. **Genuine IPFS CIDv1 Recomputation:** Verifies that multiformats raw SHA256 CID derivation produces exact CIDv1 strings for known evidence fixtures.
2. **Tamper Detection Simulation:** Confirms that altered file byte streams produce distinct CIDs that trigger integrity mismatches.
3. **MongoDB Connection & Historical Data Preservation:** Validates SRV DNS resolution and verifies that legacy records (such as `CASE-2026-015`) exist and are cleanly disambiguated using composite queries `{ caseId, cid }`.

---

## 3. Full 12-Step End-to-End Acceptance Scenario

**Location:** `backend/test/e2e-scenario.mjs`

### Execution:
```bash
cd backend
npm run test:e2e
```

### Walkthrough of Automated Verification:
- **Step 1:** Verifies deployer is `ADMIN` on the live smart contract.
- **Step 2:** Admin assigns `OFFICER` (Account #2), `INVESTIGATOR` (Account #1), and `JUDICIARY` (Account #5) on-chain.
- **Step 3:** Officer creates an active case in MongoDB.
- **Step 4:** Recomputes authentic IPFS CID from evidence buffer.
- **Step 5:** Officer signs on-chain transaction registering evidence; contract emits `EvidenceRegistered`.
- **Step 6:** Confirms evidence in MongoDB with real `evidenceId` and `txHash`.
- **Step 7:** Verifies chain-of-custody history directly from the blockchain.
- **Step 8:** Investigator verifies evidence integrity; on-chain record matches recomputed CID; records `Verified` status on-chain.
- **Step 9:** Simulates tampered file verification; detects mismatch and creates `IntegrityViolation` alert in MongoDB.
- **Step 10:** Unauthorized wallet (`Role.NONE`) attempts access via `attemptAccess()`; contract emits `AccessDenied`.
- **Step 11:** Backend event listener captures `AccessDenied` and logs security alert in MongoDB.
- **Step 12:** Admin retrieves the alert, resolves it, and verifies `resolved: true` is persisted.

---

## 4. Frontend Production Build Check

**Location:** `frontend/`

### Execution:
```bash
cd frontend
npm run build
```

Confirms zero syntax errors, valid JSX formatting, clean Tailwind CSS compilation, and production bundle generation.

---

## 5. Tamper Demonstration via Mock Gateway

To test or demonstrate gateway-level tampering to an audience:
1. Launch the mock corrupted gateway:
   ```bash
   cd backend
   node mock-gateway.js <target_cid>
   ```
2. Set `PINATA_GATEWAY=http://localhost:5050/ipfs` in `backend/.env` and restart the backend.
3. Click **Verify Integrity** on the evidence page.
4. The system detects the altered bytes, sets status to `Flagged`, emits an `IntegrityViolation` alert, and registers the tamper status immutably on the blockchain.
