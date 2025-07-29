import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiResolverConfig } from '../types';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import logger from '../utils/logger';

// import pkg from 'js-sha3';
// const { keccak256 } = pkg;

export class SuiResolver {
  private suiClient: SuiClient;
  private keypair: Ed25519Keypair;
  private resolverCapId: string;
  private htlcPackageId: string;

  constructor(config: SuiResolverConfig) {
    this.suiClient = new SuiClient({ url: config.rpcUrl })
    this.keypair = Ed25519Keypair.fromSecretKey(config.resolverKey);
    this.resolverCapId = config.resolverCapId;
    this.htlcPackageId= config.htlcPackageId;
    logger.info('SuiResolver initialized');
  }

//   public async sponsorEscrowDst(swapOrder: EvmSwapOrder): Promise<string> {
//     return "todo";
//   }
//   public async deployEscrowSrc(swapOrder: EvmSwapOrder): Promise<string> {
//     return "todo";
//   }
//   public async withdrawSrc(swapOrder: EvmSwapOrder): Promise<string> {
//     return "todo";
//   }
    // public async withdrawDst(
    //     swapOrder: EvmSwapOrder,
    //     coinT: string = "0x2::sui::Coin",
    //     // takerKeypair,
    //     // escrowObjectId,
    //     // secret,
    //     // coinType = '0x2::sui::SUI',
    //     // gasAmount = 5_000_000,
    // ): Promise<string> {
    //     const tx = new Transaction();

    //     tx.moveCall({
    //         target: `${this.htlcPackageId}::escrow_dst::withdraw`,
    //         typeArguments: [coinType],
    //         arguments: [
    //         tx.object(escrowObjectId),
    //         tx.pure.vector('u8', Array.from(secret)),
    //         tx.object(this.resolverCapId),
    //         tx.object('0x6') // Clock object
    //         ],
    //     });

    //     tx.setGasBudget(5_000_000);

    //     const result = await this.suiClient.signAndExecuteTransaction({
    //         signer: this.keypair,
    //         transaction: tx,
    //         options: { 
    //             showEffects: true, 
    //             showObjectChanges: true,
    //             showBalanceChanges: true 
    //         },
    //     });

    //     return result.digest;
    // }

  public async deployEscroyDst(
    recipient: string,
    coinT: string = "0x2::sui::Coin",
    amount: bigint,
    hashlock: Buffer,
    safetyDeposit: bigint,
  ): Promise<string> {

    const tx = new Transaction();
    // Split escrow deposit from gas (for SUI) or from specific coin
    const [escrowDepositCoin] = tx.splitCoins(tx.gas, [amount]);
    
    // Split safety deposit from gas (always SUI)
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
        tx.object('0x6') // Clock object
      ],
    });

    tx.setGasBudget(5_000_000);

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
      options: { 
        showEffects: true, 
        showObjectChanges: true,
        showBalanceChanges: true 
      },
    });

    logger.info('EscrowDst deployed', {
      chainId: "SUI",
      txHash: result.digest,
    });

    return result.digest;
  }

  public getSuiClient(): SuiClient {
    return this.suiClient;
  }
}