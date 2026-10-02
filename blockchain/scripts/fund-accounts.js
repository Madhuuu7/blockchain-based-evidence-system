/**
 * Spread a little gas from the deployer to the wallets that will hold roles.
 *
 * Every role that *writes* to the chain needs gas of its own: an ADMIN
 * assigning roles, an OFFICER registering evidence, an INVESTIGATOR
 * transferring custody. A JUDICIARY account only reads, so it needs nothing.
 *
 * One faucet claim funds the deployer; this hands out the rest, so nobody has
 * to go back to a faucet for each account.
 *
 * Usage:
 *   FUND_ADDRESSES=0xabc...,0xdef... FUND_AMOUNT=0.01 \
 *     npx hardhat run scripts/fund-accounts.js --network sepolia
 */

const hre = require("hardhat");

async function main() {
  const raw = process.env.FUND_ADDRESSES;

  if (!raw) {
    throw new Error(
      "Set FUND_ADDRESSES to a comma-separated list of wallets to fund, e.g.\n" +
        "  FUND_ADDRESSES=0xabc...,0xdef... npx hardhat run scripts/fund-accounts.js --network sepolia"
    );
  }

  const amount = process.env.FUND_AMOUNT || "0.01";
  const addresses = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const address of addresses) {
    if (!hre.ethers.isAddress(address)) {
      throw new Error(`Not a valid address: ${address}`);
    }
  }

  const [sender] = await hre.ethers.getSigners();
  const value = hre.ethers.parseEther(amount);
  const balance = await hre.ethers.provider.getBalance(sender.address);
  const needed = value * BigInt(addresses.length);

  console.log(`Funding from ${sender.address}`);
  console.log(`  balance : ${hre.ethers.formatEther(balance)} ETH`);
  console.log(`  sending : ${amount} ETH to ${addresses.length} address(es)`);

  if (balance < needed) {
    throw new Error(
      `Not enough balance: need about ${hre.ethers.formatEther(needed)} ETH plus gas, ` +
        `have ${hre.ethers.formatEther(balance)}.`
    );
  }

  for (const address of addresses) {
    const existing = await hre.ethers.provider.getBalance(address);

    if (existing >= value) {
      console.log(`  ${address} already holds ${hre.ethers.formatEther(existing)} ETH, skipping`);
      continue;
    }

    const tx = await sender.sendTransaction({ to: address, value });
    console.log(`  ${address} <- ${amount} ETH  tx ${tx.hash}`);
    await tx.wait();
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
