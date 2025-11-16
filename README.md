# Halo Vault - Cross-Chain USDT to USDC Bridge

A smart contract vault on BNB Chain that accepts USDT deposits and automatically swaps them to USDC on Polygon using Symbiosis Finance cross-chain infrastructure. The USDC is delivered directly to a configured agent wallet (EOA) on Polygon.

## 🏗️ Architecture

### Flow Diagram

```
User (BNB Chain)
    |
    | 1. Approve USDT
    | 2. Call deposit() with Symbiosis data + BNB for gas
    v
Vault Contract (BNB Chain)
    |
    | 3. Transfer USDT from user
    | 4. Call Symbiosis MetaRouterGateway.metaRoute()
    v
Symbiosis Protocol
    |
    | 5. Swap USDT -> transit token (if needed)
    | 6. Bridge to Polygon
    | 7. Swap to USDC on Polygon
    v
Agent Wallet (Polygon Chain)
    |
    | 8. Receives USDC
    v
Complete ✅
```

### Key Components

1. **Vault Contract (BNB Chain)** - `contracts/Vault.sol`
   - Accepts USDT deposits from users
   - Integrates with Symbiosis MetaRouterGateway
   - Tracks user deposits
   - Owner-controlled agent wallet configuration

2. **Symbiosis Integration** - `scripts/symbiosisHelper.ts`
   - Helper functions to interact with Symbiosis API
   - Gets swap quotes and transaction data
   - Tracks swap status

3. **Deployment & Scripts**
   - Automated deployment to BNB Chain
   - Example deposit script
   - Swap status checker

## 📋 Prerequisites

- Node.js v18+
- npm or yarn or pnpm
- Private key with BNB for gas
- USDT tokens on BNB Chain
- Agent wallet address on Polygon to receive USDC

## 🚀 Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

## ⚙️ Configuration

Edit `.env` file:

```env
# Your private key (for deployment)
PRIVATE_KEY=your_private_key_here

# RPC endpoints
BSC_RPC=https://bsc-dataseed1.binance.org

# Agent wallet on Polygon (receives USDC)
AGENT_WALLET=0xYourAgentWalletAddressOnPolygon

# API keys for contract verification
BSCSCAN_API_KEY=your_bscscan_api_key
```

## 📦 Deployment

### Deploy to BNB Chain

```bash
# Compile contracts
npm run compile

# Deploy to BSC Mainnet
npm run deploy:bsc

# Deploy to BSC Testnet
npm run deploy:bsc-testnet
```

After deployment, save the Vault address and update your `.env`:

```env
VAULT_ADDRESS=0xYourDeployedVaultAddress
```

### Verify Contract

```bash
npm run verify:bsc
```

## 💰 Usage

### For Users: Depositing USDT

#### Method 1: Using the Example Script

```bash
# Set environment variables
export VAULT_ADDRESS=0xYourVaultAddress
export AGENT_WALLET=0xYourAgentWalletOnPolygon

# Run deposit example (deposits 100 USDT)
npm run deposit
```

#### Method 2: Programmatic Integration

```typescript
import { ethers } from 'ethers';
import { getVaultDepositSwapData } from './scripts/symbiosisHelper';

// 1. Get swap data from Symbiosis API
const depositAmount = ethers.parseEther('100'); // 100 USDT
const swapData = await getVaultDepositSwapData(
  depositAmount.toString(),
  agentWallet,      // Your agent wallet on Polygon
  userAddress,      // User's address on BNB
  100              // 1% slippage
);

// 2. Approve USDT to Vault
const usdt = await ethers.getContractAt('IERC20', usdtAddress);
await usdt.approve(vaultAddress, depositAmount);

// 3. Deposit to Vault
const vault = await ethers.getContractAt('Vault', vaultAddress);
await vault.deposit(
  depositAmount,
  swapData.transactionRequest.data,  // Symbiosis calldata
  { value: swapData.transactionRequest.value }  // Gas fee in BNB
);
```

#### Method 3: Direct Contract Interaction

1. **Get Symbiosis swap data:**
   - Visit: `https://api.symbiosis.finance/crosschain/docs/`
   - Call `/v1/swap` endpoint with:
     ```json
     {
       "tokenAmountIn": {
         "chainId": 56,
         "address": "0x55d398326f99059fF775485246999027B3197955",
         "decimals": 18,
         "amount": "100000000000000000000"
       },
       "tokenOut": {
         "chainId": 137,
         "address": "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
         "decimals": 6
       },
       "to": "YOUR_AGENT_WALLET_ON_POLYGON",
       "from": "YOUR_ADDRESS_ON_BSC",
       "slippage": 100
     }
     ```

2. **Approve USDT:**
   - Call `approve(vaultAddress, amount)` on USDT contract
   - USDT: `0x55d398326f99059fF775485246999027B3197955`

3. **Deposit:**
   - Call `deposit(amount, symbiosisData)` on Vault
   - Send BNB for gas (value from Symbiosis API response)

### Tracking Swap Status

```bash
# Check swap status by transaction hash
export TX_HASH=0xYourTransactionHash
npm run check-status
```

Or visit Symbiosis web app:
```
https://app.symbiosis.finance/swap?fromChain=56&toChain=137&tx=YOUR_TX_HASH
```

### For Admin: Managing the Vault

```javascript
const vault = await ethers.getContractAt('Vault', vaultAddress);

// Update agent wallet
await vault.setAgentWallet('0xNewAgentWallet');

// Update minimum deposit
await vault.setMinDeposit(ethers.parseEther('50')); // 50 USDT

// Emergency withdraw tokens
await vault.emergencyWithdraw(tokenAddress, recipient, amount);

// Emergency withdraw BNB
await vault.emergencyWithdrawNative(recipient, amount);
```

