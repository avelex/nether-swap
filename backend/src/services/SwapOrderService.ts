import { SwapOrder, SwapOrderStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

export class SwapOrderService {
  private orders: Map<string, SwapOrder> = new Map();
  private userOrders: Map<string, string[]> = new Map();

  /**
   * Create a new swap order
   */
  public createSwapOrder(orderData: Omit<SwapOrder, 'id' | 'createdAt' | 'updatedAt'>): SwapOrder {
    const order: SwapOrder = {
      ...orderData,
      id: uuidv4(),
      status: SwapOrderStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(order.orderHash, order);
    
    // Track orders by user address
    const userAddress = order.userIntent.userAddress.toLowerCase();
    if (!this.userOrders.has(userAddress)) {
      this.userOrders.set(userAddress, []);
    }
    this.userOrders.get(userAddress)!.push(order.orderHash);

    logger.info('Swap order created', {
      orderHash: order.orderHash,
      userAddress: order.userIntent.userAddress,
      srcChainId: order.userIntent.srcChainId,
      dstChainId: order.userIntent.dstChainId,
    });

    return order;
  }

  /**
   * Get order by hash
   */
  public getOrderByHash(orderHash: string): SwapOrder | undefined {
    return this.orders.get(orderHash);
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
  public updateOrderStatus(
    orderHash: string, 
    status: SwapOrderStatus, 
    additionalData?: Partial<SwapOrder>
  ): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to update non-existent order', { orderHash });
      return undefined;
    }

    const updatedOrder: SwapOrder = {
      ...order,
      ...additionalData,
      status,
      updatedAt: new Date(),
      ...(status === SwapOrderStatus.COMPLETED && { executedAt: new Date() }),
    };

    this.orders.set(orderHash, updatedOrder);

    logger.info('Order status updated', {
      orderHash,
      oldStatus: order.status,
      newStatus: status,
    });

    return updatedOrder;
  }

  /**
   * Add signature to order
   */
  public addSignature(orderHash: string, signature: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add signature to non-existent order', { orderHash });
      return undefined;
    }

    const updatedOrder: SwapOrder = {
      ...order,
      signature,
      status: SwapOrderStatus.SIGNED,
      updatedAt: new Date(),
    };

    this.orders.set(orderHash, updatedOrder);

    logger.info('Signature added to order', { orderHash });

    return updatedOrder;
  }

  /**
   * Add secret to order
   */
  public addSecret(orderHash: string, secret: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn('Attempted to add secret to non-existent order', { orderHash });
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

  /**
   * Get all orders (for debugging/admin)
   */
  public getAllOrders(): SwapOrder[] {
    return Array.from(this.orders.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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