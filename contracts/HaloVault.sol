// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title IMetaRouterGateway
 * @notice Interface for Symbiosis MetaRouterGateway contract
 */
interface IMetaRouterGateway {
    function metaRoute(bytes calldata _metaRouteTransaction) external payable;
}

/**
 * @title HaloVault
 * @notice ERC4626 vault with separate deposit and bridge operations
 * @dev Users deposit USDT and receive shares immediately
 *      Agent decides when/how much to bridge to Polygon for deployment
 *      This allows keeping portion on BNB Chain for DEX trading/strategies
 */
contract HaloVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // Symbiosis MetaRouterGateway on BNB Chain
    IMetaRouterGateway public immutable symbiosisGateway;

    // Agent wallet that receives USDC on Polygon
    address public agentWallet;

    // Agent address (can trigger bridges and strategies)
    address public agent;

    // Oracle/valuer service authorized to update total assets
    address public valuer;

    // Total assets under management (updated by valuer)
    // Includes:
    // - USDT in this vault (on BNB Chain)
    // - USDC in agent wallet (on Polygon)
    // - USDC in Gnosis Safe (on Polygon)
    // - Value of Polymarket positions
    // - Any other assets
    // All normalized to USDT decimals (18)
    uint256 private _totalAssets;

    // Timestamp of last valuation update
    uint256 public lastValuationUpdate;

    // Maximum time between valuation updates
    uint256 public maxValuationAge;

    // Minimum deposit amount
    uint256 public minDeposit;

    // Flag to enable/disable deposits
    bool public depositsEnabled;

    // Flag to enable/disable withdrawals
    bool public withdrawalsEnabled;

    // Total amount bridged to Polygon (for tracking)
    uint256 public totalBridged;

    // Events
    event Deposited(
        address indexed sender,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event Withdrawn(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event BridgeInitiated(
        uint256 indexed amount,
        address indexed agentWallet,
        bytes32 txId,
        uint256 timestamp
    );

    event TotalAssetsUpdated(
        uint256 oldTotal,
        uint256 newTotal,
        uint256 timestamp,
        address indexed updatedBy
    );

    event AgentWalletUpdated(
        address indexed oldAgent,
        address indexed newAgent
    );
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event ValuerUpdated(address indexed oldValuer, address indexed newValuer);
    event DepositsToggled(bool enabled);
    event WithdrawalsToggled(bool enabled);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientAmount();
    error InsufficientGasFee();
    error InsufficientVaultBalance();
    error DepositsDisabled();
    error WithdrawalsDisabled();
    error UnauthorizedValuer();
    error UnauthorizedAgent();
    error StaleValuation();
    error ExceedsAvailableAssets();

    /**
     * @notice Constructor
     * @param _asset USDT token address on BNB Chain
     * @param _symbiosisGateway Symbiosis MetaRouterGateway address
     * @param _agentWallet Agent wallet address on Polygon (receives USDC)
     * @param _agent Agent address on BNB Chain (can trigger bridges)
     * @param _valuer Address authorized to update total assets
     * @param _minDeposit Minimum deposit amount
     * @param _maxValuationAge Maximum age of valuation in seconds
     */
    constructor(
        IERC20 _asset,
        IMetaRouterGateway _symbiosisGateway,
        address _agentWallet,
        address _agent,
        address _valuer,
        uint256 _minDeposit,
        uint256 _maxValuationAge
    ) ERC4626(_asset) ERC20("Halo Vault Shares", "hvUSDT") Ownable(msg.sender) {
        if (address(_symbiosisGateway) == address(0)) revert ZeroAddress();
        if (_agentWallet == address(0)) revert ZeroAddress();
        if (_agent == address(0)) revert ZeroAddress();
        if (_valuer == address(0)) revert ZeroAddress();

        symbiosisGateway = _symbiosisGateway;
        agentWallet = _agentWallet;
        agent = _agent;
        valuer = _valuer;
        minDeposit = _minDeposit;
        maxValuationAge = _maxValuationAge;

        depositsEnabled = true;
        withdrawalsEnabled = false;

        // Approve Symbiosis Gateway to spend USDT
        IERC20(_asset).approve(address(_symbiosisGateway), type(uint256).max);
    }

    /**
     * @notice Get total assets under management
     * @dev Overrides ERC4626 to return oracle value
     */
    function totalAssets() public view virtual override returns (uint256) {
        return _totalAssets;
    }

    /**
     * @notice Update total assets (only valuer)
     * @param newTotal New total assets value in USDT (18 decimals)
     */
    function updateTotalAssets(uint256 newTotal) external {
        if (msg.sender != valuer) revert UnauthorizedValuer();

        uint256 oldTotal = _totalAssets;
        _totalAssets = newTotal;
        lastValuationUpdate = block.timestamp;

        emit TotalAssetsUpdated(
            oldTotal,
            newTotal,
            block.timestamp,
            msg.sender
        );
    }

    /**
     * @notice Check if valuation is fresh
     */
    function isValuationFresh() public view returns (bool) {
        if (lastValuationUpdate == 0) return false;
        return block.timestamp - lastValuationUpdate <= maxValuationAge;
    }

    /**
     * @notice Get vault's USDT balance on BNB Chain
     * @return Available USDT in vault
     */
    function getVaultBalance() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    // ============ Deposit Functions (Users) ============

    /**
     * @notice Deposit USDT and receive vault shares
     * @dev Does NOT automatically bridge - agent decides when to bridge
     * @param assets Amount of USDT to deposit
     * @param receiver Address to receive shares
     * @return shares Amount of shares minted
     */
    function deposit(
        uint256 assets,
        address receiver
    ) public virtual override nonReentrant returns (uint256 shares) {
        if (!depositsEnabled) revert DepositsDisabled();
        if (assets < minDeposit) revert InsufficientAmount();
        if (!isValuationFresh()) revert StaleValuation();

        shares = previewDeposit(assets);

        SafeERC20.safeTransferFrom(
            IERC20(asset()),
            msg.sender,
            address(this),
            assets
        );
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
        emit Deposited(msg.sender, receiver, assets, shares);
    }

    /**
     * @notice Mint specific amount of shares
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets deposited
     */
    function mint(
        uint256 shares,
        address receiver
    ) public virtual override nonReentrant returns (uint256 assets) {
        if (!depositsEnabled) revert DepositsDisabled();
        if (!isValuationFresh()) revert StaleValuation();

        assets = previewMint(shares);
        if (assets < minDeposit) revert InsufficientAmount();

        SafeERC20.safeTransferFrom(
            IERC20(asset()),
            msg.sender,
            address(this),
            assets
        );
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
        emit Deposited(msg.sender, receiver, assets, shares);
    }

    // ============ Withdrawal Functions (Users) ============

    /**
     * @notice Withdraw assets by burning shares
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive assets
     * @param owner Owner of shares
     * @return shares Amount of shares burned
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override nonReentrant returns (uint256 shares) {
        if (!withdrawalsEnabled) revert WithdrawalsDisabled();
        if (!isValuationFresh()) revert StaleValuation();

        uint256 availableAssets = IERC20(asset()).balanceOf(address(this));
        if (assets > availableAssets) revert ExceedsAvailableAssets();

        shares = super.withdraw(assets, receiver, owner);

        emit Withdrawn(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @notice Redeem shares for assets
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Owner of shares
     * @return assets Amount of assets withdrawn
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override nonReentrant returns (uint256 assets) {
        if (!withdrawalsEnabled) revert WithdrawalsDisabled();
        if (!isValuationFresh()) revert StaleValuation();

        assets = previewRedeem(shares);
        uint256 availableAssets = IERC20(asset()).balanceOf(address(this));
        if (assets > availableAssets) revert ExceedsAvailableAssets();

        assets = super.redeem(shares, receiver, owner);

        emit Withdrawn(msg.sender, receiver, owner, assets, shares);
    }

    // ============ Bridge Functions (Agent Only) ============

    /**
     * @notice Bridge USDT to Polygon via Symbiosis (agent only)
     * @dev Agent decides how much to bridge vs keep on BNB Chain
     * @param amount Amount of USDT to bridge
     * @param symbiosisData Encoded transaction data from Symbiosis API
     */
    function bridgeToPolygon(
        uint256 amount,
        bytes calldata symbiosisData
    ) external payable nonReentrant {
        if (msg.sender != agent && msg.sender != owner())
            revert UnauthorizedAgent();
        if (amount == 0) revert ZeroAmount();
        if (msg.value == 0) revert InsufficientGasFee();

        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        if (amount > vaultBalance) revert InsufficientVaultBalance();

        bytes32 txId = keccak256(
            abi.encodePacked(msg.sender, amount, block.timestamp, block.number)
        );

        // Execute cross-chain swap via Symbiosis
        symbiosisGateway.metaRoute{value: msg.value}(symbiosisData);

        totalBridged += amount;

        emit BridgeInitiated(amount, agentWallet, txId, block.timestamp);
    }

    /**
     * @notice Withdraw USDT to agent EOA for trading (agent only)
     * @dev Agent needs USDT in their wallet for Aster DEX trading
     * @param amount Amount of USDT to withdraw to agent EOA
     * @param recipient Recipient address (typically agent's EOA)
     */
    function withdrawToAgent(
        uint256 amount,
        address recipient
    ) external nonReentrant {
        if (msg.sender != agent && msg.sender != owner())
            revert UnauthorizedAgent();
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        if (amount > vaultBalance) revert InsufficientVaultBalance();

        // Transfer USDT to agent EOA
        SafeERC20.safeTransfer(IERC20(asset()), recipient, amount);

        emit AgentWithdrawal(recipient, amount, block.timestamp);
    }

    event AgentWithdrawal(
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @notice Get quote for bridging amount
     * @dev Helper to estimate gas needed (call via staticcall off-chain)
     */
    function getBridgeableAmount() external view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    // ============ Strategy Functions (Agent Only) ============

    /**
     * @notice Execute strategy on BNB Chain (agent only)
     * @dev Allows agent to use vault USDT for DEX trades, etc.
     * @param target Contract to call
     * @param data Calldata to execute
     * @param value Native token amount to send
     */
    function executeStrategy(
        address target,
        bytes calldata data,
        uint256 value
    ) external payable nonReentrant {
        if (msg.sender != agent && msg.sender != owner())
            revert UnauthorizedAgent();
        if (target == address(0)) revert ZeroAddress();

        // Execute arbitrary call
        (bool success, bytes memory returnData) = target.call{value: value}(
            data
        );
        require(success, string(returnData));
    }

    /**
     * @notice Approve token for strategy use (agent only)
     * @param token Token to approve
     * @param spender Spender address (e.g., DEX router)
     * @param amount Amount to approve
     */
    function approveToken(
        address token,
        address spender,
        uint256 amount
    ) external {
        if (msg.sender != agent && msg.sender != owner())
            revert UnauthorizedAgent();
        IERC20(token).approve(spender, amount);
    }

    // ============ Admin Functions ============

    function setAgentWallet(address _newAgentWallet) external onlyOwner {
        if (_newAgentWallet == address(0)) revert ZeroAddress();
        address oldAgent = agentWallet;
        agentWallet = _newAgentWallet;
        emit AgentWalletUpdated(oldAgent, _newAgentWallet);
    }

    function setAgent(address _newAgent) external onlyOwner {
        if (_newAgent == address(0)) revert ZeroAddress();
        address oldAgent = agent;
        agent = _newAgent;
        emit AgentUpdated(oldAgent, _newAgent);
    }

    function setValuer(address _newValuer) external onlyOwner {
        if (_newValuer == address(0)) revert ZeroAddress();
        address oldValuer = valuer;
        valuer = _newValuer;
        emit ValuerUpdated(oldValuer, _newValuer);
    }

    function setMinDeposit(uint256 _newMinDeposit) external onlyOwner {
        minDeposit = _newMinDeposit;
    }

    function setMaxValuationAge(uint256 _newMaxAge) external onlyOwner {
        maxValuationAge = _newMaxAge;
    }

    function setDepositsEnabled(bool enabled) external onlyOwner {
        depositsEnabled = enabled;
        emit DepositsToggled(enabled);
    }

    function setWithdrawalsEnabled(bool enabled) external onlyOwner {
        withdrawalsEnabled = enabled;
        emit WithdrawalsToggled(enabled);
    }

    /**
     * @notice Emergency withdraw tokens (only owner)
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Emergency withdraw native token
     */
    function emergencyWithdrawNative(
        address payable to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {}
}
