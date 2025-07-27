import { EvmClient } from './EvmClient';
import { SuiClient } from './SuiClient';
import { UserIntent, SwapOrder, SwapError, ResolverConfig } from '../types';
import logger from '../utils/logger';
import { ethers } from 'ethers';

export class EvmResolver {
  private evmClient: EvmClient;
  private suiClient: SuiClient;
  private config: ResolverConfig;

  constructor(
    evmRpcUrl: string,
    evmPrivateKey: string,
    suiRpcUrl: string,
    config: ResolverConfig
  ) {
    this.evmClient = new EvmClient(evmRpcUrl, evmPrivateKey, config.chainId);
    this.suiClient = new SuiClient(suiRpcUrl, 101); // SUI mainnet chain ID
    this.config = config;

    logger.info('EvmResolver initialized', {
      chainId: config.chainId,
      evmAddress: this.evmClient.getAddress(),
      suiAddress: this.suiClient.getAddress(),
    });
  }

  /**
   * Build swap order for cross-chain swap
   */
  public async buildSwapOrder(userIntent: UserIntent): Promise<SwapOrder> {
    try {
      logger.info('Building swap order', { userIntent });

      // Validate user intent
      this.validateUserIntent(userIntent);

      // Generate order hash based on user intent
      const orderHash = await this.generateOrderHash(userIntent);

      // Create swap order
      const swapOrder: Omit<SwapOrder, 'id' | 'createdAt' | 'updatedAt'> = {
        orderHash,
        userIntent,
        status: 'pending' as any,
      };

      logger.info('Swap order built successfully', { orderHash });

      return swapOrder as SwapOrder;
    } catch (error) {
      logger.error('Failed to build swap order', { error, userIntent });
      throw new SwapError('Failed to build swap order', 'BUILD_ORDER_FAILED', { userIntent });
    }
  }

  /**
   * Execute swap order
   */
  public async executeSwapOrder(orderHash: string, signature: string): Promise<string> {
    try {
      logger.info('Executing swap order', { orderHash });

      // Verify signature
      await this.verifySignature(orderHash, signature);

      // Execute the actual swap
      const txHash = await this.performSwap(orderHash);

      logger.info('Swap order executed successfully', { orderHash, txHash });

      return txHash;
    } catch (error) {
      logger.error('Failed to execute swap order', { error, orderHash });
      throw new SwapError('Failed to execute swap order', 'EXECUTE_ORDER_FAILED', { orderHash });
    }
  }

  /**
   * Reveal secret for order completion
   */
  public async revealSecret(orderHash: string, secret: string): Promise<boolean> {
    try {
      logger.info('Revealing secret', { orderHash });

      // Validate secret format
      if (!secret || secret.length < 32) {
        throw new SwapError('Invalid secret format', 'INVALID_SECRET');
      }

      // In a real implementation, this would interact with smart contracts
      // For now, we'll simulate the secret reveal process
      await this.simulateSecretReveal(orderHash, secret);

      logger.info('Secret revealed successfully', { orderHash });

      return true;
    } catch (error) {
      logger.error('Failed to reveal secret', { error, orderHash });
      throw new SwapError('Failed to reveal secret', 'REVEAL_SECRET_FAILED', { orderHash });
    }
  }

  /**
   * Get quote for swap
   */
  public async getSwapQuote(userIntent: UserIntent): Promise<any> {
    try {
      logger.info('Getting swap quote', { userIntent });

      // Mock quote calculation
      const mockQuote = {
        srcAmount: userIntent.amount,
        dstAmount: (parseFloat(userIntent.amount) * 0.95).toString(), // 5% slippage
        estimatedGas: '21000',
        gasPrice: '20000000000', // 20 gwei
        protocols: ['1inch-fusion'],
        priceImpact: '0.05',
      };

      logger.info('Swap quote generated', { quote: mockQuote });

      return mockQuote;
    } catch (error) {
      logger.error('Failed to get swap quote', { error, userIntent });
      throw new SwapError('Failed to get swap quote', 'QUOTE_FAILED', { userIntent });
    }
  }

