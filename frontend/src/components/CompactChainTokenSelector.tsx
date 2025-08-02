import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import type { ChainTokenPair} from '../types/chains';
import { CHAIN_TOKEN_PAIRS } from '../types/chains';

interface CompactChainTokenSelectorProps {
  selectedPair: ChainTokenPair | null;
  onPairSelect: (pair: ChainTokenPair) => void;
  placeholder: string;
  excludeChainId?: string;
  className?: string;
}

export function CompactChainTokenSelector({
  selectedPair,
  onPairSelect,
  placeholder,
  excludeChainId,
  className
}: CompactChainTokenSelectorProps) {
  const filteredPairs = CHAIN_TOKEN_PAIRS.filter(pair => 
    excludeChainId ? pair.chainId !== excludeChainId : true
  );

  return (
    <Select
      value={selectedPair?.id || ''}
      onValueChange={(pairId) => {
        const pair = filteredPairs.find(p => p.id === pairId);
        if (pair) onPairSelect(pair);
      }}
    >
      <SelectTrigger className={`w-full ${className || ''}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filteredPairs.map((pair) => (
          <SelectItem key={pair.id} value={pair.id}>
            <div className="flex items-center gap-2">
              <img src={pair.chain.icon} alt={pair.chain.name} className="w-4 h-4" />
              <img src={pair.token.icon} alt={pair.token.symbol} className="w-4 h-4" />
              <span>{pair.displayName}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}