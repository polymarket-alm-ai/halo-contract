import { ethers } from 'hardhat';
import { getVaultDepositSwapData, fromWei } from './symbiosisHelper';

/**
 * Example script for depositing USDT into the Vault
 *
 * This script demonstrates how to:
 * 1. Get swap data from Symbiosis API
 * 2. Approve USDT to Vault
 * 3. Deposit USDT to Vault which triggers cross-chain swap
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const userAddress = await signer.getAddress();

  console.log('Deposit Example');
  console.log('===============');
  console.log(`User address: ${userAddress}`);

  // Get deployed Vault address
  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error('VAULT_ADDRESS not set in environment');
  }

  // Get agent wallet from environment or use default
  const agentWallet = process.env.AGENT_WALLET;
  if (!agentWallet) {
    throw new Error('AGENT_WALLET not set in environment');
  }

  console.log(`Vault address: ${vaultAddress}`);
  console.log(`Agent wallet: ${agentWallet}`);

  // Get contract instances
  const vault = await ethers.getContractAt('Vault', vaultAddress);
  const usdtAddress = await vault.usdt();
  const usdt = await ethers.getContractAt('IERC20', usdtAddress);

  // Deposit amount (e.g., 100 USDT)
  const depositAmount = ethers.parseEther('100'); // 100 USDT (18 decimals on BSC)

  console.log(`\nDeposit amount: ${ethers.formatEther(depositAmount)} USDT`);

  // Step 1: Check USDT balance
  const usdtBalance = await usdt.balanceOf(userAddress);
  console.log(`\nUSDT balance: ${ethers.formatEther(usdtBalance)} USDT`);

  if (usdtBalance < depositAmount) {
    throw new Error('Insufficient USDT balance');
  }

  // Step 2: Get swap data from Symbiosis API
  console.log('\nFetching swap data from Symbiosis API...');
  const swapData = await getVaultDepositSwapData(
    depositAmount.toString(),
    agentWallet,
    userAddress,
    100 // 1% slippage
  );

  console.log('\nSwap Details:');
  console.log(`Expected USDC output: ${fromWei(swapData.tokenAmountOut.amount, 6)} USDC`);
  console.log(`Price impact: ${swapData.priceImpact}%`);
  console.log(`Required gas fee: ${ethers.formatEther(swapData.transactionRequest.value)} BNB`);

  // Step 3: Approve USDT to Vault (if needed)
  console.log('\nChecking USDT approval...');
  const currentAllowance = await usdt.allowance(userAddress, vaultAddress);

  if (currentAllowance < depositAmount) {
    console.log('Approving USDT...');
    const approveTx = await usdt.approve(vaultAddress, ethers.MaxUint256);
    await approveTx.wait();
    console.log('✅ USDT approved');
  } else {
    console.log('✅ USDT already approved');
  }

  // Step 4: Deposit to Vault
  console.log('\nDepositing to Vault...');
  const gasFee = swapData.transactionRequest.value;
  const symbiosisCalldata = swapData.transactionRequest.data;

  const depositTx = await vault.deposit(depositAmount, symbiosisCalldata, {
    value: gasFee,
    gasLimit: 500000, // Adjust based on actual usage
  });

  console.log(`Transaction hash: ${depositTx.hash}`);
  console.log('Waiting for confirmation...');

  const receipt = await depositTx.wait();
  console.log(`✅ Deposit confirmed in block ${receipt?.blockNumber}`);

  // Step 5: Track cross-chain swap status
  console.log('\nTracking cross-chain swap...');
  console.log('You can monitor the swap status at:');
  console.log(`https://app.symbiosis.finance/swap?fromChain=56&toChain=137&tx=${depositTx.hash}`);

  // Get user's total deposits
  const totalDeposits = await vault.getUserDeposit(userAddress);
  console.log(`\nYour total deposits: ${ethers.formatEther(totalDeposits)} USDT`);

  console.log('\n✅ Deposit completed successfully!');
  console.log('USDC will arrive at the agent wallet on Polygon shortly.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
