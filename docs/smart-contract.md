# Smart Contract Documentation — `EvidenceRegistry.sol`

## Roles

```solidity
enum Role { NONE, ADMIN, OFFICER, INVESTIGATOR, JUDICIARY }
```

The deployer is bootstrapped as `ADMIN` in the constructor. Only `ADMIN`
can call `assignRole` / `removeRole`.

## Evidence struct

```solidity
struct Evidence {
    uint256 evidenceId;
    string caseId;
    string cid;
    string description;
    string fileType;
    address registeredBy;
    uint256 timestamp;
    bool exists;
    EvidenceStatus status; // Registered | UnderReview | Verified | Flagged
}
```

## Functions

| Function | Access | Notes |
|---|---|---|
| `assignRole(address, Role)` | ADMIN | reverts on `Role.NONE` (use `removeRole`) |
| `removeRole(address)` | ADMIN | reverts if account already has no role |
| `getRole(address)` | any | view |
| `registerEvidence(caseId, cid, description, fileType)` | OFFICER | rejects duplicate `(caseId, cid)` pairs; emits `EvidenceRegistered` + `ChainOfCustodyEvent` |
| `getEvidence(evidenceId)` | any assigned role | **reverts** for `Role.NONE` — defense-in-depth read path |
| `attemptAccess(evidenceId)` | any address, including unassigned | **non-reverting** authorization probe — see below |
| `recordAccess(evidenceId)` | any assigned role | logs an `Accessed` custody event |
| `transferCustody(evidenceId, to)` | INVESTIGATOR or ADMIN | `to` must itself have an assigned role |
| `recordVerification(evidenceId, bool)` | INVESTIGATOR or JUDICIARY | records the off-chain-computed integrity result immutably |
| `getCustodyHistory(evidenceId)` | any assigned role | reverts for `Role.NONE` |
| `totalEvidence()` | any | view |

## Why two access paths (`getEvidence` vs `attemptAccess`)?

Solidity fact: if a transaction **reverts**, all state changes and **all
event emissions from that transaction are rolled back** — nothing is
written to the chain, including logs. So a design of "require role, and if
it fails emit `AccessDenied`" cannot work as one reverting call, because
the emitted event would vanish along with the revert.

- **`getEvidence` / `getCustodyHistory`** use `require()` and revert
  normally. This is correct for `view` calls made by the frontend/backend
  during ordinary reads — a revert is cheap (no gas cost for view calls)
  and simple to handle as a rejected promise.
- **`attemptAccess`** is a real (non-view) transaction. Unauthorized
  callers get a **successful, non-reverting** transaction that emits
  `AccessDenied` and returns `(false, <empty struct>)`. This is what lets
  the backend's `eventListener.js` actually observe the denial on-chain and
  persist an `Alert` document, and it's what the "16. Admin dashboard
  displays an unauthorized access alert" demo step depends on.

In the current frontend, ordinary evidence detail views call the reverting
`getEvidence` (cheaper, simpler UX — the backend catches the revert and
returns a 403). If you want every unauthorized *view attempt* to also
generate an on-chain `AccessDenied` alert (not just calls that explicitly
use `attemptAccess`), route the frontend evidence detail view through
`attemptAccess` instead of `getEvidence`.

## Events

- `RoleAssigned(account, role, assignedBy, timestamp)`
- `RoleRemoved(account, previousRole, removedBy, timestamp)`
- `EvidenceRegistered(evidenceId, caseId, cid, registeredBy, timestamp)`
- `ChainOfCustodyEvent(evidenceId, action, actor, timestamp, note)`
- `AccessEvent(evidenceId, accessor, timestamp)`
- `TransferEvent(evidenceId, from, to, timestamp)`
- `AccessDenied(wallet, evidenceId, timestamp, reason)`

## Security notes

- No function relies on `tx.origin`; all checks use `msg.sender`.
- Duplicate evidence for the same `(caseId, cid)` pair is blocked via a
  `keccak256` guard mapping.
- `transferCustody` requires the recipient to already hold an assigned
  role — you cannot transfer custody to an arbitrary unassigned address.
- All state-changing functions are independent of frontend/backend checks;
  a malicious or compromised client cannot bypass the `require()` guards.
