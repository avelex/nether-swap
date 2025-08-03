import { useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Badge } from './ui/badge';
import { SUPPORTED_CHAINS, SUPPORTED_TOKENS } from '../types/chains';
import type { Chain, Token } from '../types/chains';
import { ChevronDown } from 'lucide-react';

interface ChainTokenSelectorProps {
  selectedChain: Chain | null;
  selectedToken: Token | null;
  onChainSelect: (chain: Chain) => void;
  onTokenSelect: (token: Token) => void;
  label: string;
}

export function ChainTokenSelector({
  selectedChain,
  selectedToken,
  onChainSelect,
  onTokenSelect,
  label
}: ChainTokenSelectorProps) {
  const availableTokens = selectedChain 
    ? SUPPORTED_TOKENS.filter(token => token.chainId === selectedChain.id)
    : [];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {selectedChain && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <img src={selectedChain.icon} alt={selectedChain.name} className="w-4 h-4" />
            <span>{selectedChain.name}</span>
          </Badge>
        )}
      </div>
      
      <div className="space-y-3">
        {/* Chain Selection */}
        <div>
          <label className="text-sm mb-2 block">Network</label>
          <Select
            value={selectedChain?.id || ''}
            onValueChange={(chainId) => {
              const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
              if (chain) onChainSelect(chain);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select network" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CHAINS.map((chain) => (
                <SelectItem key={chain.id} value={chain.id}>
                  <div className="flex items-center gap-2">
                    <img src={chain.icon} alt={chain.name} className="w-4 h-4" />
                    <span>{chain.name}</span>
                    <Badge variant="outline" className="ml-auto">
                      {chain.walletType}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Token Selection */}
        {selectedChain && (
          <div>
            <label className="text-sm mb-2 block">Token</label>
            <Select
              value={selectedToken?.address || ''}
              onValueChange={(tokenAddress) => {
                const token = availableTokens.find(t => t.address === tokenAddress);
                if (token) onTokenSelect(token);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select token" />
              </SelectTrigger>
              <SelectContent>
                {availableTokens.map((token) => (
                  <SelectItem key={token.address} value={token.address}>
                    <div className="flex items-center gap-2">
                      <img src={token.icon} alt={token.symbol} className="w-4 h-4" />
                      <span>{token.symbol}</span>
                      <span className="text-muted-foreground text-xs">{token.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </Card>
  );
}