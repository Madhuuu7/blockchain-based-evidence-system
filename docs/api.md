# API Documentation

Base URL: `http://localhost:4000/api` (or your deployed backend URL)

All routes except `/auth/*` and `/health` require:
```
Authorization: Bearer <JWT from /auth/verify>
```

The JWT only proves wallet ownership. Role-gated routes additionally call
`contract.getRole(callerAddress)` on every request — role is never taken
from the token payload or the request body.

## Auth

### `POST /auth/nonce`
Request body: `{ "address": "0x..." }`
Response: `{ "message": "Sign in to the Blockchain Evidence System.\n\nWallet: 0x...\nNonce: ...\nIssued: ..." }`

### `POST /auth/verify`
Request body: `{ "address": "0x...", "signature": "0x...", "message": "<message from /nonce>" }`
Response: `{ "token": "<jwt>", "role": "OFFICER", "address": "0x..." }`

## Evidence

| Method | Path | Role required | Description |
|---|---|---|---|
| POST | `/evidence/upload` | OFFICER | multipart upload → Pinata → returns CID (draft only; officer still signs on-chain tx from frontend) |
| GET | `/evidence` | any authenticated | search/paginate the MongoDB cache (`caseId`, `evidenceId`, `fileType`, `status`, `keyword`, `from`, `to`, `page`, `limit`, `sort`) |
| GET | `/evidence/:id` | any role (NONE rejected) | authoritative read from the smart contract |
| GET | `/evidence/:id/history` | any role (NONE rejected) | full custody timeline from the contract |
| GET | `/evidence/:id/file` | any authenticated | proxies the raw file bytes from the IPFS gateway |
| POST | `/evidence/:id/verify` | INVESTIGATOR, JUDICIARY, ADMIN | recomputes hash from IPFS content, compares to on-chain CID, returns `"Integrity Verified"` or `"Integrity Violation"` |

## Cases

| Method | Path | Role required |
|---|---|---|
| POST | `/cases` | OFFICER, ADMIN |
| GET | `/cases` | any authenticated |
| GET | `/cases/:caseId` | any authenticated |

## Alerts (ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/alerts` | list alerts, filter by `resolved`, `type` |
| POST | `/alerts/:id/resolve` | mark an alert resolved |

## Users (ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/users` | list known users with **live** on-chain role |
| POST | `/users/role` | sync the MongoDB role-cache label after an on-chain `assignRole`/`removeRole` call |

## Error format

```json
{ "error": "Human readable message" }
```

Common status codes: `400` validation, `401` missing/invalid token, `403`
role check failed (either backend `requireRole` or a reverted contract
call), `404` not found, `503` blockchain/IPFS unreachable, `500` other.
