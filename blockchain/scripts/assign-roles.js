/**
 * Assign OFFICER, INVESTIGATOR and JUDICIARY roles in one pass.
 *
 * grant-admin.js covers the bootstrap case - handing ADMIN to a real wallet
 * after a deployment. This script covers everything after that: the working
 * roles, which an ADMIN assigns and which otherwise have to be clicked through
 * the interface one wallet at a time.
 *
 * Usage:
 *   ROLE_ASSIGNMENTS=0xabc...=OFFICER,0xdef...=INVESTIGATOR \
 *     npx hardhat run scripts/assign-roles.js --network sepolia
 *
 * The signer must already hold ADMIN. Wallets that already hold the role they
 * were given are skipped, so re-running costs nothing.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ROLE = { NONE: 0, ADMIN: 1, OFFICER: 2, INVESTIGATOR: 3, JUDICIARY: 4 };
const ROLE_NAME = Object.fromEntries(Object.entries(ROLE).map(([k, v]) => [v, k]));

function parseAssignments(raw) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [address, roleName] = entry.split("=").map((part) => (part || "").trim());

      if (!address || !roleName) {
        throw new Error(`Malformed assignment "${entry}" - expected 0xaddress=ROLE`);
      }

      if (!hre.ethers.isAddress(address)) {
        throw new Error(`Not a valid address: ${address}`);
      }

      const role = ROLE[roleName.toUpperCase()];

      if (role === undefined || role === ROLE.NONE) {
        throw new Error(
          `Unknown role "${roleName}" - use one of ADMIN, OFFICER, INVESTIGATOR, JUDICIARY`
        );
      }

      return { address, role, roleName: roleName.toUpperCase() };
    });
}

async function main() {
  const raw = process.env.ROLE_ASSIGNMENTS;

  if (!raw) {
    throw new Error(
      "Set ROLE_ASSIGNMENTS to a comma-separated list of wallet=role pairs, e.g.\n" +
        "  ROLE_ASSIGNMENTS=0xabc...=OFFICER,0xdef...=JUDICIARY \\n" +
        "    npx hardhat run scripts/assign-roles.js --network sepolia"
    );
  }

  const assignments = parseAssignments(raw);
  const network = hre.network.name;
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network}.json`);

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      `No deployment found at ${deploymentPath}. Deploy to ${network} first.`
    );
  }

  const { address } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const [signer] = await hre.ethers.getSigners();
  const registry = await hre.ethers.getContractAt("EvidenceRegistry", address, signer);

  const signerRole = await registry.getRole(signer.address);

  if (Number(signerRole) !== ROLE.ADMIN) {
    throw new Error(
      `${signer.address} holds ${ROLE_NAME[Number(signerRole)]}, not ADMIN, ` +
        "so it cannot assign roles."
    );
  }

  console.log(`Assigning roles on ${network} as ${signer.address}`);

  for (const { address: wallet, role, roleName } of assignments) {
    const existing = Number(await registry.getRole(wallet));

    if (existing === role) {
      console.log(`  ${wallet} already holds ${roleName}, skipping`);
      continue;
    }

    if (existing !== ROLE.NONE) {
      console.log(`  ${wallet} currently holds ${ROLE_NAME[existing]}, replacing with ${roleName}`);
    }

    const tx = await registry.assignRole(wallet, role);
    console.log(`  ${wallet} <- ${roleName}  tx ${tx.hash}`);
    await tx.wait();

    const confirmed = Number(await registry.getRole(wallet));

    if (confirmed !== role) {
      throw new Error(`${wallet} did not end up as ${roleName} - check Etherscan.`);
    }
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
