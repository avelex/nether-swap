import {
  SuiClient,
  SuiEvent,
  SuiObjectChangeCreated,
} from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiResolverConfig } from '../types';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import logger from '../utils/logger';
import { SignatureWithBytes } from '@mysten/sui/dist/cjs/cryptography';

export class SuiResolver {
  private suiClient: SuiClient;
  private keypair: Ed25519Keypair;
  private resolverCapId: string;
  private htlcPackageId: string;

  constructor(config: SuiResolverConfig) {
    this.suiClient = new SuiClient({ url: config.rpcUrl });
    this.keypair = Ed25519Keypair.fromSecretKey(config.resolverKey);
    this.resolverCapId = config.resolverCapId;
    this.htlcPackageId = config.htlcPackageId;
    logger.info('SuiResolver initialized', {
      key: this.keypair.toSuiAddress(),
    });
  }

  public async buildSponsoredTx(
    sender: string,
    coinType: string,
    amount: number,
    hashlock: Uint8Array
  ): Promise<SignatureWithBytes> {
    const payment: Array<{
      objectId: string;
      version: string;
      digest: string;
    }> = [];
    const sponsorAddress = this.keypair.getPublicKey().toSuiAddress();

    const getCoinsParams = {
      owner: sponsorAddress,
    }

    logger.info('SuiResolver.buildSponsoredTx - Getting coins', {
      getCoinsParams,
    });

    const coins = await this.suiClient.getCoins(getCoinsParams);

    logger.info('SuiResolver.buildSponsoredTx - Coins', {
      coins,
    });

    if (coins.data.length > 0) {
      payment.push(
        ...coins.data.map(coin => ({
          objectId: coin.coinObjectId,
          version: coin.version,
          digest: coin.digest,
        }))
      );
    }

    if (payment.length === 0) {
      throw new Error('No coins found for gas payment');
    }

    const tx = new Transaction();
    const { coinId } = await this.prepareCoinForAmount(
      tx,
      sender,
      coinType,
      amount
    );
    const [userDepositCoin] = tx.splitCoins(tx.object(coinId), [amount]);

    try {
      tx.moveCall({
        target: `${this.htlcPackageId}::escrow_src_builder::create_src_builder`,
        typeArguments: [coinType],
        arguments: [
          userDepositCoin,
          tx.pure.address(sponsorAddress),
          tx.pure.vector('u8', Array.from(hashlock)),
          tx.object('0x6'), // Clock object
        ],
      });

      console.log('SuiResolver.buildSponsoredTx - moveCall added successfully');
    } catch (error) {
      console.error('SuiResolver.buildSponsoredTx - Error in moveCall', {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
                code: (error as any).code,
              }
            : error,
      });
      throw error;
    }

    tx.setSender(sender);
    tx.setGasOwner(sponsorAddress);
    tx.setGasPayment(payment);
    tx.setGasBudget(5_000_000);

