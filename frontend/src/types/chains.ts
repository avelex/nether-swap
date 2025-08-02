export interface Chain {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  walletType: 'metamask' | 'phantom';
  rpcUrl: string;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  chainId: string;
}

export interface ChainTokenPair {
  id: string;
  chainId: string;
  tokenAddress: string;
  displayName: string;
  chain: Chain;
  token: Token;
}

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
    walletType: 'phantom',
    rpcUrl: 'https://fullnode.mainnet.sui.io'
  }
];

export const SUPPORTED_TOKENS: Token[] = [
  // Arbitrum tokens
  {
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    icon: 'assets/icons/usdt.svg',
    chainId: 'arbitrum'
  },
  {
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: 'assets/icons/usdc.svg',
    chainId: 'arbitrum'
  },
  // Sui tokens
  {
    address: '0x2::sui::SUI',
    symbol: 'SUI',
    name: 'Sui',
    decimals: 9,
    icon: 'assets/icons/sui.svg',
    chainId: 'sui'
  },
  {
    address: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: 'assets/icons/usdc.svg',
    chainId: 'sui'
  },
  {
    address: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    icon: 'assets/icons/usdt.svg',
    chainId: 'sui'
  }
];

// Create combined chain-token pairs
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