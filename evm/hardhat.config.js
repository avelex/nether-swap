require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("hardhat-deploy");

module.exports = {
  networks: {
    arbitrum: {
      url: "https://arbitrum-one-rpc.publicnode.com",
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  paths: {
    sources: "./lib/cross-chain-swap/lib/limit-order-protocol/contracts",
    cache: "./lib/cross-chain-swap/lib/limit-order-protocol/cache",
    artifacts: "./lib/cross-chain-swap/lib/limit-order-protocol/artifacts",
  },
  tracer: {
    enableAllOpcodes: true,
  },
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1_000_000,
      },
      viaIR: true,
    },
  },
  gasReporter: {
    enable: true,
    currency: "USD",
  },
  // dependencyCompiler: {
  //   paths: [
  //     "@1inch/solidity-utils/contracts/mocks/TokenCustomDecimalsMock.sol",
  //     "@1inch/solidity-utils/contracts/mocks/TokenMock.sol",
  //     "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol",
  //   ],
  // },
};
