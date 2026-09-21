# Blockchain Based Cyber Crime Evidence System

A tamper-evident digital evidence management platform combining an Ethereum
smart contract (chain-of-custody + role authorization), IPFS/Pinata
(evidence file storage), a Node.js/Express backend (validation, search,
alerts), and a React frontend (MetaMask-based role dashboards).

> **Status: working academic prototype.** Every piece here is real, runnable
> code — not a mockup. It has **not** been deployed to Sepolia for you; you
> must supply your own RPC provider, Pinata account, and MongoDB Atlas
> cluster, and run the deployment steps below yourself. Nothing in this repo
> fabricates a transaction hash or pretends a service is connected when it
> isn't — see `IMPORTANT IMPLEMENTATION RULES` honored throughout the code
> (e.g. `blockchainService.js` and `pinataService.js` throw clear errors
> instead of silently no-op'ing when unconfigured).

## Project Structure

```
evidence-system/
├── blockchain/        Solidity contract, Hardhat config, deploy script, tests
├── backend/            Express API, MongoDB models, Pinata + chain services
├── frontend/            React + Tailwind + Ethers.js dashboards
└── docs/                 Architecture, API, deployment, testing docs
```

## Quick Start (local development)

### 1. Smart contract (local Hardhat network)

```bash
cd blockchain
npm install
cp .env.example .env        # fill in SEPOLIA_RPC_URL etc. later for deployment
npx hardhat compile
npx hardhat test            # runs the 15+ test cases in test/EvidenceRegistry.test.js
npx hardhat node            # starts a local chain on http://127.0.0.1:8545
# in a second terminal:
npm run deploy:local
```

This writes `blockchain/deployments/localhost.json` containing the deployed
`address` and full `abi`.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in: MONGODB_URI, PINATA_JWT, RPC_URL, CONTRACT_ADDRESS (from step 1), JWT_SECRET
npm run dev
```

Health check: `curl http://localhost:4000/api/health`

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Fill in: VITE_CONTRACT_ADDRESS (same as backend), VITE_API_BASE_URL
npm run dev
```

Open http://localhost:5173, connect MetaMask (pointed at the same network
the contract was deployed to — Hardhat local or Sepolia), and sign in.

The deployer wallet is automatically ADMIN (see the contract constructor).
Use the **Users** page as that wallet to assign OFFICER / INVESTIGATOR /
JUDICIARY roles to other test wallets.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — four-layer architecture, data flow, schema
- [`docs/api.md`](docs/api.md) — REST API reference
- [`docs/smart-contract.md`](docs/smart-contract.md) — contract design, roles, events
- [`docs/testing.md`](docs/testing.md) — test plan across all three layers + integration
- [`docs/deployment.md`](docs/deployment.md) — Sepolia + Vercel + MongoDB Atlas + Pinata deployment
- [`docs/user-manual.md`](docs/user-manual.md) — walkthrough per role

## Core Design Principles (enforced in code, not just docs)

1. **Files never touch the blockchain.** Only the IPFS CID and metadata are
   stored on-chain (`EvidenceRegistry.sol`); the file itself lives on IPFS
   via Pinata (`pinataService.js`).
2. **The smart contract is the final authority.** Every state-changing
   contract function has a `require(role == ...)` check. The backend
   (`middleware/auth.js`) and frontend (`ProtectedRoute.jsx`) add UX-level
   checks only — they are not trusted as security boundaries.
3. **Role is always read live from the contract**, never cached client-side
   or trusted from a request body, at both login (`authController.js`) and
   on every sensitive backend route (`requireRole` middleware).
4. **Nothing is faked.** If Pinata, the RPC endpoint, or MongoDB aren't
   configured, the relevant service throws a descriptive error rather than
   returning fabricated data.
