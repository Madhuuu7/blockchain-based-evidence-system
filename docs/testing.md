# Testing Documentation

## 1. Smart Contract Tests (Hardhat + Chai)

Location: `blockchain/test/EvidenceRegistry.test.js`

Run:
```bash
cd blockchain
npx hardhat test
```

Covers (numbered to match the project's required test list):
1. Deployment — deployer becomes ADMIN
2. Admin role — `getRole` returns ADMIN for deployer
3. Role assignment — ADMIN can assign roles, emits `RoleAssigned`
4. Unauthorized role assignment — non-admin reverts
5. Evidence registration — OFFICER can register, emits `EvidenceRegistered`
6. Unauthorized evidence registration — non-officer reverts
7. Evidence retrieval — authorized role can read via `getEvidence`
8. Authorized access — `attemptAccess` succeeds and emits `AccessEvent`
9. Unauthorized access — `getEvidence` reverts for `Role.NONE`
10. `AccessDenied` event — `attemptAccess` emits it without reverting for unauthorized callers
11. Chain-of-custody events — `Registered` event recorded on registration
12. Evidence transfer — `transferCustody` emits `TransferEvent`, appends custody event, rejects transfer to an unassigned wallet
13. Invalid inputs — empty `caseId` rejected, non-existent evidence ID rejected
14. Duplicate evidence handling — duplicate `(caseId, cid)` rejected
15. Event parameters — `recordVerification` emits `ChainOfCustodyEvent` with correct action/actor/note, and sets `Verified`/`Flagged` status correctly

Also covered: `removeRole`.

## 2. Backend Tests

Not yet implemented as automated Jest/Supertest files in this delivery —
recommended structure (`backend/test/`):

```
test/
├── auth.test.js         # nonce issuance, signature verification, rejects reused/expired nonce
├── evidenceUpload.test.js  # file type/size validation, mocked Pinata upload, MongoDB draft write
├── evidenceRetrieval.test.js  # mocked contract read, 403 on reverted "no role" call
├── verify.test.js       # mocked IPFS fetch + hash comparison, alert creation on mismatch
└── alerts.test.js       # ADMIN-only access, resolve endpoint
```

Suggested approach: use `jest.mock()` (or `msw`) to stub `pinataService.js`
and `blockchainService.js` so tests don't require a live Sepolia RPC or
Pinata account. Use `mongodb-memory-server` for an ephemeral MongoDB
instance in CI.

Example skeleton:
```js
import request from "supertest";
import app from "../src/app.js"; // export the Express app separately from server startup for testability

test("rejects upload without a file", async () => {
  const res = await request(app)
    .post("/api/evidence/upload")
    .set("Authorization", `Bearer ${testOfficerToken}`)
    .field("caseId", "CASE-1")
    .field("description", "desc")
    .field("fileType", "pdf");
  expect(res.status).toBe(400);
});
```
> Note: `server.js` currently calls `start()` immediately on import, which
> makes it hard to import the Express `app` in tests without also opening a
> real Mongo connection and listener. Recommended refactor: split
> `server.js` into `app.js` (Express app + routes, no `listen`/`connect`)
> and a thin `server.js` that imports `app` and calls `start()`.

## 3. Frontend Tests

Recommended structure (`frontend/src/**/__tests__/`), using Vitest +
Testing Library (already in `package.json`):

- **Wallet connection** — mock `window.ethereum`, assert `Web3Context`
  populates `address`/`chainId`, and shows `connectError` when MetaMask is
  absent.
- **Role detection** — mock `/auth/nonce` and `/auth/verify` responses,
  assert `AuthContext.role` is set from the server response (never
  fabricated client-side).
- **Dashboard rendering** — snapshot per role (ADMIN sees Alerts/Users
  stats, OFFICER doesn't).
- **Evidence upload** — mock `api.post('/evidence/upload')` and a mocked
  contract `registerEvidence`, assert the stage machine transitions
  `idle → uploading-ipfs → awaiting-signature → confirming → success`.
- **MetaMask transaction / confirmation** — mock `getContract(true)` to
  return a fake contract whose `registerEvidence` resolves a fake tx with
  `.wait()`.
- **Evidence retrieval / verification UI** — mock `/evidence/:id` and
  `/evidence/:id/verify`, assert `"Integrity Verified"` / `"Integrity
  Violation"` render with the correct status color.
- **Unauthorized access UI** — mock a 403 response, assert the error banner
  renders instead of evidence data.
- **Admin alerts** — mock `/alerts`, assert alert cards render and
  `resolve()` calls the correct endpoint.

## 4. Integration Test Plan (manual or Playwright/Cypress)

### Flow A — Officer registers evidence
1. Admin wallet assigns OFFICER role to Wallet B (Users page → MetaMask tx).
2. Sign in as Wallet B → role shows OFFICER.
3. Go to Evidence → Upload, fill form, select a small test file.
4. Confirm stage badges: Uploading to IPFS → Awaiting Signature → Confirming → Success.
5. Confirm CID and tx hash are shown and are real (check tx hash on
   Sepolia Etherscan).
6. Confirm MongoDB `Evidence` doc transitions `pending-chain → confirmed`
   (via the event listener) — check `GET /api/evidence`.

### Flow B — Investigator verifies
1. Admin assigns INVESTIGATOR role to Wallet C.
2. Sign in as Wallet C → open the evidence record from Flow A.
3. Confirm custody timeline shows `Registered` then `Accessed`.
4. Click "Verify Integrity" → confirm `"Integrity Verified"` is returned
   (assuming the file wasn't tampered with).
5. (Optional negative test) Manually re-pin a different file under the same
   CID variable in a test script to confirm `"Integrity Violation"` and an
   `IntegrityViolation` alert are created.

### Flow C — Unauthorized access
1. Use a wallet with no assigned role (Wallet D).
2. Attempt to open `/evidence/:id` → confirm a 403 error banner renders
   (via `getEvidence` revert path).
3. Separately call `attemptAccess` from Wallet D directly against the
   contract (e.g. via a script or Etherscan's "Write Contract" tab) to
   confirm `AccessDenied` is emitted.
4. Confirm the backend event listener picks it up and an `Alert` document
   appears in MongoDB.
5. Sign in as Admin → Alerts page shows the new `AccessDenied` alert.

## 5. What "done" looks like

- `npx hardhat test` passes all cases in `blockchain/test/`.
- Backend starts cleanly against a real MongoDB Atlas cluster, real Pinata
  account, and real Sepolia RPC (no fallback/mock data returned silently).
- All three integration flows above complete against Sepolia testnet with
  real, verifiable transaction hashes.
