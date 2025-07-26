// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Script } from "forge-std/Script.sol";

import { IEscrowFactory } from "1inch-cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import { IOrderMixin } from "1inch-limit-order-protocol/contracts/interfaces/IOrderMixin.sol";

import { Resolver } from "../contracts/Resolver.sol";

// solhint-disable no-console
import { console } from "forge-std/console.sol";

contract DeployResolver is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address lop = vm.envAddress("LOP");
        address escrowFactoryAddr = vm.envAddress("ESCROW_FACTORY");

        IEscrowFactory escrowFactory = IEscrowFactory(escrowFactoryAddr);
        IOrderMixin orderMixin = IOrderMixin(lop);

        vm.startBroadcast();
        Resolver resolver = new Resolver(
            escrowFactory,
            orderMixin,
            deployer
        );
        vm.stopBroadcast();

        console.log("Resolver deployed at: ", address(resolver));
    }
}
// solhint-enable no-console
