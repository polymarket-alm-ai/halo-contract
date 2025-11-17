import { ethers } from "hardhat";
import { getVaultDepositSwapData } from "./symbiosisHelper";

/**
 * Agent Bridge Script
 *
 * Agent uses this to decide how much USDT to bridge from BNB to Polygon
 * vs how much to keep on BNB Chain for DEX trading/strategies
 */

const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "";
const AGENT_WALLET_POLYGON = process.env.AGENT_WALLET || "";

/**
 * Get vault state and available balance
 */
async function getVaultState() {
  const vault = await ethers.getContractAt("HaloVault", VAULT_ADDRESS);

  const totalAssets = await vault.totalAssets();
  const vaultBalance = await vault.getVaultBalance();
  const totalBridged = await vault.totalBridged();
  const totalSupply = await vault.totalSupply();

  const pricePerShare =
    totalSupply > 0n
      ? (totalAssets * ethers.parseEther("1")) / totalSupply
      : ethers.parseEther("1");

  console.log("=== Vault State ===");
  console.log(`Total Assets (oracle): ${ethers.formatEther(totalAssets)} USDT`);
  console.log(`Vault Balance (BNB): ${ethers.formatEther(vaultBalance)} USDT`);
  console.log(`Total Bridged: ${ethers.formatEther(totalBridged)} USDT`);
  console.log(`Total Shares: ${ethers.formatEther(totalSupply)}`);
  console.log(`Price per Share: ${ethers.formatEther(pricePerShare)} USDT`);
  console.log("");

  return {
    totalAssets: Number(ethers.formatEther(totalAssets)),
    vaultBalance: Number(ethers.formatEther(vaultBalance)),
    totalBridged: Number(ethers.formatEther(totalBridged)),
    totalSupply: Number(ethers.formatEther(totalSupply)),
    pricePerShare: Number(ethers.formatEther(pricePerShare)),
  };
}

/**
 * Calculate optimal bridge amount
 * @param strategy Strategy for allocation
 */
function calculateBridgeAmount(
  vaultBalance: number,
  strategy: "conservative" | "balanced" | "aggressive" | "custom",
  customPercent?: number
): number {
  let bridgePercent: number;

  switch (strategy) {
    case "conservative":
      // Keep 30% on BNB for DEX, bridge 70%
      bridgePercent = 70;
      break;
    case "balanced":
      // Keep 20% on BNB, bridge 80%
      bridgePercent = 80;
      break;
    case "aggressive":
      // Keep 10% on BNB, bridge 90%
      bridgePercent = 90;
      break;
    case "custom":
      bridgePercent = customPercent || 80;
      break;
    default:
      bridgePercent = 80;
  }

  const bridgeAmount = vaultBalance * (bridgePercent / 100);
  const keepAmount = vaultBalance - bridgeAmount;

  console.log("=== Bridge Calculation ===");
  console.log(`Strategy: ${strategy}`);
  console.log(
    `Bridge ${bridgePercent}% to Polygon: ${bridgeAmount.toFixed(2)} USDT`
  );
  console.log(
    `Keep ${100 - bridgePercent}% on BNB: ${keepAmount.toFixed(2)} USDT`
  );
  console.log("");

  return bridgeAmount;
}

/**
 * Execute bridge transaction
 */
async function executeBridge(amount: number, dryRun: boolean = false) {
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  console.log("=== Bridge Execution ===");
  console.log(`Agent: ${signerAddress}`);
  console.log(`Amount: ${amount} USDT`);
  console.log(`Destination: ${AGENT_WALLET_POLYGON} (Polygon)`);

  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE - No transaction will be sent");
    return;
  }

  // Get swap data from Symbiosis
  console.log("\nFetching Symbiosis swap data...");
  const amountWei = ethers.parseEther(amount.toString());

  const swapData = await getVaultDepositSwapData(
    amountWei.toString(),
    AGENT_WALLET_POLYGON,
    VAULT_ADDRESS, // From vault address
    100 // 1% slippage
  );

  console.log(`Expected USDC output: ${swapData.tokenAmountOut.amount}`);
  console.log(
    `Gas fee required: ${ethers.formatEther(
      swapData.transactionRequest.value
    )} BNB`
  );

  // Execute bridge
  const vault = await ethers.getContractAt(
    "VaultERC4626v2",
    VAULT_ADDRESS,
    signer
  );

  console.log("\nExecuting bridge transaction...");
  const tx = await vault.bridgeToPolygon(
    amountWei,
    swapData.transactionRequest.data,
    {
      value: swapData.transactionRequest.value,
      gasLimit: 500000,
    }
  );

  console.log(`Transaction hash: ${tx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log(`✅ Bridge confirmed in block ${receipt?.blockNumber}`);

  // Show updated state
  console.log("");
  await getVaultState();
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const isDryRun = args.includes("--dry-run");
  const strategyArg = args.find((arg) => arg.startsWith("--strategy="));
  const amountArg = args.find((arg) => arg.startsWith("--amount="));
  const percentArg = args.find((arg) => arg.startsWith("--percent="));

  const strategy = strategyArg
    ? (strategyArg.split("=")[1] as
        | "conservative"
        | "balanced"
        | "aggressive"
        | "custom")
    : "balanced";

  console.log("Agent Bridge Manager\n");

  // Get current vault state
  const state = await getVaultState();

  if (state.vaultBalance === 0) {
    console.log("⚠️  No USDT in vault to bridge");
    return;
  }

  // Calculate bridge amount
  let bridgeAmount: number;

  if (amountArg) {
    // Specific amount provided
    bridgeAmount = parseFloat(amountArg.split("=")[1]);
    console.log(`Using custom amount: ${bridgeAmount} USDT\n`);
  } else if (percentArg) {
    // Percentage provided
    const percent = parseFloat(percentArg.split("=")[1]);
    bridgeAmount = state.vaultBalance * (percent / 100);
    console.log(`Using ${percent}% of vault balance: ${bridgeAmount} USDT\n`);
  } else {
    // Use strategy
    const customPercent =
      strategy === "custom" && percentArg
        ? parseFloat(percentArg.split("=")[1])
        : undefined;
    bridgeAmount = calculateBridgeAmount(
      state.vaultBalance,
      strategy,
      customPercent
    );
  }

  // Validate amount
  if (bridgeAmount > state.vaultBalance) {
    console.error(
      `❌ Error: Bridge amount (${bridgeAmount}) exceeds vault balance (${state.vaultBalance})`
    );
    return;
  }

  if (bridgeAmount <= 0) {
    console.error("❌ Error: Bridge amount must be greater than 0");
    return;
  }

  // Execute bridge
  await executeBridge(bridgeAmount, isDryRun);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
