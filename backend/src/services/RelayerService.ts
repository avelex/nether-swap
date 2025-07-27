import { EvmResolver } from './EvmResolver';
import { SwapOrderService } from './SwapOrderService';
import {
  UserIntent,
  SwapOrder,
  SwapError,
  SwapOrderStatus,
  ResolverConfig,
  EvmSwapOrder,
} from '../types';
import logger from '../utils/logger';
import * as Sdk from '@1inch/cross-chain-sdk';
import { ethers, parseEther, parseUnits } from 'ethers';
import { UINT_40_MAX } from '@1inch/byte-utils';
import { EvmClient } from './EvmClient';
import { SuiClient } from './SuiClient';

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
    logger.info('Resolver added', {
      chainId,
      supportedChains: resolver.getSupportedChains(),
    });
  }

  /**
   * Build swap order using appropriate resolver
   */
  public buildSwapOrder(
    userIntent: UserIntent
  ): Sdk.EIP712TypedData | undefined {
    try {
      switch (userIntent.srcChainId) {
        case 42161:
          const resolver = this.getResolver(userIntent.srcChainId);
          const order = this.createEvmCrossChainOrder(userIntent, resolver);

          const typedData = this.generateOrderTypedData(
            userIntent.srcChainId,
            order,
            resolver.getLimitOrder()
          );

          const orderHash = this.orderHash(typedData);

          const swapOrder: EvmSwapOrder = {
            base: {
              orderHash,
              userIntent,
              status: SwapOrderStatus.PENDING,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            typedData,
            order,
          };

          this.swapOrderService.createEvmSwapOrder(swapOrder);

          return typedData;
        default:
          return undefined;
      }
    } catch (error) {
      logger.error('Failed to build swap order via relayer', {
        error,
        userIntent,
      });
      throw new SwapError(
        'Failed to build swap order',
        'RELAYER_BUILD_FAILED',
        { userIntent }
      );
    }
  }

  /**
   * Execute swap order
   */
  public async executeSwapOrder(
    orderHash: string,
    signature: string
  ): Promise<string> {
    try {
      logger.info('Executing swap order via relayer', { orderHash });

      // Get order from storage
      const order = this.swapOrderService.getEvmOrderByHash(orderHash);
      if (!order) {
        throw new SwapError('Order not found', 'ORDER_NOT_FOUND', {
          orderHash,
        });
      }

      //TODO: verify signature
      //TODO: verify status

      // Add signature if not already present
      if (!order.base.signature) {
        this.swapOrderService.addEvmSignature(orderHash, signature);
      }

      // Get resolver for source chain
      const resolver = this.getResolver(order.base.userIntent.srcChainId);

      // Execute order using resolver in background
      resolver.executeSwapOrder(order);

      logger.info('Swap order executed successfully via relayer', {
        orderHash,
      });

      return order.base.orderHash;
    } catch (error) {
      logger.error('Failed to execute swap order via relayer', {
        error,
        orderHash,
      });

      // Update order status to failed
      this.swapOrderService.updateOrderStatus(orderHash); //TODO: add error message

      throw new SwapError(
        'Failed to execute swap order',
        'RELAYER_EXECUTE_FAILED',
        { orderHash }
      );
    }
  }

  /**
   * Reveal secret for order completion
   */
  public async revealSecret(
    orderHash: string,
    secret: string
  ): Promise<boolean> {
    try {
      logger.info('Revealing secret via relayer', { orderHash });

      // Get order from storage
      const order = this.swapOrderService.getOrderByHash(orderHash);
      if (!order) {
        throw new SwapError('Order not found', 'ORDER_NOT_FOUND', {
          orderHash,
        });
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
      throw new SwapError('Failed to reveal secret', 'RELAYER_REVEAL_FAILED', {
        orderHash,
      });
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
   * Initialize with standard resolvers
   */
  public static async create(): Promise<RelayerService> {
    const swapOrderService = new SwapOrderService();
    const relayerService = new RelayerService(swapOrderService);

    // Add default Ethereum resolver if environment variables are available
    if (process.env.ETH_RPC_URL && process.env.ETH_PRIVATE_KEY) {
      const ethConfig: ResolverConfig = {
        chainId: 42161, // Arbitrum mainnet
        resolver: process.env.ETH_RESOLVER || '',
        escrowFactory: process.env.ETH_ESCROW_FACTORY || '',
        limitOrder: process.env.ETH_LIMIT_ORDER || '',
      };

      const evmClient = new EvmClient(
        process.env.ETH_RPC_URL,
        process.env.ETH_PRIVATE_KEY,
        ethConfig.chainId
      );

      const suiClient = new SuiClient(
        process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443',
        666
      );

      const ethResolver = new EvmResolver(evmClient, suiClient, ethConfig);

      relayerService.addResolver(ethConfig.chainId, ethResolver);
    }

    logger.info('RelayerService created with default configuration');

    return relayerService;
  }

  private generateOrderTypedData(
    srcChainId: number,
    order: Sdk.EvmCrossChainOrder,
    verifyingContract: string
  ): Sdk.EIP712TypedData {
    const typedData = order.getTypedData(srcChainId);
    typedData.domain = {
      name: '1inch Limit Order Protocol',
      version: '4',
      chainId: srcChainId,
      verifyingContract: verifyingContract,
    };

    return typedData;
  }

  private orderHash(typedData: Sdk.EIP712TypedData): string {
    return ethers.TypedDataEncoder.hash(
      typedData.domain,
      { Order: typedData.types[typedData.primaryType] },
      typedData.message
    );
  }

  private createEvmCrossChainOrder(
    userIntent: UserIntent,
    resolver: EvmResolver
  ): Sdk.EvmCrossChainOrder {
    const escrowFactory = Sdk.EvmAddress.fromString(
      resolver.getEscrowFactory()
    );
    const hashLock = Sdk.HashLock.fromString(userIntent.hashLock);

    const orderInfo = {
      salt: Sdk.randBigInt(1000n),
      maker: Sdk.EvmAddress.fromString(userIntent.userAddress),
      makingAmount: parseUnits(userIntent.tokenAmount, 6), // TODO: take decimals from config
      takingAmount: parseUnits(userIntent.tokenAmount, 6), // TODO: take decimals from config
      makerAsset: Sdk.EvmAddress.fromString(userIntent.srcChainAsset),
      takerAsset: Sdk.EvmAddress.fromString(userIntent.dstChainAsset),
      receiver: Sdk.EvmAddress.fromString(userIntent.receiver),
    };

    const escrowParams = {
      hashLock: hashLock,
      timeLocks: Sdk.TimeLocks.new({
        srcWithdrawal: 10n, //TODO: 10sec finality lock for test
        srcPublicWithdrawal: 120n, //TODO: 2m for private withdrawal
        srcCancellation: 121n, //TODO: 1sec public withdrawal
        srcPublicCancellation: 122n, //TODO: 1sec private cancellation
        dstWithdrawal: 10n, //TODO: 10sec finality lock for test
        dstPublicWithdrawal: 100n, //TODO: 100sec private withdrawal
        dstCancellation: 101n, //TODO: 1sec public withdrawal
      }),
      srcChainId: userIntent.srcChainId as Sdk.EvmChain,
      dstChainId: userIntent.dstChainId as Sdk.SupportedChain,
      srcSafetyDeposit: parseEther('0.000001'), //TODO: take from config
      dstSafetyDeposit: parseEther('0.000001'), //TODO: take from config
    };

    const resolverAddress = Sdk.EvmAddress.fromString(resolver.getEvmAddress());

    const details = {
      auction: new Sdk.AuctionDetails({
        initialRateBump: 0,
        points: [],
        duration: 120n,
        startTime: BigInt(Math.floor(Date.now() / 1000)),
      }),
      whitelist: [
        {
          address: resolverAddress,
          allowFrom: 0n,
        },
      ],
      resolvingStartTime: 0n,
    };

    const extra = {
      nonce: Sdk.randBigInt(UINT_40_MAX),
      allowPartialFills: false,
      allowMultipleFills: false,
    };

    return Sdk.EvmCrossChainOrder.new(
      escrowFactory,
      orderInfo,
      escrowParams,
      details,
      extra
    );
  }
}
