import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploy MockUSDT on testnet
 *
 * This script deploys a mock USDT token for testing purposes
 */
const deployMockUSDT: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Only deploy on testnets
  if (["bsc", "polygon"].includes(network.name)) {
    console.log(`Skipping MockUSDT deployment on ${network.name} (mainnet)`);
    return;
  }

  console.log(`Deploying MockUSDT on ${network.name}...`);
  console.log(`Deployer address: ${deployer}`);

  const mockUSDT = await deploy("MockUSDT", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: 1,
  });

  console.log(`\n✅ MockUSDT deployed at: ${mockUSDT.address}`);

  console.log(`\nNext steps:`);
  console.log(`1. Update .env with:`);
  console.log(`   USDT_ADDRESS=${mockUSDT.address}`);
  console.log(`\n2. Claim test tokens:`);
  console.log(
    `   npx hardhat run scripts/claimTestTokens.ts --network ${network.name}`
  );
  console.log(`\n3. Or use faucet function directly in contract`);
};

deployMockUSDT.tags = ["MockUSDT", "testnet"];

export default deployMockUSDT;
