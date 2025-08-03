import { EvmClient } from './EvmClient';
import { ResolverConfig, EvmSwapOrder } from '../types';
import logger from '../utils/logger';
import { id, Interface, Signature, TransactionRequest } from 'ethers';
import * as Sdk from '@1inch/cross-chain-sdk';
import Resolver from '../contracts/Resolver.json';
import EscrowFactory from '../contracts/EscrowFactory.json';

export class EvmResolver {
  private evmClient: EvmClient;
  private config: ResolverConfig;
  private readonly resolverContract = new Interface(Resolver.abi);
  private readonly escrowFactoryContract = new Interface(EscrowFactory.abi);

  constructor(evmClient: EvmClient, config: ResolverConfig) {
    this.evmClient = evmClient;
    this.config = config;

    logger.info('EvmResolver initialized', {
      chainId: config.chainId,
    });
  }

  public async deployEscrowSrc(
    swapOrder: EvmSwapOrder
  ): Promise<[txHash: string, escrowAddress: string, deployedAt: bigint]> {
    console.log('EvmResolver.deployEscrowSrc - Starting EVM deploy', {
      swapOrder,
    });

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

    console.log('EvmResolver.deployEscrowSrc - Deploying', {
      deploySrcTx,
    });

    const { txHash, blockTimestamp, blockHash } =
      await this.evmClient.send(deploySrcTx);

    console.log('EvmResolver.deployEscrowSrc - Deployed', {
      txHash,
      blockTimestamp,
      blockHash,
    });

    const escrowAddress = await this.getSrcEscrowAddress(blockHash);

    logger.info('EscrowSrc deployed', {
      chainId: this.config.chainId,
      orderHash: swapOrder.orderHash,
      txHash,
      deployedAt: blockTimestamp,
      escrow: escrowAddress,
    });

    return [txHash, escrowAddress, blockTimestamp];
  }

  public async deployEscrowDst(
    immutables: Sdk.Immutables
  ): Promise<[txHash: string, escrowAddress: string, deployedAt: bigint]> {
    console.log('EvmResolver.deployEscrowDst - Starting EVM deploy', {
      immutables,
    });

    const deployDstTx = this.createDeployDstTx(immutables);

    const { txHash, blockTimestamp, blockHash } =
      await this.evmClient.send(deployDstTx);
    const escrowAddress = await this.getDstEscrowAddress(blockHash);

    logger.info('EscrowDst deployed', {
      chainId: this.config.chainId,
      orderHash: immutables.orderHash.toString('hex'),
      txHash,
      escrow: escrowAddress,
      deployedAt: blockTimestamp,
    });

    return [txHash, escrowAddress, blockTimestamp];
  }

  public async withdrawEscrowSrc(
    escrowAddress: string,
    secret: string,
    immutables: Sdk.Immutables
  ): Promise<string> {
    console.log('EvmResolver.withdrawEscrowSrc - Starting EVM withdraw', {
      escrowAddress,
      secret,
      immutables,
    });

    const withdrawTx = this.createWithdrawTx(escrowAddress, secret, immutables);

    const { txHash, blockHash: _ } = await this.evmClient.send(withdrawTx);

    logger.info('EscrowSrc withdrawn', {
      chainId: this.config.chainId,
      orderHash: immutables.orderHash,
      txHash,
    });

    return txHash;
  }

  public async withdrawEscrowDst(
    escrowAddress: string,
    secret: string,
    immutables: Sdk.Immutables
  ): Promise<string> {
    console.log('EvmResolver.withdrawEscrowDst - Starting EVM withdraw', {
      escrowAddress,
      secret,
      immutables,
    });

    const withdrawTx = this.createWithdrawTx(escrowAddress, secret, immutables);

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
    const immBuilder = immutables.build();

    logger.info('EvmResolver.createDeployDstTx - Immutables', {
      immBuilder,
      srcCancellationTimestamp:
        immutables.timeLocks.toSrcTimeLocks().privateCancellation,
    });

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
    escrow: string,
    secret: string,
    immutables: Sdk.Immutables
  ): TransactionRequest {
    //const secretBytes = ethers.toUtf8Bytes(secret);
    const immBuilder = immutables.build();

    logger.info('EvmResolver.createWithdrawTx - Immutables', {
      escrow,
      secret,
      immBuilder,
    });

    return {
      to: this.config.resolver,
      data: this.resolverContract.encodeFunctionData('withdraw', [
        escrow,
        '0x' + secret,
        immutables.build(),
      ]),
    };
  }

  private async getDstEscrowAddress(blockHash: string): Promise<string> {
    const event = this.escrowFactoryContract.getEvent('DstEscrowCreated')!;
    const logs = await this.evmClient.getProvider().getLogs({
      blockHash,
      address: this.config.escrowFactory,
      topics: [event.topicHash],
    });

    const [data] = logs.map(l =>
      this.escrowFactoryContract.decodeEventLog(event, l.data)
    );
    const escrow = data.at(0);

    return escrow;
  }

  private async getSrcEscrowAddress(blockHash: string): Promise<string> {
    const [immutables] = await this.getSrcDeployEvent(blockHash);
    const impl = await this.getSourceImpl();
    const srcEscrowAddress = new Sdk.EvmEscrowFactory(
      Sdk.EvmAddress.fromString(this.config.escrowFactory)
    ).getSrcEscrowAddress(immutables, impl);

    return srcEscrowAddress.toString();
  }

  private async getSrcDeployEvent(
    blockHash: string
  ): Promise<[Sdk.Immutables<Sdk.EvmAddress>]> {
    const event = this.escrowFactoryContract.getEvent('SrcEscrowCreated')!;
    const logs = await this.evmClient.getProvider().getLogs({
      blockHash,
      address: this.config.escrowFactory,
      topics: [event.topicHash],
    });

    const [data] = logs.map(l =>
      this.escrowFactoryContract.decodeEventLog(event, l.data)
    );

    const immutables = data.at(0);
    //const complement = data.at(1);

    return [
      Sdk.Immutables.new({
        orderHash: immutables[0],
        hashLock: Sdk.HashLock.fromString(immutables[1]),
        maker: Sdk.EvmAddress.fromBigInt(immutables[2]),
        taker: Sdk.EvmAddress.fromBigInt(immutables[3]),
        token: Sdk.EvmAddress.fromBigInt(immutables[4]),
        amount: immutables[5],
        safetyDeposit: immutables[6],
        timeLocks: Sdk.TimeLocks.fromBigInt(immutables[7]),
      }),
      // Sdk.DstImmutablesComplement.new({
      //   maker: Sdk.EvmAddress.fromBigInt(complement[0]),
      //   amount: complement[1],
      //   token: Sdk.EvmAddress.fromBigInt(complement[2]),
      //   safetyDeposit: complement[3],
      //   taker: Sdk.EvmAddress.fromBigInt(0n),
      // }),
    ];
  }

  public async getSourceImpl(): Promise<Sdk.EvmAddress> {
    return Sdk.EvmAddress.fromBigInt(
      BigInt(
        await this.evmClient.getProvider().call({
          to: this.config.escrowFactory,
          data: id('ESCROW_SRC_IMPLEMENTATION()').slice(0, 10),
        })
      )
    );
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

  public getResolverAddress(): string {
    return this.config.resolver;
  }
}
