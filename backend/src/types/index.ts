import * as Sdk from '@1inch/cross-chain-sdk';

export interface UserIntent {
  srcChainId: number;
  dstChainId: number;
  userAddress: string;
  tokenAmount: string;
  srcChainAsset: string;
  dstChainAsset: string;
  hashLock: string;
  receiver: string;
}

export interface SwapOrder {
  orderHash: string;
  userIntent: UserIntent;
  signature?: string;
  secret?: string;

  escrowSrcTxHash?: string;
  escrowDstTxHash?: string;
  escrowDstWithdrawTxHash?: string;
  escrowSrcWithdrawTxHash?: string;

  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
}

export interface EvmSwapOrder extends SwapOrder {
  typedData: Sdk.EIP712TypedData;
  order: Sdk.EvmCrossChainOrder;
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
  resolver: string;
  escrowFactory: string;
  limitOrder: string;
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
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ChainError extends Error {
  constructor(
    message: string,
    public chainId?: number
  ) {
    super(message);
    this.name = 'ChainError';
  }
}
