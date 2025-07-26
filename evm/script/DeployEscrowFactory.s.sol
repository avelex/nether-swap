// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Script } from "forge-std/Script.sol";

import { IERC20 } from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import { EscrowFactory } from "1inch-cross-chain-swap/contracts/EscrowFactory.sol";

// solhint-disable no-console
import { console } from "forge-std/console.sol";

contract DeployEscrowFactory is Script {
    uint32 public constant RESCUE_DELAY = 691200; // 8 days
    bytes32 public constant CROSSCHAIN_SALT = keccak256("1inch EscrowFactory");
    
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address lop = vm.envAddress("LOP");
        address accessTokenAddr = vm.envAddress("ACCESS_TOKEN");
        address feeTokenAddr = vm.envAddress("FEE_TOKEN");

        address feeBankOwner = deployer;

        IERC20 accessToken = IERC20(accessTokenAddr);
        IERC20 feeToken = IERC20(feeTokenAddr);

        vm.startBroadcast();
        EscrowFactory escrowFactory = new EscrowFactory(
            lop,
            feeToken,
            accessToken,
            feeBankOwner,
            RESCUE_DELAY,
            RESCUE_DELAY
        );
        vm.stopBroadcast();

        console.log("Escrow Factory deployed at: ", address(escrowFactory));
    }
}
// solhint-enable no-console
