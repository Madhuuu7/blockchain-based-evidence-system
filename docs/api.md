# API Documentation

Base URL: `http://localhost:4000/api` (or your deployed backend URL)

All routes except `/auth/*` and `/health` require:
```
Authorization: Bearer <JWT from /auth/verify>
```

The JWT verifies cryptographic wallet ownership. Sensitive role-gated routes dynamically invoke `contract.getRole(callerAddress)` directly against the smart contract — roles are never trusted from client inputs, local storage, or request payloads.

---

## 1. Authentication

### `POST /auth/nonce`
Issues a cryptographically secure, time-limited single-use nonce for wallet challenge-response signing.
- **Request Body:** `{ "address": "0x..." }`
- **Response (200):**
  ```json
  {
    "message": "Sign in to the Blockchain Evidence System.\n\nWallet: 0x...\nNonce: 4a3f...\nIssued: 2026-09-24T15:00:00.000Z"
  }
  ```

### `POST /auth/verify`
Recovers the signing address via ECDSA message recovery, queries the smart contract for the caller's live role, updates the database cache, and issues a 12-hour session JWT.
- **Request Body:**
  ```json
  {
    "address": "0x...",
    "signature": "0x...",
    "message": "<message from /nonce>"
  }
  ```
- **Response (200):**
  ```json
  {
    "token": "<jwt_session_token>",
    "role": "OFFICER",
    "address": "0x..."
  }
  ```

---

## 2. Evidence Management

| Method | Path | Role required | Description |
|---|---|---|---|
| **POST** | `/evidence/upload` | `OFFICER` | Multipart file upload pinned to IPFS via Pinata. Generates raw CIDv1 and writes a `pending-chain` MongoDB draft. |
| **POST** | `/evidence/finalize` | `OFFICER` | Associates the draft MongoDB document with the on-chain `evidenceId` and `txHash` after MetaMask signs `registerEvidence()`. |
| **GET** | `/evidence` | Authenticated | Search, filter, and paginate evidence documents (`caseId`, `evidenceId`, `fileType`, `status`, `keyword`, `from`, `to`, `page`, `limit`). |
| **GET** | `/evidence/:id` | Any Assigned Role (`NONE` rejected) | Authoritative read directly from the smart contract via `eth_call` using `req.wallet` as `msg.sender`. |
| **GET** | `/evidence/:id/history` | Any Assigned Role (`NONE` rejected) | Retrieves the full immutable chain-of-custody array from the contract. |
| **GET** | `/evidence/:id/file` | Any Assigned Role | Fetches the raw file byte stream from the IPFS gateway. |
| **POST** | `/evidence/:id/verify` | `INVESTIGATOR`, `JUDICIARY`, `ADMIN` | Fetches file bytes from IPFS, recomputes raw CIDv1 multihash, verifies against on-chain record and MongoDB, records status (`verified` or `flagged`), and creates an `IntegrityViolation` alert on mismatch. |

---

## 3. Case Management

| Method | Path | Role required | Description |
|---|---|---|---|
| **POST** | `/cases` | `OFFICER`, `INVESTIGATOR`, `ADMIN` | Creates a new case identifier with title and description. |
| **GET** | `/cases` | Authenticated | Lists all cases with total counts and pagination. |
| **GET** | `/cases/:caseId` | Authenticated | Fetches case details including associated evidence counts. |

---

## 4. Alerts (ADMIN only)

| Method | Path | Description |
|---|---|---|
| **GET** | `/alerts` | Lists all security alerts. Query params: `resolved` (`true`/`false`), `type` (`AccessDenied`/`IntegrityViolation`), `page`, `limit`. |
| **POST** | `/alerts/:id/resolve` | Marks an alert as resolved (`resolved: true`). |

---

## 5. Users & Roles (ADMIN only)

| Method | Path | Description |
|---|---|---|
| **GET** | `/users` | Lists registered users with their live on-chain role queried in real time. |
| **POST** | `/users/role` | Synchronizes the MongoDB cache label after an admin submits an on-chain `assignRole()` transaction. |

---

## 6. Standard Error Format

```json
{
  "error": "Human readable error explanation"
}
```

- `400`: Invalid parameters or validation failure.
- `401`: Missing or expired session token.
- `403`: Role permission denied or contract reverted `Role.NONE`.
- `404`: Resource not found.
- `503`: Blockchain node or IPFS service temporarily unreachable.
