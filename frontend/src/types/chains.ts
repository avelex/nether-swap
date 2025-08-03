// Blockchain network configuration
export interface Chain {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  walletType: 'metamask' | 'sui'; // Wallet integration type
  rpcUrl: string;
}

// Token configuration for supported assets
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  chainId: string;
}

// Combined chain and token pairing for UI selection
export interface ChainTokenPair {
  id: string;
  chainId: string;
  tokenAddress: string;
  displayName: string;
  chain: Chain;
  token: Token;
}

// Supported blockchain networks
export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    symbol: 'ETH',
    icon: 'assets/icons/arbitrum.svg',
    walletType: 'metamask',
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com'
  },
  {
    id: 'sui',
    name: 'Sui',
    symbol: 'SUI',
    icon: 'assets/icons/sui.svg',
    walletType: 'sui',
    rpcUrl: 'https://fullnode.mainnet.sui.io'
  }
];

// Available tokens across all supported chains
export const SUPPORTED_TOKENS: Token[] = [
  // EVM tokens on Arbitrum
  {
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: 'assets/icons/usdc.svg',
    chainId: 'arbitrum'
  },
  // Native and wrapped tokens on Sui
  {
    address: '0x2::sui::SUI',
    symbol: 'SUI',
    name: 'Sui',
    decimals: 9,
    icon: 'assets/icons/sui.svg',
    chainId: 'sui'
  },
  {
    address: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: 'assets/icons/usdc.svg',
    chainId: 'sui'
  }
];

// Generate selectable chain-token combinations for the UI
export const CHAIN_TOKEN_PAIRS: ChainTokenPair[] = SUPPORTED_TOKENS.map(token => {
  const chain = SUPPORTED_CHAINS.find(c => c.id === token.chainId)!;
  return {
    id: `${chain.id}-${token.symbol}`,
    chainId: chain.id,
    tokenAddress: token.address,
    displayName: `${chain.name}: ${token.symbol}`,
    chain,
    token
  };
});