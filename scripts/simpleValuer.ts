import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Simple Valuer - Updates vault total assets based on USDT in vault
 *
 * This is a simplified version that only counts:
 * - USDT balance in the vault contract on BNB Chain
 *
 * Usage:
 * npm run valuer:simple
 */
async function main() {
  const vaultAddress = process.env.VAULT_ADDRESS || '0x6123622b87356F3f2c89d4B4454EF5F123C5e21d';

  console.log(`\n💰 Simple Valuer - Update Total Assets`);
  console.log('━'.repeat(80));
  console.log(`   Vault Address: ${vaultAddress}\n`);

  try {
    // Get vault contract
    const vault = await ethers.getContractAt('HaloVault', vaultAddress);

    // Get USDT token address
    const usdtAddress = await vault.asset();
    console.log(`📍 USDT Token: ${usdtAddress}`);

    // Get USDT contract
    const usdt = await ethers.getContractAt(
      ['function balanceOf(address) view returns (uint256)'],
      usdtAddress
    );

    // Get vault's USDT balance
    const vaultBalance = await usdt.balanceOf(vaultAddress);
    const vaultBalanceFormatted = ethers.formatEther(vaultBalance);

    console.log(`\n📊 Asset Calculation:`);
    console.log(`   USDT in Vault:        ${vaultBalanceFormatted} USDT`);
    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Total Assets:         ${vaultBalanceFormatted} USDT`);

    // Get current total assets from vault
    const currentTotal = await vault.totalAssets();
    const currentTotalFormatted = ethers.formatEther(currentTotal);

    console.log(`\n📈 Current vs New:`);
    console.log(`   Current Total:        ${currentTotalFormatted} USDT`);
    console.log(`   New Total:            ${vaultBalanceFormatted} USDT`);
    console.log(`   Change:               ${(parseFloat(vaultBalanceFormatted) - parseFloat(currentTotalFormatted)).toFixed(4)} USDT`);

    // Check if we're the valuer
    const valuer = await vault.valuer();
    const [signer] = await ethers.getSigners();

    console.log(`\n🔐 Access Control:`);
    console.log(`   Valuer Address:       ${valuer}`);
    console.log(`   Your Address:         ${signer.address}`);
    console.log(`   You are valuer:       ${signer.address.toLowerCase() === valuer.toLowerCase() ? '✅ Yes' : '❌ No'}`);

    if (signer.address.toLowerCase() !== valuer.toLowerCase()) {
      console.log(`\n❌ Error: You are not the valuer`);
      console.log(`   Only the valuer can update total assets\n`);
      process.exit(1);
    }

    console.log('\n' + '━'.repeat(80));

    // Ask for confirmation
    console.log(`\n🔄 Updating vault total assets to ${vaultBalanceFormatted} USDT...`);

    const tx = await vault.updateTotalAssets(vaultBalance);
    console.log(`   Transaction hash: ${tx.hash}`);
    console.log(`   Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`\n✅ Valuation updated successfully!`);
    console.log(`   Block: ${receipt?.blockNumber}`);
    console.log(`   Gas used: ${receipt?.gasUsed.toString()}`);

    // Verify the update
    const newTotal = await vault.totalAssets();
    const lastUpdate = await vault.lastValuationUpdate();
    const isValuationFresh = await vault.isValuationFresh();

    console.log(`\n📊 Updated Vault Status:`);
    console.log(`   Total Assets:         ${ethers.formatEther(newTotal)} USDT`);
    console.log(`   Last Update:          ${new Date(Number(lastUpdate) * 1000).toLocaleString()}`);
    console.log(`   Is Fresh:             ${isValuationFresh ? '✅ Yes' : '❌ No'}`);

    console.log(`\n🎉 Users can now deposit and withdraw!`);
    console.log(`   View transaction: https://bscscan.com/tx/${tx.hash}\n`);

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
