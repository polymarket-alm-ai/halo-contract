import axios from 'axios';
import { ethers } from 'ethers';
import crypto from 'crypto';

/**
 * Aster DEX API Integration Helper
 *
 * Handles deposit/withdrawal operations for Aster DEX trading
 * Reference: https://github.com/asterdex/api-docs/blob/master/aster-deposit-withdrawal.md
 */

// API Configuration
const ASTER_SPOT_API = 'https://sapi.asterdex.com/api/v1/aster';
const ASTER_FUTURES_API = 'https://fapi.asterdex.com/fapi/aster';

// Network Configuration
const BNB_CHAIN_ID = 56;
const NETWORK_TYPE = 'EVM';
const ACCOUNT_TYPE = 'SPOT'; // or 'FUTURES'

/**
 * Generate HMAC SHA256 signature for Aster DEX API
 */
function generateSignature(queryString: string, apiSecret: string): string {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

/**
 * Build query string with timestamp and signature
 */
function buildSignedQueryString(params: Record<string, any>, apiSecret: string): string {
  const timestamp = Date.now();
  const recvWindow = 5000;

  const baseParams = {
    ...params,
    timestamp,
    recvWindow,
  };

  // Sort params alphabetically
  const sortedParams = Object.keys(baseParams)
    .sort()
    .reduce((acc, key) => {
      acc[key] = baseParams[key];
      return acc;
    }, {} as Record<string, any>);

  const queryString = new URLSearchParams(sortedParams).toString();
  const signature = generateSignature(queryString, apiSecret);

  return `${queryString}&signature=${signature}`;
}

/**
 * Get deposit assets configuration
 */
export async function getDepositAssets(apiKey: string, apiSecret: string) {
  try {
    const params = {
      chainId: BNB_CHAIN_ID,
      network: NETWORK_TYPE,
      accountType: ACCOUNT_TYPE,
    };

    const queryString = buildSignedQueryString(params, apiSecret);

    const response = await axios.get(`${ASTER_SPOT_API}/capital/deposit/assets?${queryString}`, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching deposit assets:', error);
    throw error;
  }
}

/**
 * Get withdrawal assets configuration
 */
export async function getWithdrawAssets(apiKey: string, apiSecret: string) {
  try {
    const params = {
      chainId: BNB_CHAIN_ID,
      network: NETWORK_TYPE,
      accountType: ACCOUNT_TYPE,
    };

    const queryString = buildSignedQueryString(params, apiSecret);

    const response = await axios.get(`${ASTER_SPOT_API}/capital/withdraw/assets?${queryString}`, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching withdraw assets:', error);
    throw error;
  }
}

/**
 * Estimate withdrawal fee
 */
export async function estimateWithdrawFee(
  amount: string,
  currency: string,
  apiKey: string,
  apiSecret: string
) {
  try {
    const params = {
      chainId: BNB_CHAIN_ID,
      network: NETWORK_TYPE,
      accountType: ACCOUNT_TYPE,
      amount,
      currency,
    };

    const queryString = buildSignedQueryString(params, apiSecret);

    const response = await axios.get(
      `${ASTER_SPOT_API}/capital/estimate-withdraw-fee?${queryString}`,
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error estimating withdraw fee:', error);
    throw error;
  }
}

/**
 * Generate EIP712 signature for withdrawal
 */
export async function signWithdrawal(
  amount: string,
  fee: string,
  receiver: string,
  nonce: number,
  signer: ethers.Signer
): Promise<string> {
  const domain = {
    name: 'AsterDEX',
    version: '1',
    chainId: BNB_CHAIN_ID,
  };

  const types = {
    Withdrawal: [
      { name: 'amount', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
  };

  const value = {
    amount: ethers.parseUnits(amount, 18), // Adjust decimals as needed
    fee: ethers.parseUnits(fee, 18),
    receiver,
    nonce,
  };

  const signature = await signer.signTypedData(domain, types, value);
  return signature;
}

/**
 * Submit withdrawal request
 */
export async function submitWithdrawal(
  amount: string,
  currency: string,
  receiver: string,
  fee: string,
  nonce: number,
  signature: string,
  apiKey: string,
  apiSecret: string
) {
  try {
    const params = {
      chainId: BNB_CHAIN_ID,
      network: NETWORK_TYPE,
      accountType: ACCOUNT_TYPE,
      amount,
      currency,
      receiver,
      fee,
      nonce,
      signature,
    };

    const queryString = buildSignedQueryString(params, apiSecret);

    const response = await axios.post(
      `${ASTER_SPOT_API}/capital/withdraw/apply`,
      {},
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
        },
        params: Object.fromEntries(new URLSearchParams(queryString)),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error submitting withdrawal:', error);
    throw error;
  }
}

/**
 * Deposit USDT from vault to Aster DEX
 *
 * Flow:
 * 1. Vault.withdrawToAgent() - Transfer USDT from vault to agent EOA
 * 2. Agent EOA approves USDT to Aster deposit contract
 * 3. Agent EOA transfers USDT to Aster deposit contract
 * 4. USDT shows up in Aster DEX balance
 */
export async function depositToAster(
  vaultAddress: string,
  amount: string,
  agentSigner: ethers.Signer,
  apiKey: string,
  apiSecret: string
) {
  console.log('=== Depositing to Aster DEX ===\n');

  const agentAddress = await agentSigner.getAddress();
  console.log(`Agent: ${agentAddress}`);
  console.log(`Amount: ${amount} USDT`);

  // Step 1: Get deposit configuration
  console.log('\n1. Fetching deposit assets...');
  const depositAssets = await getDepositAssets(apiKey, apiSecret);

  const usdtAsset = depositAssets.find(
    (asset: any) => asset.currency === 'USDT' || asset.asset === 'USDT'
  );

  if (!usdtAsset) {
    throw new Error('USDT not found in deposit assets');
  }

  console.log(`USDT Deposit Contract: ${usdtAsset.contractAddress}`);
  console.log(`USDT Decimals: ${usdtAsset.decimals}`);

  // Step 2: Withdraw USDT from vault to agent EOA
  console.log('\n2. Withdrawing USDT from vault to agent...');
  const vault = await ethers.getContractAt('VaultERC4626v2', vaultAddress, agentSigner);
  const amountWei = ethers.parseUnits(amount, 18);

  const withdrawTx = await vault.withdrawToAgent(amountWei, agentAddress);
  await withdrawTx.wait();
  console.log('✅ USDT withdrawn to agent EOA');

  // Step 3: Approve USDT to Aster deposit contract
  console.log('\n3. Approving USDT to Aster deposit contract...');
  const usdt = await ethers.getContractAt(
    'IERC20',
    usdtAsset.contractAddress,
    agentSigner
  );

  const approveTx = await usdt.approve(usdtAsset.contractAddress, amountWei);
  await approveTx.wait();
  console.log('✅ USDT approved');

  // Step 4: Transfer USDT to Aster deposit contract
  console.log('\n4. Transferring USDT to Aster...');
  const transferTx = await usdt.transfer(usdtAsset.contractAddress, amountWei);
  const receipt = await transferTx.wait();
  console.log(`✅ USDT deposited to Aster DEX`);
  console.log(`Transaction: ${receipt?.hash}`);

  console.log('\n✅ Deposit complete! Check Aster DEX balance.');

  return receipt;
}

/**
 * Withdraw USDT from Aster DEX back to agent EOA
 *
 * Flow:
 * 1. Get withdrawal fee estimate
 * 2. Generate EIP712 signature
 * 3. Submit withdrawal request
 * 4. Wait for Aster to process and send USDT to agent EOA
 */
export async function withdrawFromAster(
  amount: string,
  agentSigner: ethers.Signer,
  apiKey: string,
  apiSecret: string
) {
  console.log('=== Withdrawing from Aster DEX ===\n');

  const agentAddress = await agentSigner.getAddress();
  console.log(`Agent: ${agentAddress}`);
  console.log(`Amount: ${amount} USDT`);

  // Step 1: Estimate withdrawal fee
  console.log('\n1. Estimating withdrawal fee...');
  const feeEstimate = await estimateWithdrawFee(amount, 'USDT', apiKey, apiSecret);
  console.log(`Withdrawal Fee: ${feeEstimate.fee} USDT`);

  // Step 2: Generate nonce
  const nonce = Date.now() * 1000;

  // Step 3: Generate EIP712 signature
  console.log('\n2. Generating withdrawal signature...');
  const signature = await signWithdrawal(
    amount,
    feeEstimate.fee,
    agentAddress,
    nonce,
    agentSigner
  );
  console.log('✅ Signature generated');

  // Step 4: Submit withdrawal
  console.log('\n3. Submitting withdrawal request...');
  const result = await submitWithdrawal(
    amount,
    'USDT',
    agentAddress,
    feeEstimate.fee,
    nonce,
    signature,
    apiKey,
    apiSecret
  );

  console.log(`✅ Withdrawal submitted`);
  console.log(`Withdraw ID: ${result.withdrawId}`);
  console.log(`Hash: ${result.hash}`);
  console.log('\n⏳ Waiting for Aster to process withdrawal...');
  console.log('USDT will arrive at agent EOA when processed.');

  return result;
}

/**
 * Return USDT from agent EOA back to vault
 */
export async function returnToVault(
  vaultAddress: string,
  amount: string,
  agentSigner: ethers.Signer,
  usdtAddress: string
) {
  console.log('=== Returning USDT to Vault ===\n');

  const agentAddress = await agentSigner.getAddress();
  const amountWei = ethers.parseUnits(amount, 18);

  console.log(`Agent: ${agentAddress}`);
  console.log(`Amount: ${amount} USDT`);
  console.log(`Vault: ${vaultAddress}`);

  // Transfer USDT back to vault
  const usdt = await ethers.getContractAt('IERC20', usdtAddress, agentSigner);

  const transferTx = await usdt.transfer(vaultAddress, amountWei);
  const receipt = await transferTx.wait();

  console.log(`✅ USDT returned to vault`);
  console.log(`Transaction: ${receipt?.hash}`);

  return receipt;
}

// Export for use in other scripts
export default {
  getDepositAssets,
  getWithdrawAssets,
  estimateWithdrawFee,
  signWithdrawal,
  submitWithdrawal,
  depositToAster,
  withdrawFromAster,
  returnToVault,
};
