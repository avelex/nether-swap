import { EvmResolver } from './EvmResolver';
import { SwapOrderService } from './SwapOrderService';
import {
  UserIntent,
  SwapOrder,
  SwapError,
  ResolverConfig,
  SuiResolverConfig,
  EvmSwapOrder,
} from '../types';

import logger from '../utils/logger';
import * as Sdk from '@1inch/cross-chain-sdk';
import { ethers, parseEther, parseUnits } from 'ethers';
import { UINT_40_MAX } from '@1inch/byte-utils';
import { EvmClient } from './EvmClient';
import { SuiResolver } from './SuiResolver';
//import { SuiAddress } from '../domains/addresses/sui-address';

export default class RelayerService {
  private resolvers: Map<number, EvmResolver> = new Map();
  private suiResolver!: SuiResolver;
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
    });
  }
  public setSuiResolver(resolver: SuiResolver): void {
    this.suiResolver = resolver;
    logger.info('SUI Resolver added');
  }

  /**
   * Build swap order using appropriate resolver
   */
  public buildEvmSwapOrder(
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
            orderHash,
            userIntent,
            createdAt: new Date(),
            updatedAt: new Date(),
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
  public async executeEvmSwapOrder(
    orderHash: string,
    signature: string
  ): Promise<void> {
    try {
      const order = this.swapOrderService.getEvmOrderByHash(orderHash);
      if (!order) {
        throw new SwapError('Order not found', 'ORDER_NOT_FOUND', {
          orderHash,
        });
      }

      //TODO: verify signature

      // Add signature if not already present
      if (!order.signature) {
        this.swapOrderService.addEvmSignature(orderHash, signature);
      }

      // Get resolver for source chain
      const srcResolver = this.getResolver(order.userIntent.srcChainId);

      const escrowSrcTxHash = await srcResolver.deployEscrowSrc(order);
      this.swapOrderService.addEscrowSrcTxHash(orderHash, escrowSrcTxHash);

      // TODO: use getter in case we add more networks
      const escrowDstTxHash = await this.suiResolver.deployEscroyDst(
        order.order.receiver.toString(),
        "0x2::sui::Coin",
        order.order.takingAmount,
        order.order.hashLock.toBuffer(),
        order.order.dstSafetyDeposit,
      )
      this.swapOrderService.addEscrowDstTxHash(orderHash, escrowDstTxHash);

      return;

    } catch (error) {
      logger.error('Failed to execute swap order via relayer', {
        error,
        orderHash,
      });

      // Update order status to failed
      //TODO: add error message
      this.swapOrderService.updateOrderStatus(orderHash); 

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
  public async revealSecret(orderHash: string, secret: string): Promise<void> {
    try {
      const order = this.swapOrderService.getEvmOrderByHash(orderHash);
      if (!order) {
        throw new SwapError('Order not found', 'ORDER_NOT_FOUND', {
          orderHash,
        });
      }

      // TODO:
      // const dstResolver = this.getSuiResolver();
      // const escrowDstWithdrawTxHash = await dstResolver.withdrawEscrowDst(order);
      // this.swapOrderService.addEscrowDstWithdrawTxHash(orderHash, escrowDstWithdrawTxHash);

      const srcResolver = this.getResolver(order.userIntent.srcChainId);
      const escrowSrcWithdrawTxHash = await srcResolver.withdrawEscrowSrc(
        secret,
        order
      );
      this.swapOrderService.addEscrowSrcWithdrawTxHash(
        orderHash,
        escrowSrcWithdrawTxHash
      );

      return;
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
      const ethResolver = new EvmResolver(evmClient, ethConfig);
      relayerService.addResolver(ethConfig.chainId, ethResolver);

      const suiConfig: SuiResolverConfig = {
        rpcUrl : process.env.SUI_RPC_URL ||  'https://sui-devnet-endpoint.blockvision.org',
        resolverKey: process.env.SUI_RESOLVER_KEY || '',
        resolverCapId: process.env.SUI_RESOLVER_CAP_ID || '0xe918d86bcc0bd7fe32fb4a3de27aa278712738b536e0dbdfd362bda5bf41530a',
        htlcPackageId: process.env.SUI_HTLC_PACKAGE_ID || '0x8748bca439c6e509d6ec627ebad1746adb730388fab89f468c0f562d4bef963b',
      }
      relayerService.setSuiResolver(new SuiResolver(suiConfig));
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
      takerAsset: Sdk.EvmAddress.fromString(userIntent.srcChainAsset),
      receiver: Sdk.EvmAddress.fromString(userIntent.userAddress),
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
