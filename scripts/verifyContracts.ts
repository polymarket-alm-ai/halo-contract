import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Verify deployed contracts on BSCScan
 *
 * This script reads deployment info and verifies contracts automatically
 */
async function main() {
  const network = process.env.HARDHAT_NETWORK || "bsc-testnet";
  const isMainnet = network === "bsc";

  console.log(`\nVerifying contracts on ${network}...`);

  if (isMainnet) {
    console.log("⚠️  MAINNET VERIFICATION - Please ensure contracts are deployed correctly");
  }

  const deploymentsPath = path.join(
    __dirname,
    "..",
    "deployments",
    network
  );

  if (!fs.existsSync(deploymentsPath)) {
    console.error(`❌ No deployments found for network: ${network}`);
    console.log(`   Looking in: ${deploymentsPath}`);
    console.log(
      `\n   Please deploy contracts first using: npm run deploy:${network === "bsc-testnet" ? "bsc-testnet" : "vault-erc4626"}`
    );
    process.exit(1);
  }

  // Verify MockUSDT if exists
  const mockUSDTPath = path.join(deploymentsPath, "MockUSDT.json");
  if (fs.existsSync(mockUSDTPath)) {
    try {
      const mockUSDT = JSON.parse(fs.readFileSync(mockUSDTPath, "utf8"));
      console.log(`\n📝 Verifying MockUSDT at ${mockUSDT.address}...`);

      await run("verify:verify", {
        address: mockUSDT.address,
        constructorArguments: mockUSDT.args || [],
      });

      console.log(`✅ MockUSDT verified successfully`);
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log(`✅ MockUSDT already verified`);
      } else {
        console.error(`❌ MockUSDT verification failed:`, error.message);
      }
    }
  }

  // Verify HaloVault
  const vaultPath = path.join(deploymentsPath, "HaloVault.json");
  if (fs.existsSync(vaultPath)) {
    try {
      const vault = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
      console.log(`\n📝 Verifying HaloVault at ${vault.address}...`);

      await run("verify:verify", {
        address: vault.address,
        constructorArguments: vault.args || [],
      });

      console.log(`✅ HaloVault verified successfully`);
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log(`✅ HaloVault already verified`);
      } else {
        console.error(`❌ HaloVault verification failed:`, error.message);
      }
    }
  } else {
    console.error(`❌ HaloVault deployment not found`);
    console.log(`   Looking for: ${vaultPath}`);
  }

  console.log(`\n✅ Verification process complete!`);
  console.log(
    `\nView contracts on BSCScan ${network === "bsc-testnet" ? "Testnet" : ""}:`
  );

  if (fs.existsSync(mockUSDTPath)) {
    const mockUSDT = JSON.parse(fs.readFileSync(mockUSDTPath, "utf8"));
    const baseUrl =
      network === "bsc-testnet"
        ? "https://testnet.bscscan.com"
        : "https://bscscan.com";
    console.log(`MockUSDT: ${baseUrl}/address/${mockUSDT.address}#code`);
  }

  if (fs.existsSync(vaultPath)) {
    const vault = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
    const baseUrl =
      network === "bsc-testnet"
        ? "https://testnet.bscscan.com"
        : "https://bscscan.com";
    console.log(`HaloVault: ${baseUrl}/address/${vault.address}#code`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
