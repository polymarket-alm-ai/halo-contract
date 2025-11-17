// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @notice Mock USDT token for testing on BNB testnet
 * @dev Mimics USDT with 18 decimals (BNB Chain USDT uses 18 decimals)
 */
contract MockUSDT is ERC20, Ownable {
    uint8 private constant DECIMALS = 18;

    /**
     * @notice Constructor
     * @dev Mints initial supply to deployer
     */
    constructor() ERC20("Mock USDT", "USDT") Ownable(msg.sender) {
        // Mint 1 million USDT to deployer for testing
        _mint(msg.sender, 1_000_000 * 10 ** DECIMALS);
    }

    /**
     * @notice Get token decimals
     * @return Number of decimals (18)
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Mint tokens to an address (only owner)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Faucet function - allows anyone to claim test tokens
     * @dev Mints 10,000 USDT to caller (useful for testing)
     */
    function faucet() external {
        _mint(msg.sender, 10_000 * 10 ** DECIMALS);
    }

    /**
     * @notice Faucet with custom amount
     * @param amount Amount of tokens to mint (in wei)
     */
    function faucetAmount(uint256 amount) external {
        require(amount <= 100_000 * 10 ** DECIMALS, "Max 100k USDT per claim");
        _mint(msg.sender, amount);
    }

    /**
     * @notice Burn tokens from caller
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
