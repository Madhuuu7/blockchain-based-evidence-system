# Running the system

Two ways to run this project. Pick one and stay in it — mixing them is what
causes most of the confusion, because the two chains hold different data.

| | **Sepolia** (recommended) | **Local Hardhat** |
| --- | --- | --- |
| Survives a restart | yes | no, the chain is in memory |
| Terminals needed | 2 | 4 |
| Transaction speed | 15–30 seconds | instant |
| Needs test ETH | yes, already funded | no |
| Good for | demonstrating, submitting | developing, fast iteration |

**Sepolia is the default and what the committed `.env` files point at.** The
contract is already deployed, all four roles are already assigned, and the data
is already there. Close your laptop, open it next week, start two services and
everything is as you left it.

---

## Running on Sepolia

### 1. Start the backend

```bash
cd backend
npm start
```

Listens on `http://localhost:4000`. You should see:

```
[server] Connected to MongoDB
[eventListener] Polling ... every 12000ms on https://ethereum-sepolia-rpc.publicnode.com...
[server] Listening on port 4000
```

### 2. Start the frontend

```bash
cd frontend
npm run dev
```

Opens on `http://localhost:5173`.

That is the whole startup. There is no chain to run and no contract to deploy —
both already exist on a public network.

### 3. Point MetaMask at Sepolia

Network: **Sepolia**. If it is not in the list, MetaMask is hiding test
networks; the app will show a **Switch to Sepolia** button that does it for you.

Account: one of the four below. Use the plain **Account N** entries derived from
your recovery phrase, never an **Imported Account** — see
[Why not the Hardhat accounts](#why-not-the-hardhat-accounts).

| MetaMask | Address | Role |
| --- | --- | --- |
| Account 1 | `0xd59C546811E9F6DF6B09ec3a63d0da98D2a2093c` | ADMIN |
| Account 3 | `0x8085D31a8ff75cfE446cFBcAfcfdDb2dB0c46Bc6` | OFFICER |
| Account 4 | `0x680B318d16809581BA93270Fa6cB8b0BE09dD9CE` | INVESTIGATOR |
| Account 5 | `0x99b5506C0438b846E27251249aCf8604F04d513f` | JUDICIARY |

If the login screen names the wrong account, click **Use a different account**.
Changing the active account inside MetaMask is not enough on its own: a site is
granted access per account, so one that has never been connected stays
invisible to the app until it is handed over explicitly.

### Deployment details

- Contract `0xd2dc06254EC6F920e98e0E5CB4Fc028F3b2a410C`
- https://sepolia.etherscan.io/address/0xd2dc06254EC6F920e98e0E5CB4Fc028F3b2a410C
- Chain id 11155111

---

## Running on a local chain

Useful while developing, because transactions confirm instantly and gas is
free. Everything on the chain disappears when you stop the node.

Four terminals:

```bash
# 1
cd blockchain && npx hardhat node

# 2  (once the node is up)
cd blockchain && npm run deploy:local

# 3
cd backend && npm run dev

# 4
cd frontend && npm run dev
```

Then point `backend/.env` and `frontend/.env` back at the local chain:

```env
# backend/.env
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
EVENT_POLL_INTERVAL_MS=2000

# frontend/.env
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_CHAIN_ID=31337
VITE_RPC_URL=http://127.0.0.1:8545
```

`0x5FbDB2…80aa3` is deterministic: the first contract deployed by the first
Hardhat account always lands there, so the address does not change between
runs.

**MongoDB does not reset with the chain.** Restarting the node leaves the
database holding evidence the new chain has never heard of — the lists render
and every record fails to open. Rebuild both together:

```bash
cd backend && node scripts/seed-demo.mjs --fresh
```

---

## Before a demonstration

```bash
cd backend && npm run check
```

Checks the things that are configured rather than coded — the database, the RPC
endpoint, whether a contract is actually deployed at the configured address,
and whether the Pinata key can really pin a file:

```
[PASS] CID derivation
[PASS] MongoDB - connected, 6 collection(s)
[PASS] Ethereum RPC - chainId 11155111
[PASS] Contract deployed - 0xd2dc06...410C (9159 bytes)
[PASS] Pinata pinFileToIPFS - pinned bafkrei...
```

It pins a real file rather than calling `testAuthentication`, because a Pinata
key with no upload scope passes authentication and then fails every upload.

---

## Tests

```bash
cd blockchain && npx hardhat test     #  19  contract, against a real EVM
cd backend    && npm test             # 117  unit + integration, fully offline
cd frontend   && npm test             #  38  components and contexts
```

The backend suite starts its own in-memory MongoDB and replaces the chain with
a table, so it needs no network, no database and no deployed contract. It takes
about seven seconds.

`npm run test:e2e` in `backend/` runs a twelve-step lifecycle against a **local**
chain and needs all four local services up.

---

## Demonstration script

A walkthrough that shows the point of the system rather than its menus.

1. **Sign in as Account 1 (ADMIN).** Dashboard shows the totals. Open **Users**
   to show roles come from the contract, not the database — the `liveRole`
   column is read from chain on every request.

2. **Open Alerts.** Real entries, not seeded: `LoginDenied` records from wallets
   that signed in without holding a role. Point out the repeat counter — a burst
   of attempts groups into one row rather than burying the feed.

3. **Switch to Account 4 (INVESTIGATOR).** The session ends by itself, because a
   session proves one specific wallet signed a challenge and stops meaning
   anything once a different wallet is in hand. Sign in again.

4. **Open evidence #3 and verify it.** The backend fetches the file from IPFS,
   recomputes its CID from the bytes, and compares it to the CID the contract
   recorded. MetaMask then asks you to sign `recordVerification`, which writes
   the verdict on chain permanently. Takes 15–30 seconds on Sepolia.

5. **Show it on Etherscan.** The same record, readable by anyone, with your
   laptop closed.

To show tamper detection, see §11 of the README.

---

## When something is wrong

**Dashboard shows zeros.** The session belongs to a wallet with no role. Sign
out, choose one of the four accounts above, sign in again.

**Everything shows NONE.** You are signed in with a wallet that holds no role on
this network — almost always an imported Hardhat account, which is ADMIN
locally and nothing on Sepolia.

**A transaction fails against an address that is not the one above.** The browser
is running a cached build from an older session. Close every tab on
`localhost:5173`, open a fresh one, and hard reload with `Ctrl + Shift + R`.

**Evidence lists but will not open.** The database and the chain disagree, which
happens after redeploying. Rebuild both: `node scripts/seed-demo.mjs --fresh`.

**`npm start` fails with `EADDRINUSE`.** A backend is already running on port
4000.

---

## Why not the Hardhat accounts

`blockchain/hardhat-node.log` and §9 of the README list private keys for
accounts like `0xf39Fd6…92266`. Those keys are published in Hardhat's own
documentation and are identical on every machine in the world. They are
perfectly safe on a local chain, where the money is imaginary and the chain is
yours alone.

On a public network they are not safe at all. Granting one of them a role would
let anyone who read this repository assign themselves ADMIN and take over the
contract. That is why the four wallets above were generated fresh in MetaMask,
and why an **Imported Account** in MetaMask is the wrong thing to sign in with —
importing a published key does not make it private.
