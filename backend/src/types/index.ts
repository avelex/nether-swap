export interface UserIntent {
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  amount: string;
  userAddress: string;
  dstAddress?: string;
  slippage?: number;
  deadline?: number;
}

export interface SwapOrder {
  id: string;
  orderHash: string;
  userIntent: UserIntent;
  status: SwapOrderStatus;
  signature?: string;
  secret?: string;
  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
  txHash?: string;
  errorMessage?: string;
}

export enum SwapOrderStatus {
  PENDING = 'pending',
  SIGNED = 'signed',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface BuildSwapOrderRequest {
  userIntent: UserIntent;
}

export interface BuildSwapOrderResponse {
  order: SwapOrder;
  orderHash: string;
}

export interface ExecuteSwapOrderRequest {
  orderHash: string;
  signature: string;
}

export interface ExecuteSwapOrderResponse {
  success: boolean;
  txHash?: string;
  message?: string;
}

export interface RevealSecretRequest {
  orderHash: string;
  secret: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface SwapQuote {
  srcAmount: string;
  dstAmount: string;
  gas: string;
  gasPrice: string;
  protocols: any[];
}

export interface ResolverConfig {
  chainId: number;
}

// Error types
export class SwapError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SwapError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ChainError extends Error {
  constructor(message: string, public chainId?: number) {
    super(message);
    this.name = 'ChainError';
  }
} 