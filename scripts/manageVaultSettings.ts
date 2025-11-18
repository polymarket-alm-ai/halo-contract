import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Manage HaloVault settings (deposits, withdrawals, etc.)
 *
 * Usage:
 * npx hardhat run scripts/manageVaultSettings.ts --network bsc
 *
 * Or use npm scripts:
 * npm run vault:enable-withdrawals
 * npm run vault:disable-withdrawals
 * npm run vault:enable-deposits
 * npm run vault:disable-deposits
 * npm run vault:settings
 */
async function main() {
  const vaultAddress =
    process.env.VAULT_ADDRESS || "0x6123622b87356F3f2c89d4B4454EF5F123C5e21d";

  // Parse action from environment variable or command line
  const action = process.env.ACTION || "status"; // status, enable-withdrawals, disable-withdrawals, enable-deposits, disable-deposits
  const args = process.argv.slice(2);

  console.log(`\n⚙️  HaloVault Settings Manager`);
  console.log("━".repeat(80));
  console.log(`   Vault Address: ${vaultAddress}\n`);

  const vault = await ethers.getContractAt("HaloVault", vaultAddress);
  const [signer] = await ethers.getSigners();

  try {
    // Get current settings
    const [
      depositsEnabled,
      withdrawalsEnabled,
      owner,
      minDeposit,
      maxValuationAge,
    ] = await Promise.all([
      vault.depositsEnabled(),
      vault.withdrawalsEnabled(),
      vault.owner(),
      vault.minDeposit(),
      vault.maxValuationAge(),
    ]);

    // Display current settings
    console.log(`📊 Current Settings:`);
    console.log(
      `   Deposits Enabled:     ${depositsEnabled ? "✅ Yes" : "❌ No"}`
    );
    console.log(
      `   Withdrawals Enabled:  ${withdrawalsEnabled ? "✅ Yes" : "❌ No"}`
    );
    console.log(
      `   Min Deposit:          ${ethers.formatEther(minDeposit)} USDT`
    );
    console.log(
      `   Max Valuation Age:    ${Number(maxValuationAge) / 3600} hours`
    );
    console.log(`\n👤 Access Control:`);
    console.log(`   Owner:                ${owner}`);
    console.log(`   Your Address:         ${signer.address}`);
    console.log(
      `   You are owner:        ${
        signer.address.toLowerCase() === owner.toLowerCase()
          ? "✅ Yes"
          : "❌ No"
      }`
    );

    // Check if user is owner
    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
      console.log(`\n❌ Error: You are not the owner of this vault`);
      console.log(`   Only the owner can change vault settings`);
      process.exit(1);
    }

    console.log("\n" + "━".repeat(80));

    // Execute action
    if (action === "status") {
      console.log(`\n✅ Status check complete\n`);
      return;
    }

    if (action === "enable-withdrawals") {
      if (withdrawalsEnabled) {
        console.log(`\nℹ️  Withdrawals are already enabled\n`);
        return;
      }

      console.log(`\n🔄 Enabling withdrawals...`);
      const tx = await vault.setWithdrawalsEnabled(true);
      console.log(`   Transaction hash: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      await tx.wait();
      console.log(`\n✅ Withdrawals ENABLED successfully!`);
      console.log(`   Users can now withdraw their funds from the vault\n`);
    } else if (action === "disable-withdrawals") {
      if (!withdrawalsEnabled) {
        console.log(`\nℹ️  Withdrawals are already disabled\n`);
        return;
      }

      console.log(`\n🔄 Disabling withdrawals...`);
      const tx = await vault.setWithdrawalsEnabled(false);
      console.log(`   Transaction hash: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      await tx.wait();
      console.log(`\n✅ Withdrawals DISABLED successfully!`);
      console.log(`   Users can no longer withdraw from the vault\n`);
    } else if (action === "enable-deposits") {
      if (depositsEnabled) {
        console.log(`\nℹ️  Deposits are already enabled\n`);
        return;
      }

      console.log(`\n🔄 Enabling deposits...`);
      const tx = await vault.setDepositsEnabled(true);
      console.log(`   Transaction hash: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      await tx.wait();
      console.log(`\n✅ Deposits ENABLED successfully!`);
      console.log(`   Users can now deposit USDT into the vault\n`);
    } else if (action === "disable-deposits") {
      if (!depositsEnabled) {
        console.log(`\nℹ️  Deposits are already disabled\n`);
        return;
      }

      console.log(`\n🔄 Disabling deposits...`);
      const tx = await vault.setDepositsEnabled(false);
      console.log(`   Transaction hash: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      await tx.wait();
      console.log(`\n✅ Deposits DISABLED successfully!`);
      console.log(`   Users can no longer deposit into the vault\n`);
    } else if (action === "set-min-deposit") {
      const amount = args[1];
      if (!amount) {
        console.log(`\n❌ Error: Please provide minimum deposit amount`);
        console.log(`   Usage: npm run vault:set-min-deposit <amount>`);
        console.log(`   Example: npm run vault:set-min-deposit 100\n`);
        process.exit(1);
      }

      const amountWei = ethers.parseEther(amount);
      console.log(`\n🔄 Setting minimum deposit to ${amount} USDT...`);
      const tx = await vault.setMinDeposit(amountWei);
      console.log(`   Transaction hash: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      await tx.wait();
      console.log(`\n✅ Minimum deposit updated to ${amount} USDT\n`);
    } else if (action === "set-max-valuation-age") {
      const hours = args[1];
      if (!hours) {
        console.log(`\n❌ Error: Please provide max valuation age in hours`);
        console.log(`   Usage: npm run vault:set-valuation-age <hours>`);
        console.log(`   Example: npm run vault:set-valuation-age 24\n`);
        process.exit(1);
      }

      const seconds = Number(hours) * 3600;
      console.log(`\n🔄 Setting max valuation age to ${hours} hours...`);
      const tx = await vault.setMaxValuationAge(seconds);
      console.log(`   Transaction hash: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      await tx.wait();
      console.log(`\n✅ Max valuation age updated to ${hours} hours\n`);
    } else {
      console.log(`\n❌ Unknown action: ${action}`);
      console.log(`\nAvailable actions:`);
      console.log(
        `   status                  - Show current settings (default)`
      );
      console.log(`   enable-withdrawals      - Enable user withdrawals`);
      console.log(`   disable-withdrawals     - Disable user withdrawals`);
      console.log(`   enable-deposits         - Enable user deposits`);
      console.log(`   disable-deposits        - Disable user deposits`);
      console.log(`   set-min-deposit <amt>   - Set minimum deposit amount`);
      console.log(`   set-max-valuation-age <hours> - Set max valuation age\n`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n❌ Error:`);
    console.error(error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