## 📊 Contract Addresses

### BNB Chain Mainnet

| Contract/Token | Address | Description |
|----------------|---------|-------------|
| USDT | `0x55d398326f99059fF775485246999027B3197955` | USDT token on BSC |
| USDC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | USDC token on BSC |
| Symbiosis MetaRouterGateway | `0x5c97D726bf5130AE15408cE32bc764e458320D2f` | Symbiosis gateway |
| Vault | `[After deployment]` | Your deployed Vault |

### Polygon Mainnet

| Contract/Token | Address | Description |
|----------------|---------|-------------|
| USDC.e | `0x2791bca1f2de4661ed88a30c99a7a9449aa84174` | Bridged USDC on Polygon |
| USDT | `0xc2132d05d31c914a87c6611c10748aeb04b58e8f` | USDT on Polygon |
| Symbiosis MetaRouterGateway | `0xAb83653fd41511D638b69229afBf998Eb9B0F30c` | Symbiosis gateway |

## 🔒 Security Features

1. **ReentrancyGuard**: Protects against reentrancy attacks
2. **SafeERC20**: Safe token transfers
3. **Ownable**: Admin functions restricted to owner
4. **Minimum deposit**: Prevents dust attacks
5. **Emergency withdraw**: Owner can recover stuck funds
6. **Approval model**: Vault pre-approves Symbiosis gateway for efficiency

## ⚠️ Important Notes

### Gas Fees

- Users need BNB for the cross-chain swap gas fee
- Gas fee is calculated by Symbiosis API and varies based on:
  - Current gas prices on both chains
  - Swap route complexity
  - Bridge fees
- Typical range: 0.001 - 0.01 BNB

### Slippage

- Default: 1% (100 basis points)
- Increase for larger trades or volatile markets
- Decrease for better rates in stable conditions

### Transaction Time

- Typical: 2-10 minutes
- Depends on:
  - Network congestion
  - Block confirmation requirements
  - Swap route complexity

### Token Decimals

- USDT on BSC: 18 decimals
- USDC on Polygon: 6 decimals
- Handle conversions carefully!

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Integration Testing

1. Deploy to testnet:
```bash
npm run deploy:bsc-testnet
```

2. Get testnet USDT from faucet

3. Test deposit:
```bash
npm run deposit
```

4. Verify USDC arrived on Polygon testnet

## 📚 API Reference

### Vault Contract

#### `deposit(uint256 amount, bytes calldata symbiosisData)`
Deposit USDT and initiate cross-chain swap to USDC on Polygon.

**Parameters:**
- `amount`: Amount of USDT to deposit (in wei, 18 decimals)
- `symbiosisData`: Encoded transaction data from Symbiosis API

**Requires:**
- User approved USDT to Vault
- Sent enough BNB for gas (msg.value)
- Amount >= minDeposit

**Emits:**
- `Deposited(user, amount, timestamp)`
- `CrossChainSwapInitiated(user, amount, agentWallet, txId)`

#### `setAgentWallet(address _newAgentWallet)` (Owner only)
Update the agent wallet address on Polygon.

#### `setMinDeposit(uint256 _newMinDeposit)` (Owner only)
Update minimum deposit amount.

#### `emergencyWithdraw(address token, address to, uint256 amount)` (Owner only)
Emergency withdraw any ERC20 token.

#### `emergencyWithdrawNative(address payable to, uint256 amount)` (Owner only)
Emergency withdraw BNB.

### View Functions

#### `getUserDeposit(address user) → uint256`
Get total deposits for a user.

#### `getUSDTBalance() → uint256`
Get Vault's current USDT balance.

### Symbiosis API Helper

See `scripts/symbiosisHelper.ts` for detailed API helper functions:

- `getChains()`: Get supported chains
- `getSwapLimits()`: Get min/max swap amounts
- `getSwapTransaction()`: Get swap calldata
- `getSwapStatus()`: Check swap progress
- `getVaultDepositSwapData()`: Helper for vault deposits

## 🐛 Troubleshooting

### "Insufficient gas fee" error
- Increase the BNB amount sent with the deposit transaction
- Get fresh quote from Symbiosis API

### "Insufficient amount" error
- Ensure deposit >= minDeposit (default 100 USDT)
- Check your USDT balance

### "Transfer failed" error
- Approve USDT to Vault contract first
- Check you have enough USDT balance

### Swap stuck/pending
- Wait up to 30 minutes
- Check status with Symbiosis API
- Contact Symbiosis support if >1 hour

### USDC not received
- Verify agent wallet address is correct
- Check Polygon explorer for incoming USDC
- Verify swap completed successfully

## 🔗 Links

- [Symbiosis Finance](https://symbiosis.finance/)
- [Symbiosis API Documentation](https://docs.symbiosis.finance/developer-tools/symbiosis-api)
- [Symbiosis Web App](https://app.symbiosis.finance/swap)
- [BSCScan](https://bscscan.com/)
- [PolygonScan](https://polygonscan.com/)

## 📄 License

MIT

## 🤝 Support

For issues and questions:
- Check the troubleshooting section
- Review Symbiosis documentation
- Open an issue in this repository

## ⚡ Quick Start Example

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your keys

# 3. Deploy
npm run deploy:bsc

# 4. Update .env with deployed address
VAULT_ADDRESS=0x...

# 5. Test deposit
npm run deposit

# 6. Check status
TX_HASH=0x... npm run check-status
```

That's it! Your USDT will be swapped to USDC and delivered to your agent wallet on Polygon. 🎉