    const builtTx = await tx.build({ client: this.suiClient });
    const result = await this.keypair.signTransaction(builtTx);
    return result;
  }

  async prepareCoinForAmount(
    tx: Transaction,
    owner: string,
    coinType: string,
    amount: number
  ): Promise<{
    coinId: string;
    payment: Array<{ objectId: string; version: string; digest: string }>;
  }> {
    const coinsResponse = await this.suiClient.getCoins({ owner, coinType });
    const coins = coinsResponse.data.map(coin => ({
      objectId: coin.coinObjectId,
      balance: BigInt(coin.balance),
      version: coin.version,
      digest: coin.digest,
    }));

    const payment = coins.map(({ objectId, version, digest }) => ({
      objectId,
      version,
      digest,
    }));

    // Try to find one coin that has enough balance
    const enoughCoin = coins.find(coin => coin.balance >= amount);
    if (enoughCoin) {
      return { coinId: enoughCoin.objectId, payment };
    }

    // Not enough in a single coin — need to merge
    const sorted = [...coins].sort((a, b) => Number(b.balance - a.balance));

    let total = 0n;
    const coinObjects: string[] = [];

    for (const coin of sorted) {
      total += coin.balance;
      coinObjects.push(coin.objectId);
      if (total >= amount) break;
    }

    if (total < amount) {
      throw new Error('Insufficient funds in all coins combined');
    }

    // Use first as target, merge the rest
    const [firstCoin, ...rest] = coinObjects;
    tx.mergeCoins(
      tx.object(firstCoin),
      rest.map(coin => tx.object(coin))
    );

    return { coinId: firstCoin, payment };
  }

  public async deployEscrowSrc(
    sender: string,
    coinType: string,
    amount: number,
    hashlock: Uint8Array,
    userSign: string
  ): Promise<{
    txSignature: string;
    escrowObjectId: string;
    deployedAt: bigint;
    withdrawAt: bigint;
  }> {
    const sponsorSig = await this.buildSponsoredTx(
      sender,
      coinType,
      amount,
      hashlock
    );
    const result = await this.suiClient.executeTransactionBlock({
      transactionBlock: sponsorSig.bytes,
      signature: [userSign, sponsorSig.signature],
      requestType: 'WaitForLocalExecution',
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    const finalResult = await this.suiClient.waitForTransaction({
      digest: result.digest,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    console.log(
      'SuiResolver.deployEscrowSrc - executeTransactionBlock completed',
      {
        digest: finalResult.digest,
        objectChangesCount: finalResult.objectChanges?.length || 0,
        events: finalResult.events,
      }
    );

    const builderObjectId = finalResult.objectChanges?.find(
      (change): change is SuiObjectChangeCreated =>
        change.type === 'created' &&
        change.objectType.includes('EscrowSrcBuilder')
    )?.objectId;

    if (!builderObjectId) {
      throw new Error('Builder object ID not found in objectChanges');
    }

    console.log('  EscrowSrcBuilder: ', builderObjectId);
    const tx = new Transaction();

    // Split safety deposit from gas
    const [safetyDepositCoin] = tx.splitCoins(tx.gas, [111_111]);

    // Complete escrow with resolver's safety deposit
    tx.moveCall({
      target: `${this.htlcPackageId}::escrow_src_builder::complete_escrow`,
      typeArguments: [coinType],
      arguments: [
        tx.object(builderObjectId),
        safetyDepositCoin,
        tx.object(this.resolverCapId),
        tx.object('0x6'), // Clock object
      ],
    });

    tx.setGasBudget(5_000_000);

    const escrowResult = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showBalanceChanges: true,
      },
    });

    const finalEscrowResult = await this.suiClient.waitForTransaction({
      digest: escrowResult.digest,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    const escrowObjectId = finalEscrowResult.objectChanges?.find(
      (change): change is SuiObjectChangeCreated =>
        change.type === 'created' && change.objectType.includes('Escrow')
    )?.objectId;

    if (!escrowObjectId) {
      throw new Error('Could not find escrow object ID in result');
    }

    // Parse timestampMs into BigInt(time unix in seconds)
    const deployedAt =
      finalEscrowResult.timestampMs != null &&
      finalEscrowResult.timestampMs !== undefined
        ? BigInt(finalEscrowResult.timestampMs) / 1000n
        : BigInt(Math.floor(Date.now() / 1000));

    const escrowCreatedEvent = finalEscrowResult.events?.find(
      (event): event is SuiEvent => event.type.includes('EscrowCreated')
    )?.parsedJson as any;

    // Extract withdrawal_time from the event (convert from milliseconds to seconds)
    const withdrawAt = escrowCreatedEvent?.withdrawal_time
      ? BigInt(escrowCreatedEvent.withdrawal_time) / 1000n
      : deployedAt + 15n;

    logger.info('EscrowSrc deployed', {
      chainId: 'SUI',
      escrowId: escrowObjectId,
      txHash: finalEscrowResult.digest,
      deployedAt,
      withdrawAt,
    });

    return {
      txSignature: escrowResult.digest,
      escrowObjectId,
      deployedAt,
      withdrawAt,
    };
  }

  public async withdrawEscrowSrc(
    escrowObjectId: string,
    secret: string,
    coinT: string
  ): Promise<string> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.htlcPackageId}::escrow_src::withdraw`,
      typeArguments: [coinT],
      arguments: [
        tx.object(escrowObjectId),
        tx.pure.vector('u8', Buffer.from(secret, 'hex')),
        tx.object(this.resolverCapId),
        tx.object('0x6'), // Clock object
      ],
    });

    tx.setGasBudget(5_000_000);

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showBalanceChanges: true,
      },
    });

    const finalResult = await this.suiClient.waitForTransaction({
      digest: result.digest,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    return finalResult.digest;
  }

  public async withdrawEscrowDst(
    escrowObjectId: string,
    secret: string,
    coinT: string
  ): Promise<string> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.htlcPackageId}::escrow_dst::withdraw`,
      typeArguments: [coinT],
      arguments: [
        tx.object(escrowObjectId),
        tx.pure.vector('u8', Buffer.from(secret, 'hex')),
        tx.object(this.resolverCapId),
        tx.object('0x6'), // Clock object
      ],
    });

    tx.setGasBudget(5_000_000);

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showBalanceChanges: true,
      },
    });

    const finalResult = await this.suiClient.waitForTransaction({
      digest: result.digest,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    return finalResult.digest;
  }

  public async deployEscrowDst(
    recipient: string,
    amount: bigint,
    hashlock: Buffer,
    safetyDeposit: bigint,
    coinT: string
  ): Promise<{ txSignature: string; escrowObjectId: string; deployedAt: bigint; withdrawAt: bigint }> {
    console.log('SuiResolver.deployEscrowDst - Starting SUI deploy', {
      recipient,
      amount,
      hashlock,
      safetyDeposit,
      coinT,
    });

    const tx = new Transaction();
    
    let escrowDepositCoin;
    
    // Handle different coin types
    if (coinT === '0x2::sui::SUI') {
      // For SUI, split from gas
      [escrowDepositCoin] = tx.splitCoins(tx.gas, [amount]);
    } else {
      // For other tokens (like USDC), get the appropriate coins
      const resolverAddress = this.getResolverAddress();
      const { coinId } = await this.prepareCoinForAmount(
        tx,
        resolverAddress,
        coinT,
        Number(amount)
      );
      [escrowDepositCoin] = tx.splitCoins(tx.object(coinId), [amount]);
    }
    
    // Safety deposit is always SUI
    const [safetyDepositCoin] = tx.splitCoins(tx.gas, [safetyDeposit]);

    // Create destination escrow with both deposits in one call

    tx.moveCall({
      target: `${this.htlcPackageId}::escrow_dst::create_dst_escrow`,
      typeArguments: [coinT],
      arguments: [
        escrowDepositCoin,
        safetyDepositCoin,
        tx.pure.address(recipient),
        tx.pure.vector('u8', Array.from(hashlock)),
        tx.object(this.resolverCapId),
        tx.object('0x6'), // Clock object
      ],
    });

    tx.setGasBudget(5_000_000);

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showBalanceChanges: true,
      },
    });

    console.log('SuiResolver.deployEscrowDst - executeTransactionBlock completed', {
      digest: result.digest,
      objectChangesCount: result.objectChanges?.length || 0,
      events: result.events,
    });

    const finalResult = await this.suiClient.waitForTransaction({
      digest: result.digest,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    console.log('SuiResolver.deployEscrowDst - waitForTransaction completed', {
      digest: finalResult.digest,
      objectChangesCount: finalResult.objectChanges?.length || 0,
      events: finalResult.events,
    });

    const escrowObjectId = finalResult.objectChanges?.find(
      (change): change is SuiObjectChangeCreated =>
        change.type === 'created' && change.objectType.includes('Escrow')
    )?.objectId;

    if (!escrowObjectId) {
      console.error('SuiResolver.deployEscrowDst - Could not find escrow object ID in result', {
        finalResult,
      });

      throw new Error('Could not find escrow object ID in result');
    }

    const deployedAt =
      finalResult.timestampMs != null &&
      finalResult.timestampMs !== undefined
        ? BigInt(finalResult.timestampMs) / 1000n
        : BigInt(Math.floor(Date.now() / 1000));

    console.log('SuiResolver.deployEscrowDst - deployedAt', {
      deployedAt,
    });

    const escrowCreatedEvent = finalResult.events?.find(
      (event): event is SuiEvent => event.type.includes('EscrowCreated')
    )?.parsedJson as any;

    console.log('SuiResolver.deployEscrowDst - escrowCreatedEvent', {
      escrowCreatedEvent,
    });

    // Extract withdrawal_time from the event (convert from milliseconds to seconds)
    const withdrawAt = escrowCreatedEvent?.withdrawal_time
      ? BigInt(escrowCreatedEvent.withdrawal_time) / 1000n
      : deployedAt + 15n;

    logger.info('EscrowDst deployed', {
      chainId: 'SUI',
      escrowId: escrowObjectId,
      txHash: finalResult.digest,
      deployedAt,
      withdrawAt,
    });

    return { escrowObjectId, txSignature: result.digest, deployedAt, withdrawAt };
  }

  public getSuiClient(): SuiClient {
    return this.suiClient;
  }

  public getResolverAddress(): string {
    return this.keypair.getPublicKey().toSuiAddress();
  }
}
