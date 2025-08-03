// ================================================================================================
// IMPORTS
// ================================================================================================

import { ethers, parseEther, parseUnits } from 'ethers';
import { UINT_40_MAX } from '@1inch/byte-utils';
import * as Sdk from '@1inch/cross-chain-sdk';

import logger from '../utils/logger';
import { EvmClient } from './EvmClient';
import { EvmResolver } from './EvmResolver';
import { SuiResolver } from './SuiResolver';
import { SwapOrderService } from './SwapOrderService';
import {
  UserIntent,
  SwapOrder,
  SwapError,
  ResolverConfig,
  SuiResolverConfig,
  EvmSwapOrder,
  SuiSwapRequest,
} from '../types';
import { SuiAddress } from '../domains/addresses/sui-address';

// ================================================================================================
// UTILITY FUNCTIONS
// ================================================================================================

/**
 * Creates immutables for destination escrow deployment
 */
function createDstImmutables(
  userIntent: UserIntent,
  order: SwapOrder,
  resolverAddress: string,
  deployedAt: bigint
): Sdk.Immutables {
  // const [_, maker] = SuiAddress.fromString(
  //   userIntent.userAddress
  // ).splitToParts();

  const timeLocks = Sdk.TimeLocks.new({
    srcWithdrawal: 5n,
    srcPublicWithdrawal: 120n,
    srcCancellation: 121n,
    srcPublicCancellation: 122n,
    dstWithdrawal: 10n,
    dstPublicWithdrawal: 100n,
    dstCancellation: 101n,
  });

  const immutables = Sdk.Immutables.new({
    orderHash: Buffer.from(order.orderHash.replace('0x', ''), 'hex'),
    hashLock: Sdk.HashLock.fromString(userIntent.hashLock),
    maker: Sdk.EvmAddress.fromString(userIntent.receiver),
    taker: Sdk.EvmAddress.fromString(resolverAddress),
    token: Sdk.EvmAddress.fromString(userIntent.dstChainAsset),
    amount: parseUnits(userIntent.tokenAmount, 6),
    safetyDeposit: parseEther('0.000001'),
    timeLocks: timeLocks,
  });

  return immutables.withDeployedAt(deployedAt);
}

function createSrcImmutables(
  swapOrder: EvmSwapOrder,
  resolverAddress: string,
  deployedAt: bigint
): Sdk.Immutables {
  const immutables = Sdk.Immutables.new({
    orderHash: Buffer.from(swapOrder.orderHash.replace('0x', ''), 'hex'),
    hashLock: swapOrder.order.escrowExtension.hashLockInfo,
    maker: swapOrder.order.maker,
    taker: Sdk.EvmAddress.fromString(resolverAddress),
    token: swapOrder.order.makerAsset,
    amount: swapOrder.order.makingAmount,
    safetyDeposit: swapOrder.order.escrowExtension.srcSafetyDeposit,
    timeLocks: swapOrder.order.escrowExtension.timeLocks,
  });

  return immutables.withDeployedAt(deployedAt);
}

// ================================================================================================
// INTERFACES & TYPES
// ================================================================================================

/**
 * Unified interface for chain resolvers (EVM and Sui)
 */
interface ChainResolver {
  withdrawEscrowSrc(order: SwapOrder, secret: string): Promise<string>;
  withdrawEscrowDst(order: SwapOrder, secret: string): Promise<string>;
}

// ================================================================================================
// WRAPPER CLASSES
// ================================================================================================

/**
 * Wrapper for EVM resolvers to provide unified interface
 */
class EvmResolverWrapper implements ChainResolver {
  constructor(private resolver: EvmResolver) {}

  async withdrawEscrowSrc(order: SwapOrder, secret: string): Promise<string> {
    const evmOrder = order as EvmSwapOrder;
    console.log(
      'EvmResolverWrapper.withdrawEscrowSrc - Withdrawing from EVM escrow',
      {
        evmOrder,
      }
    );

    const immutables = createSrcImmutables(
      evmOrder,
      this.resolver.getResolverAddress(),
      BigInt(evmOrder.deployedAt!)
    );

    console.log('EvmResolverWrapper.withdrawEscrowSrc - Immutables', {
      immutables,
    });

    return await this.resolver.withdrawEscrowSrc(
      evmOrder.evmEscrowAddress!,
      secret,
      immutables
    );
  }

