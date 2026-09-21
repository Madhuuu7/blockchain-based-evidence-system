const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying EvidenceRegistry with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");
  if (balance === 0n) {
    console.warn(
      "WARNING: deployer balance is 0. Deployment to a live network will fail. " +
      "Fund this address with Sepolia ETH from a faucet before deploying to sepolia."
    );
  }

  const EvidenceRegistry = await hre.ethers.getContractFactory("EvidenceRegistry");
  const contract = await EvidenceRegistry.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("EvidenceRegistry deployed to:", address);

  // Persist address + ABI for backend/frontend consumption
  const artifact = await hre.artifacts.readArtifact("EvidenceRegistry");
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const network = hre.network.name;
  fs.writeFileSync(
    path.join(outDir, `${network}.json`),
    JSON.stringify(
      {
        network,
        address,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        abi: artifact.abi
      },
      null,
      2
    )
  );

  console.log(`Deployment info written to blockchain/deployments/${network}.json`);
  console.log("Copy the 'address' and 'abi' fields into backend/.env and frontend/.env respectively.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
