# Blockchain-Based Cybercrime Evidence Management System

> **A tamper-evident, decentralized digital evidence management and chain-of-custody platform combining Ethereum smart contracts, IPFS/Pinata distributed storage, Node.js/Express REST APIs, and a React/MetaMask interface.**

---

## 1. Problem Statement
In traditional digital forensics and law enforcement investigations, electronic evidence (disk images, network captures, surveillance recordings, incident logs) faces severe integrity and custody verification vulnerabilities:
- **Tampering & Spoliation Risks:** Digital files can be modified, backdated, or deleted without leaving an immutable audit trail.
- **Custody Disputes:** Proving exactly *who* collected, accessed, transferred, or analyzed an evidence item in a court of law often relies on fallible paper logs or centralized databases vulnerable to insider modification.
- **Single Point of Failure:** Centralized evidence repositories can be compromised by unauthorized administrative overrides.
- **Opaque Access Logs:** Unauthorized access attempts often go unnoticed without cryptographically enforceable alarms.

---

## 2. Project Objectives
1. **Immutable Chain of Custody:** Record all custody transitions (registration, access, transfer, verification) permanently on a public/private Ethereum-compatible ledger.
2. **Decentralized Storage:** Store large evidence files off-chain via IPFS (InterPlanetary File System) using cryptographic content identifiers (CIDs), ensuring files never bloat the blockchain.
3. **Cryptographic Content Verification:** Guarantee file integrity by independently recomputing multihash CIDv1 values from file byte streams and comparing them against on-chain commitments.
4. **Smart Contract Role-Based Access Control (RBAC):** Enforce strict cryptographic authorization directly at the contract layer (`ADMIN`, `OFFICER`, `INVESTIGATOR`, `JUDICIARY`).
5. **Real-time Security Alerts:** Detect unauthorized access attempts and integrity mismatches using on-chain event emission (`AccessDenied`) mirrored to an Admin dashboard for formal incident resolution.

---

## 3. Key Features

- **Decentralized Role Management:**
  - `ADMIN`: Bootstrap deployer capable of assigning/removing roles and reviewing security alerts.
  - `OFFICER`: Submits evidence files, computes IPFS hashes, and signs on-chain evidence registration transactions.
  - `INVESTIGATOR`: Opens cases, receives/transfers evidence custody, and executes cryptographic verification.
  - `JUDICIARY`: Reads authorized evidence and verifies chain of custody for courtroom admissibility without custody transfer permissions.
- **Zero-Trust Off-Chain Architecture:**
  - Large binary evidence files are pinned to IPFS through Pinata.
  - Only cryptographic CIDs, case identifiers, file types, and timestamps are committed on-chain.
- **Non-Reverting Authorization Probe & Security Alerts:**
  - Non-authorized wallets calling `attemptAccess()` trigger an on-chain `AccessDenied` event without reverting, allowing the event listener to log the violation in MongoDB and alert administrators.
- **Tamper Detection & Verification:**
  - The verification engine downloads bytes from IPFS, recomputes the raw sha256 CIDv1, checks against on-chain records, and flags any bit-level tampering.
- **MetaMask Web3 & Nonce-Based Authentication:**
  - Sign-in via cryptographic message signing (EIP-191 personal sign) with one-time server nonces to prevent replay attacks.

---

## 4. System Architecture

```
+-------------------------------------------------------------------------------+
|                             PRESENTATION LAYER                                |
|   React (Vite) + Tailwind CSS + Ethers.js v6 + MetaMask Web3 Provider        |
+---------------------------------------+---------------------------------------+
                                        |
                   +--------------------+--------------------+
                   | HTTP / REST (JWT)                       | JSON-RPC (eth_call / tx)
                   v                                         v
+---------------------------------------+   +-----------------------------------+
|            BACKEND API                |   |        BLOCKCHAIN LAYER           |
|  - Node.js & Express                  |   |  - EvidenceRegistry.sol (0.8.24)  |
|  - Mongoose / MongoDB Atlas           |   |  - Hardhat Local / Sepolia        |
|  - Ethers v6 Event Listener           |<--|  - Events: EvidenceRegistered,    |
|  - Multiformats CID recomputation     |   |    AccessDenied, CustodyEvents    |
+-------------------+-------------------+   +-----------------------------------+
                    |
                    | IPFS HTTP / Pinning API
                    v
+---------------------------------------+
|             STORAGE LAYER             |
|  - IPFS / Pinata Cloud Gateway        |
|  - Raw single-block CIDv1 Commitments |
+---------------------------------------+
```

---

## 5. Technology Stack

| Layer | Technologies |
|---|---|
| **Blockchain** | Solidity `^0.8.24`, Hardhat, Ethers.js `^6.13.1` |
| **Backend API** | Node.js (ES Modules), Express.js, Mongoose `^8.5.1`, JWT, Multer, Helmet, Morgan |
| **Decentralized Storage** | IPFS, Pinata Gateway, Multiformats (`multiformats/cid`, `multiformats/hashes/sha2`) |
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide Icons, Ethers.js v6 BrowserProvider |
| **Database** | MongoDB Atlas / Local MongoDB |

---

## 6. Project Structure

