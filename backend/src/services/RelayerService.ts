import { EvmResolver } from './EvmResolver';
import { SwapOrderService } from './SwapOrderService';
import { UserIntent, SwapOrder, SwapError, SwapOrderStatus, ResolverConfig } from '../types';
import logger from '../utils/logger';

export default class RelayerService {
  private resolvers: Map<number, EvmResolver> = new Map();
  private swapOrderService: SwapOrderService;

  constructor(swapOrderService: SwapOrderService) {
    this.swapOrderService = swapOrderService;
    logger.info('RelayerService initialized');
  }

  /**
   * Add resolver for a specific chain
   */
  public addResolver(chainId: number, resolver: EvmResolver): void {
    this.resolvers.set(chainId, resolver);
    logger.info('Resolver added', { chainId, supportedChains: resolver.getSupportedChains() });
  }

  /**
   * Build swap order using appropriate resolver
   */
  public async buildSwapOrder(userIntent: UserIntent): Promise<{ order: SwapOrder; orderHash: string }> {
    try {
      logger.info('Building swap order via relayer', { userIntent });

      // Get resolver for source chain
      const resolver = this.getResolver(userIntent.srcChainId);

      // Build order using resolver
      const orderData = await resolver.buildSwapOrder(userIntent);

      // Store order in service
      const order = this.swapOrderService.createSwapOrder(orderData);

      logger.info('Swap order built and stored', { 
        orderHash: order.orderHash,
        srcChainId: userIntent.srcChainId,
        dstChainId: userIntent.dstChainId 
      });

      return {
        order,
        orderHash: order.orderHash,
      };
    } catch (error) {
      logger.error('Failed to build swap order via relayer', { error, userIntent });
      throw new SwapError('Failed to build swap order', 'RELAYER_BUILD_FAILED', { userIntent });
    }
  }

