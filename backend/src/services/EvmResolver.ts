import { EvmClient } from './EvmClient';
import { ResolverConfig, EvmSwapOrder } from '../types';
import logger from '../utils/logger';
import { Interface, Signature, TransactionRequest } from 'ethers';
import * as Sdk from '@1inch/cross-chain-sdk';
import Resolver from '../contracts/Resolver.json';

export class EvmResolver {
  private evmClient: EvmClient;
  private config: ResolverConfig;
  private readonly resolverContract = new Interface(Resolver.abi);

  constructor(evmClient: EvmClient, config: ResolverConfig) {
    this.evmClient = evmClient;
    this.config = config;

    logger.info('EvmResolver initialized', {
      chainId: config.chainId,
    });
  }

  public async deployEscrowSrc(swapOrder: EvmSwapOrder): Promise<string> {
    const fillAmount = swapOrder.order.makingAmount;
    const deploySrcTx = this.createDeploySrcTx(
      this.config.chainId,
      swapOrder.order,
      swapOrder.orderHash,
      swapOrder.signature!,
      Sdk.TakerTraits.default()
        .setExtension(swapOrder.order.extension)
        .setAmountMode(Sdk.AmountMode.maker)
        .setAmountThreshold(swapOrder.order.takingAmount),
      fillAmount
    );

    const { txHash, blockHash: _ } = await this.evmClient.send(deploySrcTx);

    logger.info('EscrowSrc deployed', {
      chainId: this.config.chainId,
      orderHash: swapOrder.orderHash,
      txHash,
    });

    return txHash;
  }

  public async deployEscrowDst(immutables: Sdk.Immutables): Promise<string> {
    const deployDstTx = this.createDeployDstTx(immutables);

    const { txHash, blockHash: _ } = await this.evmClient.send(deployDstTx);

    logger.info('EscrowDst deployed', {
      chainId: this.config.chainId,
      orderHash: immutables.orderHash,
      txHash,
    });

    return txHash;
  }

  public async withdrawEscrowSrc(
    secret: string,
    swapOrder: EvmSwapOrder,
  ): Promise<string> {
    const immutables = Sdk.Immutables.new({
      orderHash: Buffer.from(swapOrder.orderHash, 'hex'),
      hashLock: swapOrder.order.escrowExtension.hashLockInfo,
      maker: swapOrder.order.maker,
      taker: Sdk.EvmAddress.fromString(this.config.resolver),
      token: swapOrder.order.takerAsset,
      amount: swapOrder.order.takingAmount,
      safetyDeposit: swapOrder.order.escrowExtension.srcSafetyDeposit,
      timeLocks: swapOrder.order.escrowExtension.timeLocks,
    });

    const withdrawTx = this.createWithdrawTx(secret, immutables);

    const { txHash, blockHash: _ } = await this.evmClient.send(withdrawTx);

    logger.info('EscrowSrc withdrawn', {
      chainId: this.config.chainId,
      orderHash: immutables.orderHash,
      txHash,
    });

    return txHash;
  }

  public async withdrawEscrowDst(
    secret: string,
    immutables: Sdk.Immutables
  ): Promise<string> {
    const withdrawTx = this.createWithdrawTx(secret, immutables);

    const { txHash, blockHash: _ } = await this.evmClient.send(withdrawTx);

    logger.info('EscrowDst withdrawn', {
      chainId: this.config.chainId,
      orderHash: immutables.orderHash,
      txHash,
    });

    return txHash;
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


  private createWithdrawTx(
    secret: string,
    immutables: Sdk.Immutables
  ): TransactionRequest {
    return {
      to: this.config.resolver,
      data: this.resolverContract.encodeFunctionData('withdraw', [
        this.config.escrowFactory,
        secret,
        immutables.build(),
      ]),
    };
  }

  public getEvmClient(): EvmClient {
    return this.evmClient;
  }

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
}
