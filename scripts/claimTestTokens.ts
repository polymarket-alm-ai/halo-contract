import { ethers } from "hardhat";

/**
 * Claim test tokens from MockUSDT faucet
 */
async function main() {
  const [signer] = await ethers.getSigners();

  // Get MockUSDT address from environment or deployments
  const mockUSDTAddress =
    process.env.MOCK_USDT_ADDRESS || process.env.USDT_ADDRESS;

  if (!mockUSDTAddress) {
    throw new Error(
      "Please set MOCK_USDT_ADDRESS or USDT_ADDRESS in .env file"
    );
  }

  console.log(`Claiming test tokens from MockUSDT at: ${mockUSDTAddress}`);
  console.log(`Recipient: ${signer.address}`);

  // Get MockUSDT contract
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = MockUSDT.attach(mockUSDTAddress);

  // Check current balance
  const balanceBefore = await mockUSDT.balanceOf(signer.address);
  console.log(
    `\nBalance before: ${ethers.formatEther(balanceBefore)} USDT`
  );

  // Claim from faucet (10,000 USDT)
  console.log(`\nClaiming 10,000 USDT from faucet...`);
  const tx = await mockUSDT.faucet();
  console.log(`Transaction hash: ${tx.hash}`);

  await tx.wait();
  console.log(`✅ Transaction confirmed`);

  // Check new balance
  const balanceAfter = await mockUSDT.balanceOf(signer.address);
  console.log(`\nBalance after: ${ethers.formatEther(balanceAfter)} USDT`);
  console.log(
    `Claimed: ${ethers.formatEther(balanceAfter - balanceBefore)} USDT`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
