# User Manual

All operations in the Cybercrime Evidence Management System require a MetaMask-connected Ethereum wallet. Authentication is established by signing a cryptographic challenge message (EIP-191 personal sign) without incurring any gas fees. Your role is dynamically derived directly from the immutable `EvidenceRegistry` smart contract on every session sign-in and protected route request.

---

## 1. Administrator (`ADMIN`)

1. **Sign in** with the wallet used to deploy the smart contract (Account #0 is automatically bootstrapped as `ADMIN` in the contract constructor).
2. **Assign Roles:**
   - Navigate to **Users**.
   - Input the target Ethereum address (`0x...`).
   - Select the desired role (`OFFICER`, `INVESTIGATOR`, `JUDICIARY`, or `ADMIN`).
   - Click **Assign Role** and confirm the transaction in MetaMask.
   - The role takes effect immediately upon block confirmation.
3. **Security Incident Monitoring:**
   - Navigate to **Alerts** to monitor real-time unauthorized access violations (`AccessDenied`) and file tampering events (`IntegrityViolation`).
   - Use the filter controls to view *All*, *Unresolved Only*, or *Resolved Only*.
   - Click **Mark Resolved** to formally acknowledge and close an incident. The resolution timestamp and flag are persisted in MongoDB.
4. **Audit Dashboard:**
   - The main **Dashboard** presents live metrics: Total Evidence Count, Total Registered Cases, Active Users, and Open Security Alerts.

---

## 2. Police Officer (`OFFICER`)

1. Sign in with an `OFFICER`-assigned wallet (e.g., Hardhat Account #2: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`).
2. **Create a Case:**
   - Navigate to **Cases**.
   - Fill in Case ID (e.g., `CASE-2026-001`), Case Title, and brief incident summary.
   - Click **Create Case**.
3. **Upload & Register Digital Evidence:**
   - Navigate to **Evidence → Upload Evidence**.
   - Enter the associated Case ID, evidence category (e.g., `disk-image`, `packet-capture`, `audit-log`), and a detailed description.
   - Select the evidence file (supports files up to 100MB).
   - Click **Upload & Register Evidence**.
   - The UI advances through 4 automated stages:
     1. *Uploading to IPFS*: File pinned via Pinata, generating raw CIDv1.
     2. *Awaiting Signature*: Prompts MetaMask to invoke `registerEvidence(caseId, cid, description, fileType)`.
     3. *Confirming*: Waits for block confirmation on the blockchain ledger.
     4. *Success*: Displays immutable IPFS CID, blockchain transaction hash, block number, and a direct link to the Evidence Detail page.

---

## 3. Forensic Investigator (`INVESTIGATOR`)

1. Sign in with an `INVESTIGATOR`-assigned wallet (e.g., Hardhat Account #1: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`).
2. **Case Creation & Search:**
   - Investigators can create and manage cases under **Cases**.
   - Under **Evidence**, use the search bar, Evidence ID filter, and status filter to locate relevant items.
3. **Examine Evidence & Chain of Custody:**
   - Open any evidence item to review its on-chain registration timestamp, registered officer address, IPFS CID, and complete visual timeline of custody events.
4. **Download Evidence File:**
   - Click **Download / View Evidence File** to stream the authentic file byte stream directly from the IPFS gateway to your local machine.
5. **Cryptographic Integrity Verification:**
   - Click **Verify Integrity**.
   - The system fetches the raw file from IPFS, computes its SHA256 CIDv1 hash, compares it with the immutable on-chain record, and checks database consistency.
   - If verified, status displays `Integrity Verified ✓` and the verification event is permanently committed to the blockchain.
   - If tampered, status changes to `Flagged`, an `IntegrityViolation` alarm is raised, and the alert surfaces to the Admin.
6. **Transfer Custody:**
   - Enter the destination wallet address of another assigned role holder and click **Transfer Custody**.
   - Signs `transferCustody(evidenceId, newHolder)` via MetaMask and updates the audit trail.

---

## 4. Judiciary / Court Officer (`JUDICIARY`)

1. Sign in with a `JUDICIARY`-assigned wallet (e.g., Hardhat Account #5: `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc`).
2. **Review Admissibility:**
   - Inspect evidence items, case background, and full historical chain-of-custody timeline.
3. **Independent Verification:**
   - Execute the same **Verify Integrity** check to independently validate that evidence presented in court matches the exact hash registered at the time of seizure.
   - Note: Judiciary accounts cannot transfer custody, preventing accidental reassignment of active court evidence.

---

## 5. Security & Unauthorized Access Enforcement

If an unassigned or unauthorized wallet (`Role.NONE`) attempts to access evidence files or calls protected methods:
1. Hard access path: `getEvidence()` and custody endpoints immediately revert with `reverted: caller has no assigned role`, and the backend returns HTTP 403.
2. Probe access path: Calling `attemptAccess()` emits an immutable `AccessDenied` event on-chain without reverting.
3. The backend event listener captures the event, creates a high-priority `AccessDenied` alert in MongoDB, and displays the incident on the Admin Alerts dashboard.
