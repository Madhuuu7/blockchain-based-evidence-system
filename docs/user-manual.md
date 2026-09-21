# User Manual

All actions require a MetaMask-connected wallet. Sign-in proves wallet
ownership via a signed message (no gas cost); your role is looked up live
from the smart contract every time you sign in.

## Administrator

1. **Sign in** with the wallet used to deploy the contract (automatically
   ADMIN), or a wallet an existing admin has assigned the ADMIN role to.
2. **Assign roles** — go to *Users*, enter a wallet address, pick a role
   (Officer / Investigator / Judiciary / Admin), click *Assign Role*, and
   confirm the MetaMask transaction. This is a real on-chain transaction —
   the role only takes effect once it's mined.
3. **Monitor alerts** — go to *Alerts* to see unauthorized access attempts
   and integrity-check failures as they happen. Mark them resolved once
   reviewed.
4. **Audit** — the Dashboard shows total evidence, cases, users, and open
   alerts at a glance.

## Police Officer

1. Sign in with a wallet an admin has assigned the OFFICER role to.
2. **Upload evidence** — go to *Evidence → Upload Evidence*:
   - Enter the Case ID, evidence type, and description.
   - Select the file (validated for type and size before upload).
   - Click *Upload & Register Evidence*. Watch the status move through
     *Uploading to IPFS* → *Confirm in MetaMask* → *Confirming on Sepolia*
     → *Success*.
   - Once successful, you'll see the IPFS CID and the transaction hash —
     both are permanent and verifiable independently (CID on any IPFS
     gateway, tx hash on Sepolia Etherscan).
3. **View your submissions** — go to *Evidence* to search/filter by case,
   file type, or keyword.

## Forensic Investigator

1. Sign in with a wallet an admin has assigned the INVESTIGATOR role to.
2. **View evidence** — open any evidence record from *Evidence* to see its
   full details and chain-of-custody timeline.
3. **Verify integrity** — on an evidence detail page, click *Verify
   Integrity*. The system re-fetches the file from IPFS, recomputes its
   hash, and compares it against the CID stored immutably on-chain. You'll
   see either *Integrity Verified* or *Integrity Violation*.
4. **Transfer custody** — (via the contract; a dedicated UI button can be
   added following the same MetaMask-signing pattern used in Upload/Users)
   transfers responsibility for an evidence item to another assigned-role
   wallet.

## Judiciary

1. Sign in with a wallet an admin has assigned the JUDICIARY role to.
2. **Review case evidence** — browse *Cases* and *Evidence* for anything
   your role has been authorized to see.
3. **Review chain of custody** — every evidence detail page shows the full,
   tamper-evident timeline: who registered it, who accessed it, any
   transfers, and any verification results, each with a wallet address and
   timestamp.
4. **Verify integrity** — same *Verify Integrity* action available to
   Investigators.

## What happens if you're not authorized

If you open an evidence record your role doesn't have access to, the
system does not return any evidence data — you'll see a clear "Not
authorized" message. This rejection happens at the smart-contract level
(not just in the app), so it can't be bypassed by tampering with the
frontend or intercepting API calls. The attempt is also logged for
administrator review.
