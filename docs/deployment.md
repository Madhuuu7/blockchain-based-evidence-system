# Deployment Guide

This walks through taking the prototype from local development to a live
Sepolia + Vercel + MongoDB Atlas + Pinata deployment.

## 1. Prerequisites

- A Sepolia RPC endpoint (Alchemy or Infura free tier is enough)
- A dedicated **test-only** wallet with some Sepolia ETH (use a faucet,
  e.g. Alchemy's or Sepoliafaucet.com) — never use a wallet holding real
  funds for contract deployment
- A Pinata account with an API JWT (Pinata dashboard → API Keys)
- A MongoDB Atlas cluster (free M0 tier is enough) with a database user and
  network access rule allowing your backend host's IP (or `0.0.0.0/0` for
  early testing, tightened later)
- A Vercel account for the frontend
- A cloud host for the backend (Render, Railway, Fly.io, or a plain VM —
  any Node.js-capable host)

## 2. Deploy the smart contract to Sepolia

```bash
cd blockchain
npm install
cp .env.example .env
```

Fill in `.env`:
```
SEPOLIA_RPC_URL=<your Alchemy/Infura Sepolia URL>
DEPLOYER_PRIVATE_KEY=<private key of your funded test wallet — no 0x prefix or with, ethers accepts either>
ETHERSCAN_API_KEY=<optional, for verify>
```

```bash
npx hardhat compile
npx hardhat test              # confirm everything passes before deploying
npm run deploy:sepolia
```

This prints the deployed address and writes
`blockchain/deployments/sepolia.json` with the `address` and full `abi`.
**Do not proceed until this succeeds against the real network** — per
project rules, don't assume a step worked without verifying it (check the
printed address on https://sepolia.etherscan.io/address/<address>).

Optionally verify the source on Etherscan:
```bash
npx hardhat verify --network sepolia <deployed_address>
```

## 3. Configure MongoDB Atlas

1. Create a free cluster.
2. Database Access → add a user with a strong password.
3. Network Access → add your backend host's outbound IP.
4. Get the connection string:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/evidence-system`

## 4. Configure Pinata

1. Create an API key with pinning permissions (Pinata dashboard).
2. Copy the JWT — this goes into `PINATA_JWT`.
3. Note your gateway URL (default `https://gateway.pinata.cloud/ipfs`, or
   your dedicated gateway if you have one).

## 5. Deploy the backend

```bash
cd backend
npm install
```

Set these environment variables on your chosen host (Render/Railway/Fly/VM
— do **not** commit them to source control):

```
MONGODB_URI=<from step 3>
PINATA_JWT=<from step 4>
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
RPC_URL=<Sepolia RPC URL>
RPC_WS_URL=<optional Sepolia WebSocket URL, for real-time event listening>
CONTRACT_ADDRESS=<from step 2's deployments/sepolia.json>
JWT_SECRET=<generate with: openssl rand -hex 32>
FRONTEND_ORIGIN=<your Vercel frontend URL, added after step 6>
PORT=4000
```

Start command: `npm start`

Confirm it's live: `curl https://<your-backend-host>/api/health`

## 6. Deploy the frontend to Vercel

```bash
cd frontend
npm install
```

In the Vercel project settings, set environment variables (these are
public/bundled — never put secrets here):

```
VITE_API_BASE_URL=https://<your-backend-host>/api
VITE_CONTRACT_ADDRESS=<from step 2>
VITE_CHAIN_ID=11155111
VITE_RPC_URL=<Sepolia RPC URL — safe to expose, it's read-only>
```

Build command: `npm run build`, output directory: `dist`.

Deploy, then go back to your backend host's `FRONTEND_ORIGIN` env var and
set it to the resulting `https://your-app.vercel.app` URL so CORS allows
requests from it. Redeploy the backend after changing this.

## 7. Bootstrap the first admin

The wallet used as `DEPLOYER_PRIVATE_KEY` in step 2 is automatically
`ADMIN` (see the contract constructor). Sign in with that wallet on the
live frontend first, then use the **Users** page to assign roles to other
real test wallets (Officer, Investigator, Judiciary).

## 8. End-to-end verification checklist

- [ ] `GET /api/health` returns `200` from the deployed backend
- [ ] Admin wallet can sign in and see role `ADMIN`
- [ ] Admin can assign OFFICER role (MetaMask tx confirms on Sepolia —
      check the tx hash on Etherscan)
- [ ] Officer can upload a file → CID appears → registration tx confirms
      on Sepolia
- [ ] Investigator can open the evidence record, see custody history, and
      run verification
- [ ] An unauthorized wallet is blocked, and the resulting alert shows up
      on the Admin's Alerts page
- [ ] No secrets appear in the frontend bundle (check the built `dist/`
      output or browser dev tools — only `VITE_*` variables should be
      present)

## Notes on cost

Every state-changing contract call (`assignRole`, `registerEvidence`,
`transferCustody`, `recordVerification`, `attemptAccess`) costs Sepolia
testnet ETH gas. Testnet ETH is free from faucets but rate-limited — keep a
buffer in your deployer/test wallets during grading/demo day.
