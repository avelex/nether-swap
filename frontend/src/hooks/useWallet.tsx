import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Chain } from '../types/chains';

declare global {
  interface Window {
    ethereum?: any;
    phantom?: any;
    solana?: any;
  }
}

interface WalletState {
  address: string | null;
  balance: string;
  isConnected: boolean;
  chain: Chain | null;
}

interface WalletContextType {
  walletState: WalletState;
  connectWallet: (chain: Chain) => Promise<void>;
  disconnectWallet: () => void;
  switchChain: (chain: Chain) => Promise<void>;
  resetConnection: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Helper functions for MetaMask network configuration
const getChainId = (chainId: string): string => {
  const chainIds: Record<string, string> = {
    arbitrum: '0xa4b1', // 42161
    sui: '0x1', // Sui doesn't use MetaMask, but keeping for consistency
  };
  return chainIds[chainId] || '0x1';
};

const getChainConfig = (chain: Chain) => {
  const configs: Record<string, any> = {
    arbitrum: {
      chainId: '0xa4b1',
      chainName: 'Arbitrum One',
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: [
        'https://arbitrum-one-rpc.publicnode.com',
        'https://arb1.arbitrum.io/rpc', 
        'https://arbitrum.blockpi.network/v1/rpc/public',
        'https://arbitrum.drpc.org'
      ],
      blockExplorerUrls: ['https://arbiscan.io/'],
    },
  };
  return configs[chain.id];
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    balance: '0',
    isConnected: false,
    chain: null
  });

  const connectMetaMask = async (chain: Chain) => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No MetaMask accounts found');
      }

      const address = accounts[0];

      // Add/switch to the required network
      const chainId = getChainId(chain.id);
      
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId }],
        });
      } catch (switchError: any) {
        // If chain doesn't exist, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [getChainConfig(chain)],
          });
        } else {
          throw switchError;
        }
      }

      // Verify we're connected to the correct network
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      console.log('Current chain ID:', currentChainId, 'Expected:', chainId);
      
      if (currentChainId !== chainId) {
        throw new Error(`Network mismatch. Expected ${chainId}, got ${currentChainId}`);
      }

      // Get balance
      const balance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });

      const balanceInEth = (parseInt(balance, 16) / Math.pow(10, 18)).toFixed(4);

      setWalletState({
        address,
        balance: balanceInEth,
        isConnected: true,
        chain,
      });
    } catch (error) {
      console.error('MetaMask connection failed:', error);
      throw error;
    }
  };

  const connectPhantom = async (chain: Chain) => {
    if (!window.phantom && !window.solana) {
      throw new Error('Phantom wallet is not installed');
    }

    try {
      let address: string;
      
      // For Sui chains, use Phantom's Sui API
      if (chain.id === 'sui') {
        if (window.phantom && window.phantom.sui) {
          const suiResponse = await window.phantom.sui.requestAccount();
          address = suiResponse.address || suiResponse.account || suiResponse;
        } else {
          throw new Error('Sui support not available in Phantom wallet. Please ensure Sui is enabled in Phantom settings.');
        }
      } else {
        // For non-Sui chains, use Solana API
        if (window.phantom && window.phantom.solana) {
          const response = await window.phantom.solana.connect();
          address = response.publicKey.toString();
        } else if (window.solana && window.solana.isPhantom) {
          const response = await window.solana.connect();
          address = response.publicKey.toString();
        } else {
          throw new Error('Phantom wallet connection not available');
        }
      }

      // For Phantom, we'll mock the balance for now since getting real Solana/Sui balance requires additional setup
      const mockBalance = '0.0000';

      setWalletState({
        address,
        balance: mockBalance,
        isConnected: true,
        chain,
      });
    } catch (error) {
      console.error('Phantom connection failed:', error);
      throw error;
    }
  };

  const connectWallet = async (chain: Chain) => {
    try {
      if (chain.walletType === 'metamask') {
        await connectMetaMask(chain);
      } else if (chain.walletType === 'phantom') {
        await connectPhantom(chain);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setWalletState({
      address: null,
      balance: '0',
      isConnected: false,
      chain: null
    });
  };

  const resetConnection = () => {
    setWalletState({
      address: null,
      balance: '0',
      isConnected: false,
      chain: null
    });
  };

  const switchChain = async (chain: Chain) => {
    if (!walletState.isConnected) {
      throw new Error('No wallet connected');
    }

    try {
      if (chain.walletType === 'metamask') {
        await connectMetaMask(chain);
      } else if (chain.walletType === 'phantom') {
        await connectPhantom(chain);
      }
    } catch (error) {
      console.error('Failed to switch chain:', error);
      throw error;
    }
  };

  return (
    <WalletContext.Provider value={{
      walletState,
      connectWallet,
      disconnectWallet,
      switchChain,
      resetConnection
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}