import { ethers, JsonRpcProvider, Signer, TransactionRequest, Wallet } from 'ethers';
import logger from '../utils/logger';
import { ChainError } from '../types';

export class EvmClient {
  private provider: JsonRpcProvider;
  private signer: Signer;
  private chainId: number;
  private address: string;

  constructor(rpcUrl: string, privateKey: string, chainId: number) {
    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      const wallet = new Wallet(privateKey, this.provider);

      this.signer = wallet;
      this.chainId = chainId;
      this.address = wallet.address;

      logger.info('EvmClient initialized', {
        chainId,
        address: wallet.address,
      });
    } catch (error) {
      logger.error('Failed to initialize EvmClient', { error, chainId });
      throw new ChainError(
        `Failed to initialize EVM client for chain ${chainId}`,
        chainId
      );
    }
  }

  /**
   * Get the current block number
   */
  public async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      logger.error('Failed to get block number', {
        error,
        chainId: this.chainId,
      });
      throw new ChainError(
        `Failed to get block number for chain ${this.chainId}`,
        this.chainId
      );
    }
  }

  /**
   * Get wallet address
   */
  public getAddress(): string {
    return this.address;
  }

  /**
   * Get wallet balance
   */
  public async getBalance(): Promise<string> {
    try {
      const balance = await this.provider.getBalance(await this.signer.getAddress());
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error('Failed to get wallet balance', {
        error,
        chainId: this.chainId,
      });
      throw new ChainError(
        `Failed to get balance for chain ${this.chainId}`,
        this.chainId
      );
    }
  }
  
  public async send(
    param: TransactionRequest
  ): Promise<{ txHash: string; blockTimestamp: bigint; blockHash: string }> {
    const nonce = await this.signer.getNonce();
    param.nonce = nonce;

    const res = await this.signer.sendTransaction({
      ...param,
      gasLimit: 1_000_000,
      from: this.getAddress(),
    });
    const receipt = await res.wait(3); //TODO: wait for 3 blocks, take from config

    if (receipt && receipt.status) {
      const block = await this.provider.getBlock(receipt.blockHash);

      return {
        txHash: receipt.hash,
        blockTimestamp: BigInt(block!.timestamp),
        blockHash: receipt.blockHash,
      };
    }

    throw new Error((await receipt?.getResult()) || 'unknown error');
  }

  /**
   * Get chain ID
   */
  public getChainId(): number {
    return this.chainId;
  }

  /**
   * Get provider
   */
  public getProvider(): JsonRpcProvider {
    return this.provider;
  }
}
