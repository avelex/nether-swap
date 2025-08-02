import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Chain } from '../types/chains';

declare global {
  interface Window {
    ethereum?: any;
    suiWallet?: any;
    sui?: any;
    suiet?: any;
    ethos?: any;
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

// Get EVM chain ID for MetaMask network switching
const getChainId = (chainId: string): string => {
  const chainIds: Record<string, string> = {
    arbitrum: '0xa4b1',
    sui: '0x1',
  };
  return chainIds[chainId] || '0x1';
};

// Get MetaMask network configuration for adding/switching chains
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
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No MetaMask accounts found');
      }

      const address = accounts[0];

      // Switch to or add the required EVM network
      const chainId = getChainId(chain.id);
      
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId }],
        });
      } catch (switchError: any) {
        // Chain not found in MetaMask, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [getChainConfig(chain)],
          });
        } else {
          throw switchError;
        }
      }

      // Verify connection to correct EVM network
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      console.log('Current chain ID:', currentChainId, 'Expected:', chainId);
      
      if (currentChainId !== chainId) {
        throw new Error(`Network mismatch. Expected ${chainId}, got ${currentChainId}`);
      }

      // Get ETH balance from current network
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


  const connectSuiWallet = async (chain: Chain) => {
    try {
      console.log('Starting SUI wallet connection...');
      
      // Use wallet standard to detect all compatible SUI wallets
      const wallets = await detectSuiWallets();
      
      if (wallets.length === 0) {
        throw new Error('No SUI wallet found. Please install a SUI wallet extension like Sui Wallet, Suiet, or other compatible wallets and make sure it\'s enabled.');
      }

      console.log('Found wallets:', wallets);

      // Connect to first available SUI wallet
      const selectedWallet = wallets[0];
      
      // Establish connection via wallet standard protocol
      if (!selectedWallet.wallet.features || !selectedWallet.wallet.features['standard:connect']) {
        throw new Error(`${selectedWallet.name} does not support wallet standard connection`);
      }
      
      const connectResult = await selectedWallet.wallet.features['standard:connect'].connect();
      
      if (!connectResult.accounts || connectResult.accounts.length === 0) {
        throw new Error('No accounts available from SUI wallet');
      }
      
      const account = connectResult.accounts[0];
      const address = account.address;

      if (!address) {
        throw new Error('No address returned from wallet connection');
      }

      console.log('Connected to SUI wallet:', selectedWallet.name, 'Address:', address);

      // Mock balance - real SUI balance fetching requires RPC client setup
      const mockBalance = '0.0000';

      setWalletState({
        address,
        balance: mockBalance,
        isConnected: true,
        chain,
      });
    } catch (error) {
      console.error('SUI wallet connection failed:', error);
      throw error;
    }
  };

  const connectWallet = async (chain: Chain) => {
    try {
      if (chain.walletType === 'metamask') {
        await connectMetaMask(chain);
      } else if (chain.walletType === 'sui') {
        await connectSuiWallet(chain);
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
      } else if (chain.walletType === 'sui') {
        await connectSuiWallet(chain);
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

// Comprehensive SUI wallet detection using multiple methods
// Supports wallet standard protocol and legacy wallet injections
export const detectSuiWallets = async (): Promise<any[]> => {
  return new Promise((resolve) => {
    const foundWallets: any[] = [];
    let attempts = 0;
    const maxAttempts = 10;
    
    // Wallet standard registry for receiving wallet registrations
    const GlobalWallet = {
      walletList: [],
      register: (wallet: any) => {
        if (wallet.chains && wallet.chains.some((chain: string) => chain.includes('sui'))) {
          foundWallets.push({ name: wallet.name, wallet: wallet, type: 'standard' });
        }
      }
    };
    
    // Handle wallet standard app-ready events from installed wallets
    const handleWalletReady = (event: any) => {
      if (event.detail && event.detail.walletList && Array.isArray(event.detail.walletList)) {
        event.detail.walletList.forEach((wallet: any) => {
          // Explicitly exclude Phantom wallets
          if (wallet.name && wallet.name.toLowerCase().includes('phantom')) {
            console.log('Filtering out Phantom - only dedicated SUI wallets allowed');
            return;
          }
          
          if (wallet.features && (
            wallet.features['sui:signTransaction'] || 
            wallet.features['sui:signAndExecuteTransaction']
          )) {
            foundWallets.push({ name: wallet.name, wallet: wallet, type: 'event-standard' });
          }
        });
      }
    };
    
    window.addEventListener('wallet-standard:app-ready', handleWalletReady);
    
    // Multi-method wallet discovery process
    const triggerDiscovery = () => {
      try {
        // Trigger wallet standard discovery event
        const readyEvent = new CustomEvent('wallet-standard:app-ready', {
          detail: GlobalWallet
        });
        window.dispatchEvent(readyEvent);
        
        // Check for wallets in global registry
        if ((window as any).wallets && Array.isArray((window as any).wallets)) {
          (window as any).wallets.forEach((wallet: any) => {
            // Explicitly exclude Phantom wallets
            if (wallet.name && wallet.name.toLowerCase().includes('phantom')) {
              console.log('Skipping Phantom from global registry - SUI wallets only');
              return;
            }
            
            if (wallet.features && (
              wallet.features['sui:signTransaction'] || 
              wallet.features['sui:signAndExecuteTransaction']
            )) {
              foundWallets.push({ name: wallet.name || 'SUI Wallet', wallet: wallet, type: 'global' });
            }
          });
        }
        
        // Fallback: Direct detection of wallet window objects
        if (window.suiWallet) {
          // Wrap legacy SUI Wallet in standard interface
          const standardWallet = {
            name: 'Sui Wallet',
            features: {
              'standard:connect': {
                connect: async () => {
                  const result = await window.suiWallet.connect();
                  return { accounts: [{ address: result.address || result }] };
                }
              }
            }
          };
          foundWallets.push({ name: 'Sui Wallet (Legacy)', wallet: standardWallet, type: 'legacy' });
        }
        

        // Detect Suiet wallet with various naming conventions
        const suietProvider = window.suiet || (window as any).Suiet || (window as any).SuietWallet || (window as any).__suiet;
        if (suietProvider) {
          // Wrap legacy Suiet wallet in standard interface
          const standardWallet = {
            name: 'Suiet',
            features: {
              'standard:connect': {
                connect: async () => {
                  const result = await suietProvider.connect();
                  return { accounts: [{ address: result.address || result }] };
                }
              }
            }
          };
          foundWallets.push({ name: 'Suiet (Legacy)', wallet: standardWallet, type: 'legacy' });
          console.log('Found Suiet wallet via legacy detection');
        }
        
      } catch (error) {
        console.error('Wallet discovery error:', error);
      }
      
      attempts++;
      if (foundWallets.length > 0 || attempts >= maxAttempts) {
        window.removeEventListener('wallet-standard:app-ready', handleWalletReady);
        resolve(foundWallets);
      } else {
        // Retry detection until wallets found or max attempts reached
        setTimeout(triggerDiscovery, 200);
      }
    };
    
    // Allow time for wallet extensions to initialize
    setTimeout(triggerDiscovery, 100);
  });
};

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}