```
evidence-system/
├── blockchain/
│   ├── contracts/
│   │   └── EvidenceRegistry.sol      # Core smart contract
│   ├── scripts/
│   │   └── deploy.js                 # Deployment script
│   ├── test/
│   │   └── EvidenceRegistry.test.js  # 19 automated smart contract unit tests
│   ├── hardhat.config.js             # Hardhat network configuration
│   └── deployments/localhost.json    # Deployed address and ABI
├── backend/
│   ├── src/
│   │   ├── config/                   # Environment & ABI loader
│   │   ├── controllers/              # Auth, Evidence, Case, Alert, User controllers
│   │   ├── middleware/               # RBAC & Multer file upload handlers
│   │   ├── models/                   # Mongoose schemas (Evidence, Alert, Case, User)
│   │   ├── routes/                   # Express route definitions
│   │   ├── services/                 # IPFS Pinata, Blockchain, and Event Listener
│   │   └── server.js                 # Server entry point
│   ├── test/
│   │   ├── system-check.mjs          # CID & Mongo unit verification
│   │   └── e2e-scenario.mjs          # Complete 12-step automated scenario
│   └── mock-gateway.js               # Simulated tampered IPFS gateway for demos
├── frontend/
│   ├── src/
│   │   ├── components/               # Layout, ProtectedRoute, StatusBadge
│   │   ├── context/                  # Web3Context & AuthContext
│   │   ├── pages/                    # Dashboard, Cases, Evidence, Upload, Alerts, Users
│   │   └── services/api.js           # Axios instance with interceptors
└── docs/                             # Full architectural and operational manuals
```

---

## 7. Installation & Environment Setup

### Prerequisites
- Node.js `>= 18.0.0` (LTS recommended)
- Git
- MetaMask Browser Extension
- (Optional) Free Pinata API Key & MongoDB Atlas account

### 1. Smart Contract & Blockchain Setup
```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat test
```

### 2. Backend Setup
```bash
cd ../backend
npm install
```
Create `backend/.env` based on `backend/.env.example`:
```env
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/evidence_db?retryWrites=true&w=majority
PINATA_JWT=your_pinata_jwt_here
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
RPC_URL=http://127.0.0.1:8545/
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
JWT_SECRET=super_secret_jwt_key_evidence_system_2026
FRONTEND_ORIGIN=http://localhost:5173
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
```
Create `frontend/.env` based on `frontend/.env.example`:
```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_CHAIN_ID=31337
VITE_RPC_URL=http://127.0.0.1:8545
```

---

## 8. How to Run the System

**The system runs on the Sepolia public testnet by default.** The contract is
deployed, all four roles are assigned, and the demonstration data is in place,
so starting it is two commands:

```bash
cd backend   && npm start      # http://localhost:4000
cd frontend  && npm run dev    # http://localhost:5173
```

There is no chain to run and no contract to deploy — both already exist on a
public network, and they survive restarting or closing the laptop.

- **Contract:** `0xd2dc06254EC6F920e98e0E5CB4Fc028F3b2a410C`
- **Etherscan:** https://sepolia.etherscan.io/address/0xd2dc06254EC6F920e98e0E5CB4Fc028F3b2a410C

Running against a local Hardhat chain is still supported and is the faster
option while developing. It needs four terminals and the chain resets whenever
it stops.

**Full instructions for both, a demonstration script, and a troubleshooting
section: [docs/running.md](docs/running.md).**

Before demonstrating, confirm the environment is wired up:

```bash
cd backend && npm run check
```

---

## 9. MetaMask Configuration

Network: **Sepolia** (chain id 11155111). If it is not in the network list,
MetaMask is hiding test networks — the application shows a **Switch to Sepolia**
button that does it for you.

Accounts: use wallets generated in MetaMask from your own recovery phrase. The
roles on the deployed contract are held by:

| Role | Address |
| --- | --- |
| ADMIN | `0xd59C546811E9F6DF6B09ec3a63d0da98D2a2093c` |
| OFFICER | `0x8085D31a8ff75cfE446cFBcAfcfdDb2dB0c46Bc6` |
| INVESTIGATOR | `0x680B318d16809581BA93270Fa6cB8b0BE09dD9CE` |
| JUDICIARY | `0x99b5506C0438b846E27251249aCf8604F04d513f` |

> **Do not use the Hardhat test accounts on a public network.** Their private
> keys are published in Hardhat's documentation and are the same on every
> machine, so they are fine on a local chain and unsafe anywhere else — granting
> one a role would let anyone who read this repository take over the contract.
> Importing such a key into MetaMask does not make it private.
>
> For a **local** chain only, import the keys printed by `npx hardhat node`.

---

## 10. Automated Testing

### Smart Contract Unit Tests (19 tests)
```bash
cd blockchain
npx hardhat test
```

### Backend Unit & Integration Tests (117 tests)
```bash
cd backend
npm test
```
*Runs offline against an in-memory MongoDB — no database, network or deployed
contract required.*

### Frontend Component Tests (38 tests)
```bash
cd frontend
npm test
```

### Full 12-Step E2E Lifecycle Acceptance Test
```bash
cd backend
npm run test:e2e
```
*Requires a **local** chain with all four services running.*

### Frontend Production Build Test
```bash
cd frontend
npm run build
```

---

## 11. Demonstrating Tamper Detection (Integrity Violation)

To simulate courtroom evidence tampering during a demonstration:
1. Start the mock corrupted gateway:
   ```bash
   cd backend
   node mock-gateway.js <target_evidence_cid>
   ```
2. In `backend/.env`, set `PINATA_GATEWAY=http://localhost:5050/ipfs` and restart the backend.
3. Open the evidence detail page and click **Verify Integrity**.
4. The system detects altered byte contents, flags the evidence status as `Flagged`, emits an `IntegrityViolation` alert, and registers the failure permanently on-chain.

---

## 12. Future Enhancements
- **Zero-Knowledge Evidence Redaction:** Allow partial evidence disclosure without revealing sensitive personally identifiable information (PII).
- **Decentralized Identity (DID):** Integrate verifiable credentials for police badge and court credentials.
- **Layer-2 Rollup Deployment:** Deploy to Arbitrum or Polygon zkEVM for negligible gas costs in municipal police environments.