  async withdrawEscrowDst(order: SwapOrder, secret: string): Promise<string> {
    const immutables = createDstImmutables(
      order.userIntent,
      order,
      this.resolver.getResolverAddress(),
      BigInt(order.deployedAt!)
    );

    return await this.resolver.withdrawEscrowDst(
      order.evmEscrowAddress!,
      secret,
      immutables
    );
  }
}

/**
 * Wrapper for Sui resolver to provide unified interface
 */
class SuiResolverWrapper implements ChainResolver {
  constructor(private resolver: SuiResolver) {}

  async withdrawEscrowSrc(order: SwapOrder, secret: string): Promise<string> {
    return await this.resolver.withdrawEscrowSrc(
      order.suiEscrowObjectId!,
      secret,
      order.userIntent.srcChainAsset
    );
  }

  async withdrawEscrowDst(order: SwapOrder, secret: string): Promise<string> {
    return await this.resolver.withdrawEscrowDst(
      order.suiEscrowObjectId!,
      secret,
      order.userIntent.dstChainAsset
    );
  }
}

// ================================================================================================
// MAIN SERVICE CLASS
// ================================================================================================

export default class RelayerService {
  // ============================================================================================
  // PROPERTIES
  // ============================================================================================

  private resolvers: Map<number, EvmResolver> = new Map();
  private suiResolver!: SuiResolver;
  private swapOrderService: SwapOrderService;

  // ============================================================================================
  // CONSTRUCTOR & FACTORY
  // ============================================================================================

  constructor(swapOrderService: SwapOrderService) {
    this.swapOrderService = swapOrderService;
    logger.info('RelayerService initialized');
  }

  /**
   * Initialize with standard resolvers
   */
  public static async create(): Promise<RelayerService> {
    const swapOrderService = new SwapOrderService();
    const relayerService = new RelayerService(swapOrderService);

    // Configure Ethereum resolver
    const ethConfig: ResolverConfig = {
      chainId: 42161, // Arbitrum mainnet
      resolver: process.env.ETH_RESOLVER || '',
      escrowFactory: process.env.ETH_ESCROW_FACTORY || '',
      limitOrder: process.env.ETH_LIMIT_ORDER || '',
    };

    const evmClient = new EvmClient(
      process.env.ETH_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      process.env.ETH_PRIVATE_KEY!,
      ethConfig.chainId
    );
    const ethResolver = new EvmResolver(evmClient, ethConfig);
    relayerService.addResolver(ethConfig.chainId, ethResolver);

    // Configure Sui resolver
    const suiConfig: SuiResolverConfig = {
      rpcUrl: process.env.SUI_RPC_URL || '',
      resolverKey: process.env.SUI_RESOLVER_KEY || '',
      resolverCapId:
        process.env.SUI_RESOLVER_CAP_ID ||
        '0x845f06b8423296592202a7276e7683aa8c50896e96a0ab3abbb12305e3701b49',
      htlcPackageId:
        process.env.SUI_HTLC_PACKAGE_ID ||
        '0x7245e00b46f2f8ad8a76da66a8ad838cf896c0fd938f5ae63f462b9807344f83',
    };
    relayerService.setSuiResolver(new SuiResolver(suiConfig));

    logger.info('RelayerService created with default configuration');
    return relayerService;
  }

  // ============================================================================================
  // RESOLVER MANAGEMENT
  // ============================================================================================

  /**
   * Add EVM resolver for a specific chain
   */
  public addResolver(chainId: number, resolver: EvmResolver): void {
    this.resolvers.set(chainId, resolver);
    logger.info('Resolver added', { chainId });
  }

