import { EvmSwapOrder, SwapOrder } from '../types';
import logger from '../utils/logger';

export class SwapOrderService {
  private orders: Map<string, SwapOrder> = new Map();
  private userOrders: Map<string, string[]> = new Map();
  private evmSwapOrders: Map<string, EvmSwapOrder> = new Map();

  /**
   * Create a new swap order
   */
  public createEvmSwapOrder(
    orderData: Omit<EvmSwapOrder, 'createdAt' | 'updatedAt'>
  ): EvmSwapOrder {
    const order: EvmSwapOrder = {
      ...orderData,
      base: {
        ...orderData.base,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    this.evmSwapOrders.set(order.base.orderHash, order);
    this.orders.set(order.base.orderHash, order.base);

    // Track orders by user address
    const userAddress = order.base.userIntent.userAddress.toLowerCase();
    if (!this.userOrders.has(userAddress)) {
      this.userOrders.set(userAddress, []);
    }
    this.userOrders.get(userAddress)!.push(order.base.orderHash);

    logger.info('Swap order created', {
      orderHash: order.base.orderHash,
      userAddress: order.base.userIntent.userAddress,
      srcChainId: order.base.userIntent.srcChainId,
      dstChainId: order.base.userIntent.dstChainId,
    });

    return order;
  }

  /**
   * Get order by hash
   */
  public getOrderByHash(orderHash: string): SwapOrder | undefined {
    return this.orders.get(orderHash);
  }

  public getEvmOrderByHash(orderHash: string): EvmSwapOrder | undefined {
    return this.evmSwapOrders.get(orderHash);
  }

  /**
   * Get all orders for a user
   */
  public getOrdersByUser(userAddress: string): SwapOrder[] {
    const normalizedAddress = userAddress.toLowerCase();
    const orderHashes = this.userOrders.get(normalizedAddress) || [];
    return orderHashes
      .map(hash => this.orders.get(hash))
      .filter((order): order is SwapOrder => order !== undefined)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Update order status
   */
  public updateOrderStatus(orderHash: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to update non-existent order', { orderHash });
      return undefined;
    }

    return order;
  }

  /**
   * Add signature to order
   */
  public addEvmSignature(
    orderHash: string,
    signature: string
  ): EvmSwapOrder | undefined {
    const order = this.evmSwapOrders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add signature to non-existent order', {
        orderHash,
      });
      return undefined;
    }

    const updatedOrder: EvmSwapOrder = {
      ...order,
      base: {
        ...order.base,
        signature,
        updatedAt: new Date(),
      },
    };

    this.evmSwapOrders.set(orderHash, updatedOrder);

    logger.info('Signature added to order', { orderHash });

    return updatedOrder;
  }

  /**
   * Add secret to order
   */
  public addSecret(orderHash: string, secret: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add secret to non-existent order', {
        orderHash,
      });
      return undefined;
    }

    const updatedOrder: SwapOrder = {
      ...order,
      secret,
      updatedAt: new Date(),
    };

    this.orders.set(orderHash, updatedOrder);

    logger.info('Secret added to order', { orderHash });

    return updatedOrder;
  }

  public addEscrowSrcTxHash(orderHash: string, txHash: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add escrow src tx hash to non-existent order', {
        orderHash,
      });
      return undefined;
    }

    const updatedOrder: SwapOrder = {
      ...order,
      escrowSrcTxHash: txHash,
      updatedAt: new Date(),
    };

    this.orders.set(orderHash, updatedOrder);

    logger.info('Escrow src tx hash added to order', { orderHash });

    return updatedOrder;
  }

  public addEscrowDstTxHash(orderHash: string, txHash: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add escrow dst tx hash to non-existent order', {
        orderHash,
      });
      return undefined;
    }

    const updatedOrder: SwapOrder = {
      ...order,
      escrowDstTxHash: txHash,
      updatedAt: new Date(),
    };

    this.orders.set(orderHash, updatedOrder);

    logger.info('Escrow dst tx hash added to order', { orderHash });

    return updatedOrder;
  }
  
  public addEscrowSrcWithdrawTxHash(orderHash: string, txHash: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add escrow src withdraw tx hash to non-existent order', {
        orderHash,
      });
      return undefined;
    }

    const updatedOrder: SwapOrder = {
      ...order,
      escrowSrcWithdrawTxHash: txHash,
      updatedAt: new Date(),
    };

    this.orders.set(orderHash, updatedOrder);

    logger.info('Escrow src withdraw tx hash added to order', { orderHash });

    return updatedOrder;
  }

  public addEscrowDstWithdrawTxHash(orderHash: string, txHash: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add escrow dst withdraw tx hash to non-existent order', {
        orderHash,
      });
      return undefined;
    }

    const updatedOrder: SwapOrder = {
      ...order,
      escrowDstWithdrawTxHash: txHash,
      updatedAt: new Date(),
    };

    this.orders.set(orderHash, updatedOrder);

    logger.info('Escrow dst withdraw tx hash added to order', { orderHash });

    return updatedOrder;
  }

  /**
   * Get all orders (for debugging/admin)
   */
  public getAllOrders(): SwapOrder[] {
    return Array.from(this.orders.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get orders count
   */
  public getOrdersCount(): number {
    return this.orders.size;
  }

  /**
   * Clear all orders (for testing)
   */
  public clearAllOrders(): void {
    this.orders.clear();
    this.userOrders.clear();
    logger.info('All orders cleared');
  }
}
