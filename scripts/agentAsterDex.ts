import { ethers } from "hardhat";
import {
  depositToAster,
  withdrawFromAster,
  returnToVault,
} from "./asterDexHelper";

/**
 * Agent Aster DEX Operations Script
 *
 * Manages the full cycle of:
 * 1. Withdrawing USDT from vault to agent EOA
 * 2. Depositing to Aster DEX for trading
 * 3. Withdrawing profits back from Aster
 * 4. Returning funds to vault
 */

const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "";
const ASTER_API_KEY = process.env.ASTER_API_KEY || "";
const ASTER_API_SECRET = process.env.ASTER_API_SECRET || "";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; // BNB Chain

async function main() {
  const [agentSigner] = await ethers.getSigners();
  const agentAddress = await agentSigner.getAddress();

  console.log("Agent Aster DEX Manager");
  console.log("=======================\n");
  console.log(`Agent Address: ${agentAddress}`);
  console.log(`Vault Address: ${VAULT_ADDRESS}\n`);

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("Usage:");
    console.log(
      "  npm run agent:aster deposit <amount>  - Deposit USDT to Aster DEX"
    );
    console.log(
      "  npm run agent:aster withdraw <amount> - Withdraw USDT from Aster DEX"
    );
    console.log(
      "  npm run agent:aster return <amount>   - Return USDT from EOA to vault"
    );
    console.log("  npm run agent:aster balance            - Check balances");
    return;
  }

  switch (command) {
    case "deposit": {
      const amount = args[1];
      if (!amount) {
        console.error("Error: Amount required");
        return;
      }

      console.log(`=== Deposit ${amount} USDT to Aster DEX ===\n`);

      // Full flow: Vault → Agent EOA → Aster DEX
      await depositToAster(
        VAULT_ADDRESS,
        amount,
        agentSigner,
        ASTER_API_KEY,
        ASTER_API_SECRET
      );

      console.log("\n✅ Now you can trade on Aster DEX!");
      break;
    }

    case "withdraw": {
      const amount = args[1];
      if (!amount) {
        console.error("Error: Amount required");
        return;
      }

      console.log(`=== Withdraw ${amount} USDT from Aster DEX ===\n`);

      // Withdraw from Aster to agent EOA
      await withdrawFromAster(
        amount,
        agentSigner,
        ASTER_API_KEY,
        ASTER_API_SECRET
      );

      console.log("\n✅ Check agent EOA balance in a few minutes");
      console.log("Then run: npm run agent:aster return <amount>");
      break;
    }

    case "return": {
      const amount = args[1];
      if (!amount) {
        console.error("Error: Amount required");
        return;
      }

      console.log(`=== Return ${amount} USDT to Vault ===\n`);

      // Return from agent EOA to vault
      await returnToVault(VAULT_ADDRESS, amount, agentSigner, USDT_ADDRESS);

      console.log("\n✅ USDT returned to vault");
      console.log("Funds are now available for:");
      console.log("- Bridging to Polygon");
      console.log("- User withdrawals");
      console.log("- Other strategies");
      break;
    }

    case "balance": {
      console.log("=== Checking Balances ===\n");

      // Get vault balance
      const vault = await ethers.getContractAt("HaloVault", VAULT_ADDRESS);
      const vaultBalance = await vault.getVaultBalance();

      // Get agent EOA balance
      const usdt = await ethers.getContractAt("IERC20", USDT_ADDRESS);
      const agentBalance = await usdt.balanceOf(agentAddress);

      console.log(`Vault Balance: ${ethers.formatEther(vaultBalance)} USDT`);
      console.log(
        `Agent EOA Balance: ${ethers.formatEther(agentBalance)} USDT`
      );
      console.log("\nNote: Check Aster DEX balance on their platform");
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log("Run without arguments to see usage");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
