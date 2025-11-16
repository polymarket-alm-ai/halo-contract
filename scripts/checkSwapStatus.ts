import { getSwapStatus } from './symbiosisHelper';

/**
 * Script to check the status of a cross-chain swap
 *
 * Usage:
 * TX_HASH=0x... npx hardhat run scripts/checkSwapStatus.ts
 */
async function main() {
  const txHash = process.env.TX_HASH;
  if (!txHash) {
    throw new Error('TX_HASH not set in environment');
  }

  const chainId = 56; // BNB Chain

  console.log('Checking Swap Status');
  console.log('===================');
  console.log(`Transaction: ${txHash}`);
  console.log(`Chain ID: ${chainId}`);

  try {
    const status = await getSwapStatus(chainId, txHash);

    console.log('\nSwap Status:');
    console.log(JSON.stringify(status, null, 2));

    if (status.status === 'completed') {
      console.log('\n✅ Swap completed successfully!');
      console.log(`USDC delivered to agent wallet on Polygon`);
    } else if (status.status === 'pending') {
      console.log('\n⏳ Swap in progress...');
      console.log('Please check again in a few minutes');
    } else if (status.status === 'failed') {
      console.log('\n❌ Swap failed');
      console.log('Reason:', status.error);
    } else {
      console.log('\n⚠️ Unknown status');
    }
  } catch (error) {
    console.error('Error fetching swap status:', error);
    console.log('\nNote: The transaction may still be processing.');
    console.log('You can also check on the Symbiosis web app:');
    console.log(`https://app.symbiosis.finance/swap?fromChain=56&toChain=137&tx=${txHash}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
