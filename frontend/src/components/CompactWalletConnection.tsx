import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useWallet } from "../hooks/useWallet";
import type { ChainTokenPair } from "../types/chains";
import { Wallet, LogOut } from "lucide-react";
import { toast } from "sonner";

interface CompactWalletConnectionProps {
  requiredPair: ChainTokenPair | null;
  className?: string;
}

export function CompactWalletConnection({
  requiredPair,
  className,
}: CompactWalletConnectionProps) {
  const { walletState, connectWallet, disconnectWallet } =
    useWallet();

  const handleConnect = async () => {
    if (requiredPair) {
      await connectWallet(requiredPair.chain);
      toast.success(`Connected to ${requiredPair.chain.name}`);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    toast.info("Wallet disconnected");
  };

  const formatAddress = (address: string) => {
    return address;
  };

  if (!requiredPair) {
    return (
      <div className="h-9 flex items-center text-xs text-muted-foreground">
        Select network first
      </div>
    );
  }

  if (!walletState.isConnected) {
    return (
      <Button onClick={handleConnect} className={`w-full h-9 ${className || ''}`} variant="outline">
        <Wallet className="h-3 w-3 mr-1" />
        Connect{" "}
        {requiredPair.chain.walletType === "metamask"
          ? "MetaMask"
          : "SUI Wallet"}
      </Button>
    );
  }

  const needsChainSwitch =
    walletState.chain?.id !== requiredPair.chain.id;

  if (needsChainSwitch) {
    return (
      <Button
        onClick={handleConnect}
        className={`w-full h-9 ${className || ''}`}
        variant="outline"
      >
        Switch to {requiredPair.chain.name}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 h-9">
      <Badge variant="secondary" className="text-xs px-2 py-1">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></div>
        {formatAddress(walletState.address!)}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {parseFloat(walletState.balance).toFixed(4)}{" "}
        {walletState.chain?.symbol}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDisconnect}
        className="h-6 w-6 p-0"
      >
        <LogOut className="h-3 w-3" />
      </Button>
    </div>
  );
}