  /**
   * Set Sui resolver
   */
  public setSuiResolver(resolver: SuiResolver): void {
    this.suiResolver = resolver;
    logger.info('SUI Resolver added');
  }

  /**
   * Get Sui resolver instance
   */
  public getSuiResolver(): SuiResolver {
    if (!this.suiResolver) {
      throw new Error('SUI resolver not initialized');
    }
    return this.suiResolver;
  }

  /**
   * Get supported chains
   */
  public getSupportedChains(): number[] {
    const chains = Array.from(this.resolvers.keys());
    logger.info('Supported chains retrieved', { chains });
    return chains;
  }

  // ============================================================================================
  // ORDER MANAGEMENT
  // ============================================================================================

  /**
   * Create new Sui swap order
   */
  public newSuiSwapOrder(userIntent: UserIntent): SwapOrder {
    // TODO: take decimals from config
    const amount = parseFloat(userIntent.tokenAmount);

    const amountInSui =
      userIntent.srcChainAsset === '0x2::sui::SUI'
        ? (amount / 10 ** 9).toString()
        : (amount / 10 ** 6).toString();

    userIntent.tokenAmount = amountInSui;

    const order = this.swapOrderService.createSwapOrder({ userIntent });
    return order;
  }

  /**
   * Build EVM swap order
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

  // ============================================================================================
  // SWAP EXECUTION
  // ============================================================================================

  /**
   * Execute EVM swap order
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

      // Add signature if not already present
      if (!order.signature) {
        this.swapOrderService.addEvmSignature(orderHash, signature);
      }

      // Deploy source escrow
      const srcResolver = this.getResolver(order.userIntent.srcChainId);
      order.signature = signature;

      const [escrowSrcTxHash, escrowAddress, deployedAt] =
        await srcResolver.deployEscrowSrc(order);
        
      this.swapOrderService.addEvmEscrowAddress(orderHash, escrowAddress);
      this.swapOrderService.addDeployedAt(orderHash, Number(deployedAt));

      const srcWithdrawalTime =
        order.order.timeLocks.toSrcTimeLocks(deployedAt).privateWithdrawal;

      // Deploy destination escrow
      const {
        txSignature,
        escrowObjectId,
        withdrawAt: dstWithdrawalTime,
      } = await this.suiResolver.deployEscrowDst(
        order.userIntent.receiver,
        order.order.takingAmount,
        order.order.hashLock.toBuffer(),
        order.order.dstSafetyDeposit,
        order.userIntent.dstChainAsset
      );

      await this.waitUntilTime(dstWithdrawalTime);

      this.swapOrderService.addEscrowDstTxHash(orderHash, txSignature);
      this.swapOrderService.addSuiEscrowObjectId(orderHash, escrowObjectId);

      await this.waitUntilTime(srcWithdrawalTime);
      this.swapOrderService.addEscrowSrcTxHash(orderHash, escrowSrcTxHash);
    } catch (error) {
      logger.error('Failed to execute swap order via relayer', {
        error,
        orderHash,
      });
      this.swapOrderService.updateOrderStatus(orderHash);
      throw new SwapError(
        'Failed to execute swap order',
        'RELAYER_EXECUTE_FAILED',
        { orderHash }
      );
    }
  }

  /**
   * Execute Sui swap
   */
  public async executeSuiSwap(
    swap: SuiSwapRequest,
    order: SwapOrder
  ): Promise<void> {
    console.log('RelayerService.executeSuiSwap - Starting Sui swap execution', {
      orderHash: order.orderHash,
      userIntent: swap.userIntent,
      userSignature: swap.userSignature,
    });

    try {
      const hashlockBytes = new Uint8Array(
        Buffer.from(swap.userIntent.hashLock.replace('0x', ''), 'hex')
      );

      const amount =
        swap.userIntent.srcChainAsset === '0x2::sui::SUI'
          ? parseUnits(swap.userIntent.tokenAmount, 9)
          : parseUnits(swap.userIntent.tokenAmount, 6);

      const {
        txSignature,
        escrowObjectId,
        deployedAt,
        withdrawAt: srcWithdrawalTime,
      } = await this.suiResolver.deployEscrowSrc(
        swap.userIntent.userAddress,
        swap.userIntent.srcChainAsset,
        Number(amount),
        hashlockBytes,
        swap.userSignature
      );

      this.swapOrderService.addDeployedAt(order.orderHash, Number(deployedAt));

      // Deploy destination escrow on EVM
      const dstResolver = this.getResolver(order.userIntent.dstChainId);
      const immutables = createDstImmutables(
        order.userIntent,
        order,
        dstResolver.getResolverAddress(),
        deployedAt
      );

      const [escrowDstTxHash, escrowAddress, evmDeployedAt] =
        await dstResolver.deployEscrowDst(immutables);

      const dstWithdrawalTime =
        immutables.timeLocks.toDstTimeLocks(evmDeployedAt).privateWithdrawal;

      this.swapOrderService.addDeployedAt(
        order.orderHash,
        Number(evmDeployedAt)
      );

      // Wait until current time exceeds dstWithdrawalTime before adding escrow dst hash
      await this.waitUntilTime(dstWithdrawalTime);

      this.swapOrderService.addEscrowDstTxHash(
        order.orderHash,
        escrowDstTxHash
      );
      this.swapOrderService.addEvmEscrowAddress(order.orderHash, escrowAddress);

      // Wait until current time exceeds srcWithdrawalTime before adding escrow src hash
      // dstWithdrawalTime < srcWithdrawalTime
      await this.waitUntilTime(srcWithdrawalTime);

      this.swapOrderService.addEscrowSrcTxHash(order.orderHash, txSignature);
      this.swapOrderService.addSuiEscrowObjectId(
        order.orderHash,
        escrowObjectId
      );
    } catch (error) {
      console.error('RelayerService.executeSuiSwap - Error occurred', {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
                code: (error as any).code,
              }
            : error,
        orderHash: order.orderHash,
      });
      logger.error('Failed to execute swap order via relayer', {
        error,
        orderHash: order.orderHash,
      });
      this.swapOrderService.updateOrderStatus(order.orderHash);
      throw new SwapError(
        'Failed to execute swap order',
        'RELAYER_EXECUTE_FAILED',
        { orderHash: order.orderHash }
      );
    }
  }

  /**
   * Reveal secret for order completion
   */
  public async revealSecret(orderHash: string, secret: string): Promise<void> {
    try {
      const order = this.swapOrderService.getOrderByHash(orderHash);
      if (!order) {
        throw new SwapError('Order not found', 'ORDER_NOT_FOUND', {
          orderHash,
        });
      }

      const secretHash = ethers.keccak256(Buffer.from(secret, 'hex'));

      if (secretHash !== order.userIntent.hashLock) {
        console.log('RelayerService.revealSecret - Invalid secret', {
          orderHash,
          wantedHashLock: order.userIntent.hashLock,
          receivedHashLock: secretHash,
        });

        throw new SwapError('Invalid secret', 'INVALID_SECRET', {
          orderHash,
          wantedHashLock: order.userIntent.hashLock,
          receivedHashLock: secretHash,
        });
      }

      // Verify all escrows are deployed successfully
      if (!order.escrowSrcTxHash || !order.escrowDstTxHash) {
        console.log(
          'RelayerService.revealSecret - Escrows not fully deployed',
          {
            orderHash,
            escrowSrcTxHash: order.escrowSrcTxHash,
            escrowDstTxHash: order.escrowDstTxHash,
          }
        );

        throw new SwapError(
          'Escrows not fully deployed',
          'ESCROW_NOT_DEPLOYED',
          {
            orderHash,
            escrowSrcTxHash: order.escrowSrcTxHash,
            escrowDstTxHash: order.escrowDstTxHash,
          }
        );
      }

      // Get resolvers for both chains
      const srcResolver = this.getChainResolver(order.userIntent.srcChainId);
      const dstResolver = this.getChainResolver(order.userIntent.dstChainId);

      // Withdraw from source escrow
      const escrowSrcWithdrawTxHash = await srcResolver.withdrawEscrowSrc(
        order,
        secret
      );
      this.swapOrderService.addEscrowSrcWithdrawTxHash(
        orderHash,
        escrowSrcWithdrawTxHash
      );

      // Withdraw from destination escrow
      const escrowDstWithdrawTxHash = await dstResolver.withdrawEscrowDst(
        order,
        secret
      );
      this.swapOrderService.addEscrowDstWithdrawTxHash(
        orderHash,
        escrowDstWithdrawTxHash
      );
    } catch (error) {
      logger.error('Failed to reveal secret via relayer', { error, orderHash });
      throw new SwapError('Failed to reveal secret', 'RELAYER_REVEAL_FAILED', {
        orderHash,
      });
    }
  }

  // ============================================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================================

  /**
   * Get EVM resolver for specific chain
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
   * Get chain resolver with unified interface
   */
  private getChainResolver(chainId: number): ChainResolver {
    const isSuiChain = chainId === 101 || chainId === 1; // Assuming 101 is Sui chain ID or 1 in our test

    if (isSuiChain) {
      return new SuiResolverWrapper(this.suiResolver);
    } else {
      return new EvmResolverWrapper(this.getResolver(chainId));
    }
  }

  /**
   * Generate order typed data for EIP-712 signing
   */
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

  /**
   * Calculate order hash from typed data
   */
  private orderHash(typedData: Sdk.EIP712TypedData): string {
    return ethers.TypedDataEncoder.hash(
      typedData.domain,
      { Order: typedData.types[typedData.primaryType] },
      typedData.message
    );
  }

  /**
   * Create EVM cross-chain order
   */
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
      makingAmount: parseUnits(userIntent.tokenAmount.toString(), 6), // TODO: take decimals from config
      takingAmount:
        userIntent.dstChainAsset === '0x2::sui::SUI'
          ? parseUnits(userIntent.tokenAmount, 9)
          : parseUnits(userIntent.tokenAmount, 6), // TODO: take decimals from config
      makerAsset: Sdk.EvmAddress.fromString(userIntent.srcChainAsset),
      takerAsset: SuiAddress.fromString(
        userIntent.dstChainAsset.split('::')[0]
      ),
      receiver: SuiAddress.fromString(userIntent.receiver),
    };

    const escrowParams = {
      hashLock: hashLock,
      timeLocks: Sdk.TimeLocks.new({
        srcWithdrawal: 5n, // TODO: 5sec finality lock for test
        srcPublicWithdrawal: 120n, // TODO: 2m for private withdrawal
        srcCancellation: 121n, // TODO: 1sec public withdrawal
        srcPublicCancellation: 122n, // TODO: 1sec private cancellation
        dstWithdrawal: 10n, // TODO: 10sec finality lock for test
        dstPublicWithdrawal: 100n, // TODO: 100sec private withdrawal
        dstCancellation: 101n, // TODO: 1sec public withdrawal
      }),
      srcChainId: userIntent.srcChainId as Sdk.EvmChain,
      dstChainId: userIntent.dstChainId as Sdk.SupportedChain,
      srcSafetyDeposit: parseEther('0.000001'), //TODO: take from config
      dstSafetyDeposit: parseUnits('0.000001', 9), //TODO: take from config
    };

    const resolverAddress = Sdk.EvmAddress.fromString(
      resolver.getResolverAddress()
    );

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

  /**
   * Wait until the current Unix timestamp exceeds the target time
   */
  private async waitUntilTime(targetTime: bigint): Promise<void> {
    const getCurrentUnixTime = (): bigint =>
      BigInt(Math.floor(Date.now() / 1000));

    logger.info('Waiting until target time', {
      targetTime: targetTime.toString(),
      currentTime: getCurrentUnixTime().toString(),
    });

    while (getCurrentUnixTime() < targetTime) {
      // Check every 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Target time reached, proceeding with operation', {
      targetTime: targetTime.toString(),
      currentTime: getCurrentUnixTime().toString(),
    });
  }
}