  /**
   * Validate user intent
   */
  private validateUserIntent(userIntent: UserIntent): void {
    if (!userIntent.srcChainId || !userIntent.dstChainId) {
      throw new SwapError('Source and destination chain IDs are required', 'INVALID_CHAIN_ID');
    }

    if (!userIntent.srcToken || !userIntent.dstToken) {
      throw new SwapError('Source and destination tokens are required', 'INVALID_TOKEN');
    }

    if (!userIntent.amount || parseFloat(userIntent.amount) <= 0) {
      throw new SwapError('Valid amount is required', 'INVALID_AMOUNT');
    }

    if (!userIntent.userAddress || !ethers.isAddress(userIntent.userAddress)) {
      throw new SwapError('Valid user address is required', 'INVALID_ADDRESS');
    }

    if (userIntent.srcChainId !== this.config.chainId) {
      throw new SwapError(`Resolver only supports chain ${this.config.chainId}`, 'UNSUPPORTED_CHAIN');
    }
  }

  /**
   * Generate order hash
   */
  private async generateOrderHash(userIntent: UserIntent): Promise<string> {
    const orderData = JSON.stringify({
      srcChainId: userIntent.srcChainId,
      dstChainId: userIntent.dstChainId,
      srcToken: userIntent.srcToken,
      dstToken: userIntent.dstToken,
      amount: userIntent.amount,
      userAddress: userIntent.userAddress,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substr(2, 9),
    });

    return ethers.keccak256(ethers.toUtf8Bytes(orderData));
  }

  /**
   * Verify signature
   */
  private async verifySignature(orderHash: string, signature: string): Promise<boolean> {
    try {
      // In a real implementation, this would verify the signature against the order hash
      // For now, we'll simulate signature verification
      if (!signature || signature.length < 130) {
        throw new SwapError('Invalid signature format', 'INVALID_SIGNATURE');
      }

      logger.info('Signature verified', { orderHash });
      return true;
    } catch (error) {
      logger.error('Signature verification failed', { error, orderHash });
      throw new SwapError('Signature verification failed', 'SIGNATURE_VERIFICATION_FAILED');
    }
  }

  /**
   * Perform the actual swap
   */
  private async performSwap(orderHash: string): Promise<string> {
    try {
      // Mock swap execution
      // In a real implementation, this would:
      // 1. Lock tokens on source chain
      // 2. Mint/unlock tokens on destination chain
      // 3. Handle cross-chain messaging

      // Simulate transaction on EVM side
      const evmTxHash = await this.evmClient.sendNativeToken(
        '0x742d35cc6634c0532925a3b8d4d1f48c37d79f04', // Mock destination
        '0.01' // Mock amount
      );

      // Simulate transaction on SUI side
      const suiTxHash = await this.suiClient.sendNativeToken(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // Mock destination
        '0.01' // Mock amount
      );

      logger.info('Cross-chain swap performed', {
        orderHash,
        evmTxHash,
        suiTxHash,
      });

      return evmTxHash; // Return primary transaction hash
    } catch (error) {
      logger.error('Swap execution failed', { error, orderHash });
      throw new SwapError('Swap execution failed', 'SWAP_EXECUTION_FAILED');
    }
  }

  /**
   * Simulate secret reveal
   */
  private async simulateSecretReveal(orderHash: string, secret: string): Promise<void> {
    // Mock secret reveal process
    // In a real implementation, this would interact with smart contracts
    await new Promise(resolve => setTimeout(resolve, 1000));

    logger.info('Secret reveal simulated', { orderHash, secretLength: secret.length });
  }

  /**
   * Get supported chains
   */
  public getSupportedChains(): number[] {
    return [this.config.chainId, 101]; // EVM chain and SUI
  }

  /**
   * Get EVM client
   */
  public getEvmClient(): EvmClient {
    return this.evmClient;
  }

  /**
   * Get SUI client
   */
  public getSuiClient(): SuiClient {
    return this.suiClient;
  }

  /**
   * Get resolver config
   */
  public getConfig(): ResolverConfig {
    return this.config;
  }
} 