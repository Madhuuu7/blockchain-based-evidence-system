/**
 * Hand ADMIN to the real administrator wallet after a deployment.
 *
 * The contract bootstraps whoever deploys it as the first ADMIN. On a public
 * network that deployer is a throwaway key created for the deployment, which
 * keeps the operator's own wallet out of a config file and out of CI. This
 * script transfers control to the wallet that will actually run the system.
 *
 * Usage:
 *   ADMIN_ADDRESS=0xYourMetaMaskAddress \
 *     npx hardhat run scripts/grant-admin.js --network sepolia
 *
 * The throwaway deployer keeps its own ADMIN role, so revoke it afterwards
 * with removeRole from the new admin if you want sole control.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ROLE = { NONE: 0, ADMIN: 1, OFFICER: 2, INVESTIGATOR: 3, JUDICIARY: 4 };

async function main() {
  const adminAddress = process.env.ADMIN_ADDRESS;

  if (!adminAddress) {
    throw new Error(
      "Set ADMIN_ADDRESS to the wallet that should administer the system, e.g.\n" +
        "  ADMIN_ADDRESS=0x... npx hardhat run scripts/grant-admin.js --network sepolia"
    );
  }

  if (!hre.ethers.isAddress(adminAddress)) {
    throw new Error(`ADMIN_ADDRESS is not a valid address: ${adminAddress}`);
  }

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

  const existing = await registry.getRole(adminAddress);

  if (Number(existing) === ROLE.ADMIN) {
    console.log(`${adminAddress} is already ADMIN on ${network}. Nothing to do.`);
    return;
  }

  console.log(`Granting ADMIN to ${adminAddress} on ${network}...`);

  const tx = await registry.assignRole(adminAddress, ROLE.ADMIN);
  console.log("  tx:", tx.hash);

  await tx.wait();

  const confirmed = await registry.getRole(adminAddress);

  if (Number(confirmed) !== ROLE.ADMIN) {
    throw new Error("Role did not take effect - check the transaction on Etherscan.");
  }

  console.log("Confirmed on-chain. That wallet can now assign every other role.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
