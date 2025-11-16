import { ethers } from 'hardhat';
import axios from 'axios';

/**
 * Off-chain Valuer Service
 *
 * This service calculates the total value of assets under management
 * across multiple wallets and chains, then updates the vault contract.
 *
 * Valuation sources:
 * 1. Agent wallet USDC balance on Polygon
 * 2. Gnosis Safe USDC balance on Polygon
 * 3. Polymarket positions value
 * 4. Any other assets
 */

// Configuration
const POLYGON_RPC = process.env.POLYGON_RPC || 'https://polygon-rpc.com';
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || '';
const AGENT_WALLET = process.env.AGENT_WALLET || '';
const GNOSIS_SAFE = process.env.GNOSIS_SAFE || '';
const POLYMARKET_API = 'https://clob.polymarket.com';

// Token addresses on Polygon
const USDC_POLYGON = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'; // USDC.e
const USDC_DECIMALS = 6;
const USDT_DECIMALS = 18;

// USDC/USDT price (typically 1:1, but can be adjusted)
const USDC_TO_USDT_RATE = 1.0;

/**
 * Get USDC balance of an address on Polygon
 */
async function getUSDCBalance(address: string): Promise<number> {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const usdcContract = new ethers.Contract(
      USDC_POLYGON,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );

    const balance = await usdcContract.balanceOf(address);
    const balanceFormatted = parseFloat(ethers.formatUnits(balance, USDC_DECIMALS));

    console.log(`USDC balance for ${address}: ${balanceFormatted} USDC`);
    return balanceFormatted;
  } catch (error) {
    console.error(`Error fetching USDC balance for ${address}:`, error);
    return 0;
  }
}

/**
 * Get Polymarket positions value for an address
 */
async function getPolymarketValue(address: string): Promise<number> {
  try {
    // Fetch user's positions from Polymarket API
    const response = await axios.get(`${POLYMARKET_API}/positions`, {
      params: {
        user: address,
      },
    });

    let totalValue = 0;

    if (response.data && response.data.positions) {
      for (const position of response.data.positions) {
        // Calculate position value
        // This is simplified - actual implementation depends on Polymarket API structure
        const size = parseFloat(position.size || 0);
        const price = parseFloat(position.price || 0);
        const value = size * price;

        totalValue += value;
      }
    }

    console.log(`Polymarket positions value for ${address}: ${totalValue} USDC`);
    return totalValue;
  } catch (error) {
    console.error(`Error fetching Polymarket positions for ${address}:`, error);
    return 0;
  }
}

/**
 * Get Gnosis Safe token balances
 * @param safeAddress Gnosis Safe address
 */
async function getGnosisSafeBalance(safeAddress: string): Promise<number> {
  try {
    // Option 1: Direct balance check (same as regular wallet)
    const directBalance = await getUSDCBalance(safeAddress);

    // Option 2: Use Gnosis Safe API for more detailed info
    // const safeService = 'https://safe-transaction-polygon.safe.global';
    // const response = await axios.get(`${safeService}/api/v1/safes/${safeAddress}/balances/usd/`);
    // Parse response and sum up USDC value

    console.log(`Gnosis Safe USDC balance: ${directBalance} USDC`);
    return directBalance;
  } catch (error) {
    console.error(`Error fetching Gnosis Safe balance:`, error);
    return 0;
  }
}

/**
 * Calculate total assets under management
 */
async function calculateTotalAssets(): Promise<{
  totalUSDC: number;
  totalUSDT: number;
  breakdown: {
    agentWallet: number;
    gnosisSafe: number;
    polymarketPositions: number;
  };
}> {
  console.log('\n=== Calculating Total Assets ===\n');

  // 1. Get agent wallet USDC balance
  const agentWalletBalance = await getUSDCBalance(AGENT_WALLET);

  // 2. Get Gnosis Safe USDC balance
  const gnosisSafeBalance = GNOSIS_SAFE
    ? await getGnosisSafeBalance(GNOSIS_SAFE)
    : 0;

  // 3. Get Polymarket positions value
  const polymarketValue = GNOSIS_SAFE
    ? await getPolymarketValue(GNOSIS_SAFE)
    : 0;

  // 4. Sum up total USDC
  const totalUSDC = agentWalletBalance + gnosisSafeBalance + polymarketValue;

  // 5. Convert to USDT (with 18 decimals for vault contract)
  const totalUSDT = totalUSDC * USDC_TO_USDT_RATE;

  console.log('\n=== Valuation Summary ===');
  console.log(`Agent Wallet: ${agentWalletBalance.toFixed(2)} USDC`);
  console.log(`Gnosis Safe: ${gnosisSafeBalance.toFixed(2)} USDC`);
  console.log(`Polymarket Positions: ${polymarketValue.toFixed(2)} USDC`);
  console.log(`Total: ${totalUSDC.toFixed(2)} USDC`);
  console.log(`Total (USDT equivalent): ${totalUSDT.toFixed(2)} USDT`);

  return {
    totalUSDC,
    totalUSDT,
    breakdown: {
      agentWallet: agentWalletBalance,
      gnosisSafe: gnosisSafeBalance,
      polymarketPositions: polymarketValue,
    },
  };
}

