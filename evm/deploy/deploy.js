const hre = require('hardhat');
const { getChainId, network } = hre;

const wethByNetwork = {
    sepolia: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
    arbitrumsepolia: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    base: '0x4200000000000000000000000000000000000006',
    arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('Running deploy script');
    console.log('Network ID', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const limitOrderProtocol = await deploy('LimitOrderProtocol', {
        from: deployer,
        args: [wethByNetwork[network.name]],
    });

    console.log('LimitOrderProtocol deployed to:', limitOrderProtocol.address);
};
