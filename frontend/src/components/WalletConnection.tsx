import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { useWallet } from '../hooks/useWallet';
import type { Chain } from '../types/chains';
import { Wallet, LogOut, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface WalletConnectionProps {
  requiredChain: Chain | null;
}

export function WalletConnection({ requiredChain }: WalletConnectionProps) {
  const { walletState, connectWallet, disconnectWallet, switchChain } = useWallet();

  const handleConnect = async () => {
    if (requiredChain) {
      try {
        await connectWallet(requiredChain);
        toast.success(`Connected to ${requiredChain.name} via ${requiredChain.walletType}`);
      } catch (error: any) {
        console.error('Connection failed:', error);
        toast.error(error.message || 'Failed to connect wallet');
      }
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    toast.info('Wallet disconnected');
  };

  const handleSwitchChain = async () => {
    if (requiredChain) {
      try {
        await switchChain(requiredChain);
        toast.success(`Switched to ${requiredChain.name}`);
      } catch (error: any) {
        console.error('Chain switch failed:', error);
        toast.error(error.message || 'Failed to switch network');
      }
    }
  };

  const copyAddress = () => {
    if (walletState.address) {
      navigator.clipboard.writeText(walletState.address);
      toast.success('Address copied to clipboard');
    }
  };

  const formatAddress = (address: string) => {
    return address;
  };

  if (!requiredChain) {
    return (
      <Card className="p-4">
        <div className="text-center text-muted-foreground">
          <Wallet className="mx-auto h-8 w-8 mb-2" />
          <p>Select a network first</p>
        </div>
      </Card>
    );
  }

  if (!walletState.isConnected) {
    return (
      <Card className="p-4">
        <div className="space-y-4">
          <div className="text-center">
            <Wallet className="mx-auto h-8 w-8 mb-2" />
            <h3>Connect Wallet</h3>
            <p className="text-sm text-muted-foreground">
              Connect your {requiredChain.walletType} wallet to {requiredChain.name}
            </p>
          </div>
          <Button onClick={handleConnect} className="w-full flex items-center gap-2">
            <img 
              src={`assets/icons/${requiredChain.walletType}.svg`} 
              alt={requiredChain.walletType} 
              className="w-5 h-5"
            />
            Connect {requiredChain.walletType === 'metamask' ? 'MetaMask' : 'Phantom'}
          </Button>
        </div>
      </Card>
    );
  }

  const needsChainSwitch = walletState.chain?.id !== requiredChain.id;

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">Connected</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDisconnect}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {walletState.chain && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Network:</span>
            <Badge variant="secondary" className="flex items-center gap-1">
              <img src={walletState.chain.icon} alt={walletState.chain.name} className="w-4 h-4" />
              <span>{walletState.chain.name}</span>
            </Badge>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Address:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">
              {formatAddress(walletState.address!)}
            </span>
            <Button variant="ghost" size="sm" onClick={copyAddress}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Balance:</span>
          <span className="text-sm">
            {walletState.balance} {walletState.chain?.symbol}
          </span>
        </div>

        {needsChainSwitch && (
          <div className="pt-2 border-t">
            <p className="text-sm text-amber-600 mb-2">
              Switch to {requiredChain.name} to continue
            </p>
            <Button onClick={handleSwitchChain} size="sm" className="w-full">
              Switch to {requiredChain.name}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}