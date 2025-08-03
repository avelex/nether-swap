import { useState } from 'react';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Chain } from '../types/chains';
import { CheckCircle, AlertCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface DestinationAddressProps {
  destinationChain: Chain | null;
  address: string;
  onAddressChange: (address: string) => void;
}

export function DestinationAddress({ 
  destinationChain, 
  address, 
  onAddressChange 
}: DestinationAddressProps) {
  const [isValidating, setIsValidating] = useState(false);

  if (!destinationChain) {
    return null;
  }

  // Mock address validation
  const validateAddress = (addr: string): boolean => {
    if (!addr) return false;
    
    if (destinationChain.walletType === 'metamask') {
      // Ethereum-style address validation
      return /^0x[a-fA-F0-9]{40}$/.test(addr);
    } else {
      // Solana/Sui style address validation
      return addr.length >= 32 && addr.length <= 44 && /^[A-Za-z0-9]+$/.test(addr);
    }
  };

  const isValid = validateAddress(address);
  const isEmpty = address.length === 0;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onAddressChange(text.trim());
      toast.success('Address pasted from clipboard');
    } catch (error) {
      toast.error('Failed to paste from clipboard');
    }
  };

  const getPlaceholder = () => {
    if (destinationChain.walletType === 'metamask') {
      return '0x742d35Cc6634C0532925a3b8D8A6aE93cC8A6b7d';
    } else {
      return 'AQHhMhJ7k2QTmvB8cWj9cCF9LnF8AeZ1wDgRzGpTyG5Z';
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Destination Address</span>
        <Badge variant="secondary" className="flex items-center gap-1">
          <img src={destinationChain.icon} alt={destinationChain.name} className="w-4 h-4" />
          <span>{destinationChain.name}</span>
        </Badge>
      </div>
      
      <div className="space-y-2">
        <div className="relative">
          <Input
            placeholder={getPlaceholder()}
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            className={`pr-20 font-mono text-xs ${
              !isEmpty && !isValid ? 'border-destructive' : ''
            } ${!isEmpty && isValid ? 'border-green-500' : ''}`}
          />
          <div className="absolute right-1 top-1 flex items-center gap-1">
            {!isEmpty && (
              <div className="p-1">
                {isValid ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePaste}
              className="h-6 px-2"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        {!isEmpty && !isValid && (
          <p className="text-xs text-destructive">
            Invalid {destinationChain.name} address format
          </p>
        )}
        
        <p className="text-xs text-muted-foreground">
          Enter the {destinationChain.name} address where you want to receive the tokens
        </p>
      </div>
    </Card>
  );
}