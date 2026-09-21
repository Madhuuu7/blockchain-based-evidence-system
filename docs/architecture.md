# Architecture — Blockchain Based Cyber Crime Evidence System

## 1. Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER — React + Tailwind + Ethers.js + MetaMask │
│  (role-aware dashboards, evidence upload, verification UI)    │
└───────────────────────────┬────────────────────────────────┘
                             │ REST (HTTPS)                 │ direct RPC (read-only + tx signing)
┌───────────────────────────▼────────────────────────────────┐        ┌───────────────────────────┐
│  APPLICATION LAYER — Node.js + Express                       │        │  BLOCKCHAIN LAYER          │
│  auth (SIWE-style nonce), file validation, Pinata upload,     │◄──────►│  EvidenceRegistry.sol      │
│  MongoDB persistence, event listener (chain → alerts)         │  RPC   │  on Ethereum Sepolia       │
└───────────────────────────┬────────────────────────────────┘        └──────────────┬─────────────┘
                             │                                                        │ CID stored on-chain
                  ┌──────────▼──────────┐                              ┌──────────────▼─────────────┐
                  │  MongoDB Atlas       │                              │  IPFS (via Pinata)          │
                  │  operational data    │                              │  evidence file storage       │
                  │  (Users, Cases,      │                              │  source of truth for files    │
                  │   Evidence cache,    │                              └─────────────────────────────┘
                  │   Alerts, AccessLog) │
                  └──────────────────────┘
```

**Source of truth split (critical design principle):**
- **Ethereum smart contract** = source of truth for evidence registration, role assignment, and chain-of-custody events. Immutable, independently enforced.
- **IPFS** = source of truth for the evidence file bytes (content-addressed by CID).
- **MongoDB** = *supplementary/operational* data only (search indexes, cached metadata for fast queries, alerts, access logs, case descriptions). MongoDB is never authoritative for custody or authorization — it can be wiped and rebuilt from chain + IPFS events.

## 2. Role Model

| Role | Enum value | Capabilities |
|---|---|---|
| NONE | 0 | No contract access |
| ADMIN | 1 | assignRole/removeRole, view all alerts, view audit data |
| OFFICER | 2 | registerEvidence, view own submissions |
| INVESTIGATOR | 3 | recordAccess, transferCustody, verify evidence |
| JUDICIARY | 4 | recordAccess (read-only), view custody history |

Role is **not** stored in MongoDB as the authorization source — it's read live from the contract (`getRole(address)`) on every sensitive action. MongoDB may cache it for UI speed but the contract is always re-checked for anything state-changing.

## 3. Data Flow — Evidence Registration (happy path)

```
Officer (browser, MetaMask connected)
  → selects file, fills case ID / description / type
  → frontend validates (type, size)
  → POST /api/evidence/upload (multipart) → backend
      → backend validates again (never trust frontend)
      → backend streams file to Pinata → receives CID
      → backend writes supplementary doc to MongoDB (status: "pending-chain")
      → backend returns { cid, evidenceDraftId } to frontend
  → frontend shows CID, asks officer to confirm on-chain registration
  → frontend builds tx via Ethers.js → MetaMask prompts signature
  → officer signs → tx sent to Sepolia
  → EvidenceRegistry.registerEvidence(...) executes on-chain
      → contract checks msg.sender has OFFICER role (require)
      → contract stores Evidence struct, emits EvidenceRegistered
  → frontend waits for receipt → shows txHash, evidenceId, success state
  → backend event listener picks up EvidenceRegistered → updates Mongo doc to "confirmed" with txHash
```

## 4. Data Flow — Unauthorized Access

```
Unauthorized wallet calls getEvidence(id) or recordAccess(id)
  → contract require(role check) fails
  → contract emits AccessDenied(wallet, evidenceId, timestamp) BEFORE reverting
    (see implementation note in contract section — Solidity events in a reverted
     tx are NOT persisted; we handle this via a non-reverting "logAccess" path,
     explained in the contract file)
  → backend event listener (ethers.js WebSocketProvider) catches AccessDenied
  → backend writes Alert doc to MongoDB
  → admin dashboard polls/subscribes GET /api/alerts → renders alert
```

> **Important Solidity nuance**: if a `require()` reverts, no events from that transaction are emitted or persisted — the whole transaction is rolled back, including logs. So "emit AccessDenied then reject" cannot literally happen inside one reverting call. The contract design (see `EvidenceRegistry.sol`) resolves this by giving unauthorized callers a **non-reverting** `attemptAccess()` path that checks the role, emits `AccessDenied` on failure without reverting, and returns a boolean/empty result instead of the data — while the *actual* data-returning functions (`getEvidence`) still use `require` and revert normally for defense in depth. The frontend calls `attemptAccess` first (or catches the revert and separately logs client-side + backend-side), documented fully in the contract comments.

## 5. Chain of Custody Model

Every custody-relevant action (register, access, transfer, verify) appends a `CustodyEvent` to an on-chain array keyed by `evidenceId`. `getCustodyHistory(evidenceId)` returns the full ordered array. The frontend renders this as a vertical timeline.

## 6. Database Schema (MongoDB — supplementary only)

**User**
```
{ walletAddress: String (unique, lowercase), roleCache: String, name, badgeId, createdAt }
```

**Case**
```
{ caseId: String (unique), title, description, createdBy: walletAddress, status, createdAt }
```

**Evidence** (cache/mirror of on-chain data + search index)
```
{ evidenceId: Number (unique), caseId, cid, description, fileType, fileSize,
  registeredBy, txHash, status: enum[pending-chain, confirmed, verified, flagged],
  createdAt }
```

**Alert**
```
{ type: enum[AccessDenied, IntegrityViolation], walletAddress, evidenceId,
  txHash, message, resolved: Boolean, createdAt }
```

**AccessLog**
```
{ evidenceId, walletAddress, action: enum[view, verify, transfer], txHash, timestamp }
```

## 7. Security Boundaries

| Layer | Enforces |
|---|---|
| Frontend | UX validation only (file type/size, required fields) — **never trusted** |
| Backend | Re-validates everything frontend did; validates JWT/session from wallet-signature auth; rate limits; never accepts role claims from client, always re-derives from contract or signed nonce |
| Smart Contract | **Final authority** — every state-changing function has a `require(role == ...)` modifier; this cannot be bypassed by a compromised frontend or backend |

## 8. Authentication Flow (Sign-In With Ethereum style)

```
1. Frontend: connect MetaMask → get address
2. Frontend: POST /api/auth/nonce { address } → backend generates + stores one-time nonce
3. Frontend: MetaMask signs message "Sign in to Evidence System. Nonce: <nonce>"
4. Frontend: POST /api/auth/verify { address, signature } → backend recovers signer via ethers,
   confirms it matches address + nonce unused → issues short-lived JWT
5. Backend: on JWT issuance, calls contract.getRole(address) to attach role to the session
   (role is NOT trusted from client, always read from chain at login and re-checked
   per sensitive request)
```

## Build Order (this response follows this order)

1. ✅ Architecture & schema design (this doc)
2. Solidity contract `EvidenceRegistry.sol`
3. Hardhat tests
4. Backend (Express) — auth, upload, evidence, alerts
5. Frontend (React) — key pages
6. Ethers.js/MetaMask integration
7. IPFS/Pinata integration
8. MongoDB integration
9. Integration test plan
10. Deployment instructions
