import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';

/**
 * Deploy VaultERC4626 on BNB Chain
 *
 * This script deploys the ERC4626-compliant vault with oracle integration
 */
const deployVaultERC4626: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Only deploy on BNB chain
  if (!['bsc', 'bsc-testnet'].includes(network.name)) {
    console.log(`Skipping VaultERC4626 deployment on ${network.name}`);
    return;
  }

  console.log(`Deploying VaultERC4626 on ${network.name}...`);
  console.log(`Deployer address: ${deployer}`);

  // Contract addresses
  const USDT_ADDRESS = {
    'bsc': '0x55d398326f99059fF775485246999027B3197955',
    'bsc-testnet': '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
  };

  const SYMBIOSIS_GATEWAY = {
    'bsc': '0x5c97D726bf5130AE15408cE32bc764e458320D2f',
    'bsc-testnet': '0x5c97D726bf5130AE15408cE32bc764e458320D2f',
  };

  // Configuration
  const AGENT_WALLET = process.env.AGENT_WALLET || deployer;
  const VALUER = process.env.VALUER || deployer;
  const MIN_DEPOSIT = ethers.parseEther('100'); // 100 USDT
  const MAX_VALUATION_AGE = 24 * 60 * 60; // 24 hours

  const usdt = USDT_ADDRESS[network.name as keyof typeof USDT_ADDRESS];
  const symbiosisGateway = SYMBIOSIS_GATEWAY[network.name as keyof typeof SYMBIOSIS_GATEWAY];

  console.log(`\nConfiguration:`);
  console.log(`USDT Address: ${usdt}`);
  console.log(`Symbiosis Gateway: ${symbiosisGateway}`);
  console.log(`Agent Wallet: ${AGENT_WALLET}`);
  console.log(`Valuer: ${VALUER}`);
  console.log(`Min Deposit: ${ethers.formatEther(MIN_DEPOSIT)} USDT`);
  console.log(`Max Valuation Age: ${MAX_VALUATION_AGE / 3600} hours`);

  const vault = await deploy('VaultERC4626', {
    from: deployer,
    args: [
      usdt,
      symbiosisGateway,
      AGENT_WALLET,
      VALUER,
      MIN_DEPOSIT,
      MAX_VALUATION_AGE,
    ],
    log: true,
    waitConfirmations: network.name === 'bsc' ? 3 : 1,
  });

  console.log(`\n✅ VaultERC4626 deployed at: ${vault.address}`);

  // Get initial state
  const vaultContract = await ethers.getContractAt('VaultERC4626', vault.address);
  const name = await vaultContract.name();
  const symbol = await vaultContract.symbol();
  const asset = await vaultContract.asset();

  console.log(`\nVault Details:`);
  console.log(`Name: ${name}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Asset: ${asset}`);

  console.log(`\nNext steps:`);
  console.log(`1. Set VAULT_ADDRESS=${vault.address} in .env`);
  console.log(`2. Run valuer to update total assets:`);
  console.log(`   VAULT_ADDRESS=${vault.address} npx hardhat run scripts/valuer.ts --network ${network.name}`);
  console.log(`3. Test deposit:`);
  console.log(`   npx hardhat run scripts/depositERC4626Example.ts --network ${network.name}`);
  console.log(`4. Set up cron job for valuer:`);
  console.log(`   */30 * * * * npx hardhat run scripts/valuer.ts --network ${network.name}`);
};

deployVaultERC4626.tags = ['VaultERC4626', 'bsc'];

export default deployVaultERC4626;
