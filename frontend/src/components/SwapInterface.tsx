import { useState } from 'react';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import type { Chain, Token } from '../types/chains';
import { ArrowUpDown, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface SwapInterfaceProps {
  fromChain: Chain | null;
  fromToken: Token | null;
  toChain: Chain | null;
  toToken: Token | null;
  destinationAddress: string;
  isWalletConnected: boolean;
  onSwap: () => void;
}

export function SwapInterface({
  fromChain,
  fromToken,
  toChain,
  toToken,
  destinationAddress,
  isWalletConnected,
  onSwap
}: SwapInterfaceProps) {
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);

  // Mock exchange rate calculation
  const calculateToAmount = async (amount: string) => {
    if (!amount || !fromToken || !toToken) return;
    
    setIsCalculating(true);
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock exchange rate (random between 0.95-1.05 for same tokens, or different rates for different tokens)
    const isSameToken = fromToken.symbol === toToken.symbol;
    const exchangeRate = isSameToken 
      ? 0.98 + Math.random() * 0.04  // 0.98-1.02 for same token cross-chain
      : 0.5 + Math.random() * 2;     // 0.5-2.5 for different tokens
    
    const calculatedAmount = (parseFloat(amount) * exchangeRate).toFixed(6);
    setToAmount(calculatedAmount);
    setIsCalculating(false);
  };

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value && parseFloat(value) > 0) {
      calculateToAmount(value);
    } else {
      setToAmount('');
    }
  };

  const canSwap = fromChain && fromToken && toChain && toToken && 
                  fromAmount && parseFloat(fromAmount) > 0 && 
                  isWalletConnected && destinationAddress;

  const isCrossChain = fromChain?.id !== toChain?.id;

  const handleSwap = () => {
    if (canSwap) {
      onSwap();
      toast.success(
        `Swap initiated: ${fromAmount} ${fromToken?.symbol} → ${toAmount} ${toToken?.symbol}`
      );
    }
  };

  const getEstimatedTime = () => {
    if (!isCrossChain) return '~30 seconds';
    return '~2-5 minutes';
  };

  const getFee = () => {
    if (!fromAmount || !fromToken) return '0';
    const feePercent = isCrossChain ? 0.3 : 0.1; // Higher fee for cross-chain
    return (parseFloat(fromAmount) * feePercent / 100).toFixed(6);
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5" />
        <h2>Cross-Chain Swap</h2>
        {isCrossChain && (
          <span className="text-xs bg-gradient-to-r from-blue-500 to-purple-500 text-white px-2 py-1 rounded">
            CROSS-CHAIN
          </span>
        )}
      </div>

      {/* From Amount Input */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-muted-foreground">You Pay</label>
          {fromToken && fromChain && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <img src={fromChain.icon} alt={fromChain.name} className="w-3 h-3" /> {fromToken.symbol}
            </span>
          )}
        </div>
        <Input
          type="number"
          placeholder="0.0"
          value={fromAmount}
          onChange={(e) => handleFromAmountChange(e.target.value)}
          className="text-2xl h-16"
          disabled={!fromToken}
        />
      </div>

      {/* Swap Direction Indicator */}
      <div className="flex justify-center">
        <div className="p-2 border rounded-full bg-background">
          <ArrowUpDown className="h-4 w-4" />
        </div>
      </div>

      {/* To Amount Display */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-muted-foreground">You Receive</label>
          {toToken && toChain && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <img src={toChain.icon} alt={toChain.name} className="w-3 h-3" /> {toToken.symbol}
            </span>
          )}
        </div>
        <div className="relative">
          <Input
            type="number"
            placeholder="0.0"
            value={toAmount}
            readOnly
            className="text-2xl h-16 bg-muted/50"
          />
          {isCalculating && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>
      </div>

      {/* Swap Details */}
      {fromAmount && toAmount && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Estimated Time:</span>
            <span>{getEstimatedTime()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Network Fee:</span>
            <span>{getFee()} {fromToken?.symbol}</span>
          </div>
          {isCrossChain && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bridge Fee:</span>
              <span>0.1%</span>
            </div>
          )}
        </div>
      )}

      {/* Swap Button */}
      <Button 
        onClick={handleSwap}
        disabled={!canSwap}
        className="w-full h-12"
        size="lg"
      >
        {!isWalletConnected 
          ? 'Connect Wallet' 
          : !canSwap 
          ? 'Enter Amount' 
          : `Swap ${fromToken?.symbol || ''} → ${toToken?.symbol || ''}`
        }
      </Button>

      {/* Warnings */}
      {isCrossChain && canSwap && (
        <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded border border-amber-200 dark:border-amber-900">
          ⚠️ Cross-chain swaps may take longer and require multiple confirmations. 
          Double-check your destination address as transactions cannot be reversed.
        </div>
      )}
    </Card>
  );
}