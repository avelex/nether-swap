import { EvmClient } from './EvmClient';
import { SuiClient } from './SuiClient';
import { SwapError, ResolverConfig, EvmSwapOrder } from '../types';
import logger from '../utils/logger';
import { Interface, Signature, TransactionRequest } from 'ethers';
import * as Sdk from '@1inch/cross-chain-sdk';
import Resolver from '../contracts/Resolver.json';
import { SwapOrderService } from './SwapOrderService';

export class EvmResolver {
  private swapOrderService: SwapOrderService;
  private evmClient: EvmClient;
  private suiClient: SuiClient;
  private config: ResolverConfig;
  private readonly resolverContract = new Interface(Resolver.abi);

  constructor(
    swapOrderService: SwapOrderService,
    evmClient: EvmClient,
    suiClient: SuiClient,
    config: ResolverConfig
  ) {
    this.swapOrderService = swapOrderService;
    this.evmClient = evmClient;
    this.suiClient = suiClient;
    this.config = config;

    logger.info('EvmResolver initialized', {
      chainId: config.chainId,
    });
  }

  /**
   * Execute swap order
   */
  public async executeSwapOrder(swapOrder: EvmSwapOrder): Promise<void> {
    try {
      logger.info('Executing swap order', {
        orderHash: swapOrder.base.orderHash,
      });

      const escrowSrcTxHash = await this.deployEscrowSrc(swapOrder);
      this.swapOrderService.addEscrowSrcTxHash(
        swapOrder.base.orderHash,
        escrowSrcTxHash
      );

      //TODO: deploy dst escrow on SUI
      //TODO: update order, set EscrowDstTxHash
      //TODO: withdraw src escrow on EVM
      //TODO: update order, set EscrowSrcWithdrawTxHash
      //TODO: withdraw dst escrow on SUI
      //TODO: update order, set EscrowDstWithdrawTxHash

      return;
    } catch (error) {
      logger.error('Failed to execute swap order', {
        error,
        orderHash: swapOrder.base.orderHash,
      });
      throw new SwapError(
        'Failed to execute swap order',
        'EXECUTE_ORDER_FAILED',
        { orderHash: swapOrder.base.orderHash }
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
      logger.info('Revealing secret', { orderHash });

      // Validate secret format
      if (!secret || secret.length < 32) {
        throw new SwapError('Invalid secret format', 'INVALID_SECRET');
      }

      // In a real implementation, this would interact with smart contracts
      // For now, we'll simulate the secret reveal process

      logger.info('Secret revealed successfully', { orderHash });

      return true;
    } catch (error) {
      logger.error('Failed to reveal secret', { error, orderHash });
      throw new SwapError('Failed to reveal secret', 'REVEAL_SECRET_FAILED', {
        orderHash,
      });
    }
  }

  /**
   * Validate user intent
   */
  // private validateUserIntent(userIntent: UserIntent): void {
  //   if (!userIntent.srcChainId || !userIntent.dstChainId) {
  //     throw new SwapError(
  //       'Source and destination chain IDs are required',
  //       'INVALID_CHAIN_ID'
  //     );
  //   }

  //   if (!userIntent.srcChainAsset || !userIntent.dstChainAsset) {
  //     throw new SwapError(
  //       'Source and destination tokens are required',
  //       'INVALID_TOKEN'
  //     );
  //   }

  //   if (!userIntent.tokenAmount || parseFloat(userIntent.tokenAmount) <= 0) {
  //     throw new SwapError('Valid amount is required', 'INVALID_AMOUNT');
  //   }

  //   if (!userIntent.userAddress || !ethers.isAddress(userIntent.userAddress)) {
  //     throw new SwapError('Valid user address is required', 'INVALID_ADDRESS');
  //   }

  //   if (userIntent.srcChainId !== this.config.chainId) {
  //     throw new SwapError(
  //       `Resolver only supports chain ${this.config.chainId}`,
  //       'UNSUPPORTED_CHAIN'
  //     );
  //   }
  // }

  public async deployEscrowSrc(swapOrder: EvmSwapOrder): Promise<string> {
    const fillAmount = swapOrder.order.makingAmount;
    const deploySrcTx = this.createDeploySrcTx(
      swapOrder.base.userIntent.srcChainId,
      swapOrder.order,
      swapOrder.base.orderHash,
      swapOrder.base.signature!,
      Sdk.TakerTraits.default()
        .setExtension(swapOrder.order.extension)
        .setAmountMode(Sdk.AmountMode.maker)
        .setAmountThreshold(swapOrder.order.takingAmount),
      fillAmount
    );

    const { txHash: orderFillHash, blockHash: _ } =
      await this.evmClient.send(deploySrcTx);

    console.log(
      `[${swapOrder.base.userIntent.srcChainId}]`,
      `Order ${swapOrder.base.orderHash} filled for ${fillAmount} in tx ${orderFillHash}`
    );

    return orderFillHash;
  }

  private createDeploySrcTx(
    chainId: number,
    order: Sdk.EvmCrossChainOrder,
    orderHash: string,
    signature: string,
    takerTraits: Sdk.TakerTraits,
    amount: bigint,
    hashLock = order.escrowExtension.hashLockInfo
  ): TransactionRequest {
    const { r, yParityAndS: vs } = Signature.from(signature);
    const { args, trait } = takerTraits.encode();
    const immutables = order.toSrcImmutables(
      chainId,
      Sdk.EvmAddress.fromString(this.config.resolver),
      amount,
      hashLock
    );

    return {
      to: this.config.resolver,
      data: this.resolverContract.encodeFunctionData('deploySrc', [
        {
          ...immutables.build(),
          orderHash: orderHash,
        },
        order.build(),
        r,
        vs,
        amount,
        trait,
        args,
      ]),
      value: order.escrowExtension.srcSafetyDeposit,
    };
  }

  private createDeployDstTx(immutables: Sdk.Immutables): TransactionRequest {
    return {
      to: this.config.resolver,
      data: this.resolverContract.encodeFunctionData('deployDst', [
        immutables.build(),
        immutables.timeLocks.toSrcTimeLocks().privateCancellation,
      ]),
      value: immutables.safetyDeposit,
    };
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

  public getEscrowFactory(): string {
    return this.config.escrowFactory;
  }

  public getLimitOrder(): string {
    return this.config.limitOrder;
  }

  public getEvmAddress(): string {
    return this.evmClient.getAddress();
  }

  public getSuiAddress(): string {
    return this.suiClient.getAddress();
  }
}
