import { run } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Script to verify HaloVault contract on BSCScan
 *
 * Usage:
 * npx hardhat run scripts/verifyHaloVault.ts --network bsc
 *
 * Or for testnet:
 * npx hardhat run scripts/verifyHaloVault.ts --network bsc-testnet
 */
async function main() {
  // Load deployment info
  const network = process.env.HARDHAT_NETWORK || 'bsc';
  const deploymentPath = `./deployments/${network}/HaloVault.json`;

  console.log(`\n🔍 Verifying HaloVault contract on ${network}...`);
  console.log('━'.repeat(60));

  let deployment;
  try {
    deployment = require(`../${deploymentPath}`);
  } catch (error) {
    console.error(`❌ Could not load deployment file: ${deploymentPath}`);
    console.error('Please ensure the contract has been deployed first.');
    process.exit(1);
  }

  const contractAddress = deployment.address;
  const constructorArgs = deployment.args;

  console.log(`\n📋 Contract Details:`);
  console.log(`   Address: ${contractAddress}`);
  console.log(`\n📝 Constructor Arguments:`);
  console.log(`   USDT Token:          ${constructorArgs[0]}`);
  console.log(`   Symbiosis Gateway:   ${constructorArgs[1]}`);
  console.log(`   Agent Wallet:        ${constructorArgs[2]}`);
  console.log(`   Agent:               ${constructorArgs[3]}`);
  console.log(`   Valuer:              ${constructorArgs[4]}`);
  console.log(`   Min Deposit:         ${constructorArgs[5]} (${Number(constructorArgs[5]) / 1e18} USDT)`);
  console.log(`   Max Valuation Age:   ${constructorArgs[6]} seconds (${Number(constructorArgs[6]) / 3600} hours)`);
  console.log('\n' + '━'.repeat(60));

  try {
    console.log('\n⏳ Submitting contract for verification...\n');

    await run('verify:verify', {
      address: contractAddress,
      constructorArguments: constructorArgs,
      contract: 'contracts/HaloVault.sol:HaloVault',
    });

    console.log('\n' + '━'.repeat(60));
    console.log('✅ Contract verified successfully!');
    console.log('━'.repeat(60));

    // Print explorer link
    const explorerUrl = network === 'bsc'
      ? `https://bscscan.com/address/${contractAddress}#code`
      : `https://testnet.bscscan.com/address/${contractAddress}#code`;

    console.log(`\n🔗 View verified contract:`);
    console.log(`   ${explorerUrl}\n`);

  } catch (error: any) {
    if (error.message.includes('Already Verified') || error.message.includes('already verified')) {
      console.log('\n' + '━'.repeat(60));
      console.log('ℹ️  Contract is already verified!');
      console.log('━'.repeat(60));

      const explorerUrl = network === 'bsc'
        ? `https://bscscan.com/address/${contractAddress}#code`
        : `https://testnet.bscscan.com/address/${contractAddress}#code`;

      console.log(`\n🔗 View verified contract:`);
      console.log(`   ${explorerUrl}\n`);
    } else {
      console.error('\n❌ Verification failed:');
      console.error(error.message);
      process.exit(1);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