/**
 * Update vault contract with new total assets
 */
async function updateVault(totalUSDT: number): Promise<void> {
  try {
    console.log('\n=== Updating Vault Contract ===\n');

    const [signer] = await ethers.getSigners();
    const vault = await ethers.getContractAt('VaultERC4626', VAULT_ADDRESS, signer);

    // Convert to wei (18 decimals)
    const totalAssetsWei = ethers.parseEther(totalUSDT.toString());

    console.log(`Updating total assets to: ${totalUSDT} USDT`);
    console.log(`In wei: ${totalAssetsWei.toString()}`);

    // Check if signer is the valuer
    const currentValuer = await vault.valuer();
    const signerAddress = await signer.getAddress();

    if (currentValuer.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error(
        `Signer ${signerAddress} is not the authorized valuer ${currentValuer}`
      );
    }

    // Update total assets
    const tx = await vault.updateTotalAssets(totalAssetsWei);
    console.log(`Transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`✅ Total assets updated in block ${receipt?.blockNumber}`);

    // Get current state
    const totalAssets = await vault.totalAssets();
    const totalSupply = await vault.totalSupply();
    const pricePerShare = totalSupply > 0n
      ? (totalAssets * ethers.parseEther('1')) / totalSupply
      : ethers.parseEther('1');

    console.log('\n=== Vault State ===');
    console.log(`Total Assets: ${ethers.formatEther(totalAssets)} USDT`);
    console.log(`Total Shares: ${ethers.formatEther(totalSupply)}`);
    console.log(`Price per Share: ${ethers.formatEther(pricePerShare)} USDT`);
  } catch (error) {
    console.error('Error updating vault:', error);
    throw error;
  }
}

/**
 * Get current vault state
 */
async function getVaultState(): Promise<void> {
  try {
    const vault = await ethers.getContractAt('VaultERC4626', VAULT_ADDRESS);

    const totalAssets = await vault.totalAssets();
    const totalSupply = await vault.totalSupply();
    const lastUpdate = await vault.lastValuationUpdate();
    const isValuationFresh = await vault.isValuationFresh();

    const pricePerShare = totalSupply > 0n
      ? (totalAssets * ethers.parseEther('1')) / totalSupply
      : ethers.parseEther('1');

    console.log('\n=== Current Vault State ===');
    console.log(`Total Assets: ${ethers.formatEther(totalAssets)} USDT`);
    console.log(`Total Shares: ${ethers.formatEther(totalSupply)}`);
    console.log(`Price per Share: ${ethers.formatEther(pricePerShare)} USDT`);
    console.log(`Last Valuation: ${new Date(Number(lastUpdate) * 1000).toISOString()}`);
    console.log(`Valuation Fresh: ${isValuationFresh}`);
  } catch (error) {
    console.error('Error getting vault state:', error);
  }
}

/**
 * Main valuation and update process
 */
async function runValuation(updateContract: boolean = true): Promise<void> {
  try {
    console.log('Starting valuation process...');
    console.log(`Vault: ${VAULT_ADDRESS}`);
    console.log(`Agent Wallet: ${AGENT_WALLET}`);
    console.log(`Gnosis Safe: ${GNOSIS_SAFE || 'Not configured'}`);

    // Calculate total assets
    const valuation = await calculateTotalAssets();

    if (updateContract && VAULT_ADDRESS) {
      // Update vault contract
      await updateVault(valuation.totalUSDT);
    } else {
      console.log('\nSkipping vault update (dry run or no vault address)');
    }

    // Show final vault state
    if (VAULT_ADDRESS) {
      await getVaultState();
    }

    console.log('\n✅ Valuation complete!');
  } catch (error) {
    console.error('Valuation failed:', error);
    process.exit(1);
  }
}

/**
 * Run as cron job or standalone service
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const showStateOnly = args.includes('--state');

  if (showStateOnly) {
    await getVaultState();
    return;
  }

  // Run valuation
  await runValuation(!isDryRun);

  // If --watch flag, run periodically
  if (args.includes('--watch')) {
    const intervalMinutes = parseInt(args[args.indexOf('--watch') + 1] || '60');
    console.log(`\nWatching... Will update every ${intervalMinutes} minutes`);

    setInterval(async () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running scheduled valuation at ${new Date().toISOString()}`);
      console.log('='.repeat(60));
      await runValuation(!isDryRun);
    }, intervalMinutes * 60 * 1000);
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => {
      if (!process.argv.includes('--watch')) {
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

// Export functions for use in other scripts
export {
  calculateTotalAssets,
  updateVault,
  getVaultState,
  getUSDCBalance,
  getPolymarketValue,
  getGnosisSafeBalance,
};
