import axios from 'axios';

/**
 * Symbiosis API Helper
 *
 * This helper provides functions to interact with the Symbiosis API
 * for getting cross-chain swap quotes and transaction data
 */

const SYMBIOSIS_API_BASE = 'https://api.symbiosis.finance/crosschain/v1';

// Chain IDs
export const CHAIN_IDS = {
  BSC: 56,
  POLYGON: 137,
} as const;

// Token addresses
export const TOKENS = {
  BSC: {
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  },
  POLYGON: {
    USDC: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e
    USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  },
} as const;

export interface SwapRequest {
  tokenAmountIn: {
    chainId: number;
    address: string;
    decimals: number;
    amount: string;
  };
  tokenOut: {
    chainId: number;
    address: string;
    decimals: number;
  };
  to: string; // Recipient address on destination chain
  from: string; // Sender address on source chain
  slippage: number; // Slippage tolerance (e.g., 100 = 1%)
}

export interface SwapResponse {
  transactionRequest: {
    data: string;
    to: string;
    value: string;
    chainId: number;
  };
  approveTo: string;
  tokenAmountOut: {
    amount: string;
    chainId: number;
    address: string;
    decimals: number;
  };
  priceImpact: string;
  fee: {
    address: string;
    amount: string;
    chainId: number;
  };
  route: any[];
}

export interface SwapLimits {
  minAmount: string;
  maxAmount: string;
}

/**
 * Get available chains from Symbiosis
 */
export async function getChains(): Promise<any[]> {
  try {
    const response = await axios.get(`${SYMBIOSIS_API_BASE}/chains`);
    return response.data;
  } catch (error) {
    console.error('Error fetching chains:', error);
    throw error;
  }
}

/**
 * Get swap limits for a token pair
 */
export async function getSwapLimits(
  fromChainId: number,
  fromTokenAddress: string,
  toChainId: number,
  toTokenAddress: string
): Promise<SwapLimits> {
  try {
    const response = await axios.get(`${SYMBIOSIS_API_BASE}/swap-limits`, {
      params: {
        fromChainId,
        fromTokenAddress,
        toChainId,
        toTokenAddress,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching swap limits:', error);
    throw error;
  }
}

/**
 * Get swap transaction data from Symbiosis API
 * This is the main function to get the calldata for cross-chain swaps
 */
export async function getSwapTransaction(
  request: SwapRequest
): Promise<SwapResponse> {
  try {
    const response = await axios.post(`${SYMBIOSIS_API_BASE}/swap`, request);
    return response.data;
  } catch (error) {
    console.error('Error getting swap transaction:', error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Get swap status by transaction hash
 */
export async function getSwapStatus(
  chainId: number,
  txHash: string
): Promise<any> {
  try {
    const response = await axios.get(
      `${SYMBIOSIS_API_BASE}/tx/${chainId}/${txHash}`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching swap status:', error);
    throw error;
  }
}

/**
 * Helper function to get USDT->USDC swap data for Vault deposit
 * @param usdtAmount Amount of USDT to swap (in wei/smallest unit)
 * @param agentWallet Agent wallet address on Polygon to receive USDC
 * @param userAddress User's address on BNB Chain
 * @param slippage Slippage tolerance in basis points (100 = 1%)
 */
export async function getVaultDepositSwapData(
  usdtAmount: string,
  agentWallet: string,
  userAddress: string,
  slippage: number = 100
): Promise<SwapResponse> {
  const swapRequest: SwapRequest = {
    tokenAmountIn: {
      chainId: CHAIN_IDS.BSC,
      address: TOKENS.BSC.USDT,
      decimals: 18,
      amount: usdtAmount,
    },
    tokenOut: {
      chainId: CHAIN_IDS.POLYGON,
      address: TOKENS.POLYGON.USDC,
      decimals: 6,
    },
    to: agentWallet, // USDC goes to agent wallet on Polygon
    from: userAddress, // User on BNB Chain
    slippage: slippage,
  };

  return getSwapTransaction(swapRequest);
}

/**
 * Format amount from human-readable to wei
 */
export function toWei(amount: string, decimals: number): string {
  const [integer, decimal = ''] = amount.split('.');
  const paddedDecimal = decimal.padEnd(decimals, '0');
  return integer + paddedDecimal;
}

/**
 * Format amount from wei to human-readable
 */
export function fromWei(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, '0');
  const integerPart = padded.slice(0, -decimals) || '0';
  const decimalPart = padded.slice(-decimals);
  return `${integerPart}.${decimalPart}`;
}

// Example usage
export async function exampleUsage() {
  try {
    // Get chains
    console.log('Fetching available chains...');
    const chains = await getChains();
    console.log('Available chains:', chains.length);

    // Get swap limits
    console.log('\nFetching swap limits...');
    const limits = await getSwapLimits(
      CHAIN_IDS.BSC,
      TOKENS.BSC.USDT,
      CHAIN_IDS.POLYGON,
      TOKENS.POLYGON.USDC
    );
    console.log('Swap limits:', limits);

    // Get swap transaction for 100 USDT
    console.log('\nGetting swap transaction for 100 USDT...');
    const usdtAmount = toWei('100', 18); // 100 USDT
    const agentWallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'; // Example
    const userAddress = '0x1234567890123456789012345678901234567890'; // Example

    const swapData = await getVaultDepositSwapData(
      usdtAmount,
      agentWallet,
      userAddress,
      100 // 1% slippage
    );

    console.log('Transaction data:', swapData.transactionRequest.data);
    console.log('Required gas fee (BNB):', swapData.transactionRequest.value);
    console.log('Expected USDC output:', fromWei(swapData.tokenAmountOut.amount, 6));
    console.log('Price impact:', swapData.priceImpact);
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run example if called directly
if (require.main === module) {
  exampleUsage();
}
