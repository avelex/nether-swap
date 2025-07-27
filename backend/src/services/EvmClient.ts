import { ethers, JsonRpcProvider, Wallet } from 'ethers';
import logger from '../utils/logger';
import { ChainError } from '../types';

export class EvmClient {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private chainId: number;

  constructor(rpcUrl: string, privateKey: string, chainId: number) {
    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      this.wallet = new Wallet(privateKey, this.provider);
      this.chainId = chainId;
      
      logger.info('EvmClient initialized', { 
        chainId, 
        walletAddress: this.wallet.address 
      });
    } catch (error) {
      logger.error('Failed to initialize EvmClient', { error, chainId });
      throw new ChainError(`Failed to initialize EVM client for chain ${chainId}`, chainId);
    }
  }

  /**
   * Get the current block number
   */
  public async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      logger.error('Failed to get block number', { error, chainId: this.chainId });
      throw new ChainError(`Failed to get block number for chain ${this.chainId}`, this.chainId);
    }
  }

  /**
   * Get wallet address
   */
  public getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get wallet balance
   */
  public async getBalance(): Promise<string> {
    try {
      const balance = await this.provider.getBalance(this.wallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error('Failed to get wallet balance', { error, chainId: this.chainId });
      throw new ChainError(`Failed to get balance for chain ${this.chainId}`, this.chainId);
    }
  }

  /**
   * Get token balance
   */
  public async getTokenBalance(tokenAddress: string): Promise<string> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function balanceOf(address owner) view returns (uint256)',
          'function decimals() view returns (uint8)',
        ],
        this.provider
      );

      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(this.wallet.address),
        tokenContract.decimals(),
      ]);

      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      logger.error('Failed to get token balance', { 
        error, 
        tokenAddress, 
        chainId: this.chainId 
      });
      throw new ChainError(
        `Failed to get token balance for ${tokenAddress} on chain ${this.chainId}`, 
        this.chainId
      );
    }
  }

  /**
   * Send native token
   */
  public async sendNativeToken(to: string, amount: string): Promise<string> {
    try {
      const tx = await this.wallet.sendTransaction({
        to,
        value: ethers.parseEther(amount),
      });

      logger.info('Native token sent', {
        txHash: tx.hash,
        to,
        amount,
        chainId: this.chainId,
      });

      return tx.hash;
    } catch (error) {
      logger.error('Failed to send native token', { 
        error, 
        to, 
        amount, 
        chainId: this.chainId 
      });
      throw new ChainError(
        `Failed to send native token on chain ${this.chainId}`, 
        this.chainId
      );
    }
  }

  /**
   * Send token
   */
  public async sendToken(tokenAddress: string, to: string, amount: string): Promise<string> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
        ],
        this.wallet
      );

      const decimals = await tokenContract.decimals();
      const amountWei = ethers.parseUnits(amount, decimals);

      const tx = await tokenContract.transfer(to, amountWei);

      logger.info('Token sent', {
        txHash: tx.hash,
        tokenAddress,
        to,
        amount,
        chainId: this.chainId,
      });

      return tx.hash;
    } catch (error) {
      logger.error('Failed to send token', { 
        error, 
        tokenAddress, 
        to, 
        amount, 
        chainId: this.chainId 
      });
      throw new ChainError(
        `Failed to send token ${tokenAddress} on chain ${this.chainId}`, 
        this.chainId
      );
    }
  }

  /**
   * Sign message
   */
  public async signMessage(message: string): Promise<string> {
    try {
      return await this.wallet.signMessage(message);
    } catch (error) {
      logger.error('Failed to sign message', { error, chainId: this.chainId });
      throw new ChainError(`Failed to sign message on chain ${this.chainId}`, this.chainId);
    }
  }

  /**
   * Get transaction receipt
   */
  public async getTransactionReceipt(txHash: string): Promise<any> {
    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      logger.error('Failed to get transaction receipt', { 
        error, 
        txHash, 
        chainId: this.chainId 
      });
      throw new ChainError(
        `Failed to get transaction receipt for ${txHash} on chain ${this.chainId}`, 
        this.chainId
      );
    }
  }

  /**
   * Wait for transaction confirmation
   */
  public async waitForTransaction(txHash: string, confirmations = 1): Promise<any> {
    try {
      return await this.provider.waitForTransaction(txHash, confirmations);
    } catch (error) {
      logger.error('Failed to wait for transaction', { 
        error, 
        txHash, 
        confirmations, 
        chainId: this.chainId 
      });
      throw new ChainError(
        `Failed to wait for transaction ${txHash} on chain ${this.chainId}`, 
        this.chainId
      );
    }
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

  /**
   * Get wallet
   */
  public getWallet(): Wallet {
    return this.wallet;
  }
} 