  /**
   * Execute swap order
   */
  public async executeSwapOrder(orderHash: string, signature: string): Promise<string> {
    try {
      logger.info('Executing swap order via relayer', { orderHash });

      // Get order from storage
      const order = this.swapOrderService.getOrderByHash(orderHash);
      if (!order) {
        throw new SwapError('Order not found', 'ORDER_NOT_FOUND', { orderHash });
      }

      // Check order status
      if (order.status !== SwapOrderStatus.PENDING && order.status !== SwapOrderStatus.SIGNED) {
        throw new SwapError('Order cannot be executed', 'INVALID_ORDER_STATUS', { 
          orderHash, 
          currentStatus: order.status 
        });
      }

      // Add signature if not already present
      if (!order.signature) {
        this.swapOrderService.addSignature(orderHash, signature);
      }

      // Update order status to executing
      this.swapOrderService.updateOrderStatus(orderHash, SwapOrderStatus.EXECUTING);

      // Get resolver for source chain
      const resolver = this.getResolver(order.userIntent.srcChainId);

      // Execute order using resolver
      const txHash = await resolver.executeSwapOrder(orderHash, signature);

      // Update order status to completed
      this.swapOrderService.updateOrderStatus(orderHash, SwapOrderStatus.COMPLETED, {
        txHash,
        executedAt: new Date(),
      });

      logger.info('Swap order executed successfully via relayer', { orderHash, txHash });

      return txHash;
    } catch (error) {
      logger.error('Failed to execute swap order via relayer', { error, orderHash });

      // Update order status to failed
      this.swapOrderService.updateOrderStatus(orderHash, SwapOrderStatus.FAILED, {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new SwapError('Failed to execute swap order', 'RELAYER_EXECUTE_FAILED', { orderHash });
    }
  }

  /**
   * Reveal secret for order completion
   */
  public async revealSecret(orderHash: string, secret: string): Promise<boolean> {
    try {
      logger.info('Revealing secret via relayer', { orderHash });

      // Get order from storage
      const order = this.swapOrderService.getOrderByHash(orderHash);
      if (!order) {
        throw new SwapError('Order not found', 'ORDER_NOT_FOUND', { orderHash });
      }

      // Get resolver for source chain
      const resolver = this.getResolver(order.userIntent.srcChainId);

      // Reveal secret using resolver
      const result = await resolver.revealSecret(orderHash, secret);

      // Add secret to order
      this.swapOrderService.addSecret(orderHash, secret);

      logger.info('Secret revealed successfully via relayer', { orderHash });

      return result;
    } catch (error) {
      logger.error('Failed to reveal secret via relayer', { error, orderHash });
      throw new SwapError('Failed to reveal secret', 'RELAYER_REVEAL_FAILED', { orderHash });
    }
  }

  /**
   * Get swap quote
   */
  public async getSwapQuote(userIntent: UserIntent): Promise<any> {
    try {
      logger.info('Getting swap quote via relayer', { userIntent });

      // Get resolver for source chain
      const resolver = this.getResolver(userIntent.srcChainId);

      // Get quote using resolver
      const quote = await resolver.getSwapQuote(userIntent);

      logger.info('Swap quote retrieved via relayer', { userIntent, quote });

      return quote;
    } catch (error) {
      logger.error('Failed to get swap quote via relayer', { error, userIntent });
      throw new SwapError('Failed to get swap quote', 'RELAYER_QUOTE_FAILED', { userIntent });
    }
  }

  /**
   * Get order by hash
   */
  public getOrderByHash(orderHash: string): SwapOrder | undefined {
    return this.swapOrderService.getOrderByHash(orderHash);
  }

  /**
   * Get orders by user
   */
  public getOrdersByUser(userAddress: string): SwapOrder[] {
    return this.swapOrderService.getOrdersByUser(userAddress);
  }

  /**
   * Get supported chains
   */
  public getSupportedChains(): number[] {
    const chains = Array.from(this.resolvers.keys());
    logger.info('Supported chains retrieved', { chains });
    return chains;
  }

  /**
   * Get resolver for chain
   */
  private getResolver(chainId: number): EvmResolver {
    const resolver = this.resolvers.get(chainId);
    if (!resolver) {
      const supportedChains = Array.from(this.resolvers.keys());
      throw new SwapError(
        `No resolver available for chain ${chainId}`, 
        'UNSUPPORTED_CHAIN', 
        { chainId, supportedChains }
      );
    }
    return resolver;
  }

  /**
   * Health check for all resolvers
   */
  public async healthCheck(): Promise<{ [chainId: number]: boolean }> {
    const health: { [chainId: number]: boolean } = {};

    for (const [chainId, resolver] of this.resolvers) {
      try {
        // Check if resolver is responsive
        await resolver.getEvmClient().getBlockNumber();
        health[chainId] = true;
        logger.info('Resolver health check passed', { chainId });
      } catch (error) {
        health[chainId] = false;
        logger.warn('Resolver health check failed', { chainId, error });
      }
    }

    return health;
  }

  /**
   * Get statistics
   */
  public getStatistics(): {
    totalOrders: number;
    ordersByStatus: { [status: string]: number };
    supportedChains: number[];
  } {
    const allOrders = this.swapOrderService.getAllOrders();
    const ordersByStatus: { [status: string]: number } = {};

    // Count orders by status
    for (const order of allOrders) {
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
    }

    return {
      totalOrders: allOrders.length,
      ordersByStatus,
      supportedChains: this.getSupportedChains(),
    };
  }

  /**
   * Initialize with standard resolvers
   */
  public static async create(): Promise<RelayerService> {
    const swapOrderService = new SwapOrderService();
    const relayerService = new RelayerService(swapOrderService);

    // Add default Ethereum resolver if environment variables are available
    if (process.env.ETH_RPC_URL && process.env.ETH_PRIVATE_KEY) {
      const ethConfig: ResolverConfig = {
        chainId: 1, // Ethereum mainnet
      };

      const ethResolver = new EvmResolver(
        process.env.ETH_RPC_URL,
        process.env.ETH_PRIVATE_KEY,
        process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443',
        ethConfig
      );

      relayerService.addResolver(1, ethResolver);
    }

    logger.info('RelayerService created with default configuration');

    return relayerService;
  }
} 