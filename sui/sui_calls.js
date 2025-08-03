// sui_calls.js - Client for the new escrow system with src/dst separation
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import dotenv from 'dotenv';

dotenv.config();

// HTLC Package ID
const HTLC_PACKAGE_ID = '0x8748bca439c6e509d6ec627ebad1746adb730388fab89f468c0f562d4bef963b';
const RESOLVER_CAP_ID = '0xe918d86bcc0bd7fe32fb4a3de27aa278712738b536e0dbdfd362bda5bf41530a';
const client = new SuiClient({ url: process.env.SUI_RPC });

// =====================================================
// SOURCE ESCROW BUILDER FUNCTIONS
// =====================================================

/**
 * Step 1: User creates escrow builder with their deposit
 * @param {Ed25519Keypair} userKeypair - User's keypair
 * @param {number} depositAmount - User's deposit amount
 * @param {string} recipientAddress - Recipient address (taker/resolver)
 * @param {Uint8Array} hashLock - Keccak256 hash lock
 * @param {string} coinType - Type of coin for escrow (default: SUI)
 * @param {number} gasAmount - Gas budget
 */
async function createSrcBuilder(
  userKeypair,
  depositAmount,
  recipientAddress,
  hashLock,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  // Split user deposit from gas
  const [userDepositCoin] = tx.splitCoins(tx.gas, [depositAmount]);

  // Create escrow builder with user's deposit
  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src_builder::create_src_builder`,
    typeArguments: [coinType],
    arguments: [
      userDepositCoin,
      tx.pure.address(recipientAddress),
      tx.pure.vector('u8', Array.from(hashLock)),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: userKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Build createSrcBuilder transaction for sponsored execution
 * @param {string} fromAddress - User's address (transaction sender)
 * @param {string} coinId - User's coin object ID
 * @param {number} amount - User's deposit amount
 * @param {string} recipientAddress - Recipient address
 * @param {Uint8Array} hashLock - Keccak256 hash lock
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function buildCreateSrcBuilderTransaction(
  fromAddress,
  coinId,
  amount,
  recipientAddress,
  hashLock,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  // Set user as sender (they provide the coin)
  tx.setSender(fromAddress);
  tx.setGasBudget(gasAmount);

  // Split user deposit from their coin
  const [userDepositCoin] = tx.splitCoins(tx.object(coinId), [amount]);

  // Create escrow builder with user's deposit
  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src_builder::create_src_builder`,
    typeArguments: [coinType],
    arguments: [
      userDepositCoin,
      tx.pure.address(recipientAddress),
      tx.pure.vector('u8', Array.from(hashLock)),
      tx.object('0x6') // Clock object
    ],
  });

  // Build transaction bytes for signing (for sponsored execution)
  const txBytes = await tx.build({ client, onlyTransactionKind: true });
  
  return {
    transactionBytes: txBytes,
    transaction: tx
  };
}

/**
 * Step 2: Resolver adds safety deposit to complete escrow
 * @param {Ed25519Keypair} resolverKeypair - Resolver's keypair
 * @param {string} builderObjectId - ID of the escrow builder object
 * @param {number} safetyDepositAmount - Amount of safety deposit (SUI)
 * @param {string} coinType - Type of coin for escrow (default: SUI)
 * @param {number} gasAmount - Gas budget
 */
async function completeSrcEscrow(
  resolverKeypair,
  builderObjectId,
  safetyDepositAmount,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  // Split safety deposit from gas
  const [safetyDepositCoin] = tx.splitCoins(tx.gas, [safetyDepositAmount]);

  // Complete escrow with resolver's safety deposit
  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src_builder::complete_escrow`,
    typeArguments: [coinType],
    arguments: [
      tx.object(builderObjectId),
      safetyDepositCoin,
      tx.object(RESOLVER_CAP_ID),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: resolverKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Refund expired builder (if resolver doesn't complete within timeout)
 * @param {Ed25519Keypair} userKeypair - User's keypair
 * @param {string} builderObjectId - ID of the escrow builder object
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function refundExpiredBuilder(
  userKeypair,
  builderObjectId,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src_builder::refund_expired`,
    typeArguments: [coinType],
    arguments: [
      tx.object(builderObjectId),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: userKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

// =====================================================
// SOURCE ESCROW FUNCTIONS
// =====================================================

/**
 * Withdraw tokens from source escrow with secret (private withdrawal - only taker)
 * @param {Ed25519Keypair} takerKeypair - Taker's keypair
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {Uint8Array} secret - Secret for withdrawal
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function withdrawSrcEscrow(
  takerKeypair,
  escrowObjectId,
  secret,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src::withdraw`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.pure.vector('u8', Array.from(secret)),
      tx.object(RESOLVER_CAP_ID), 
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: takerKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Withdraw tokens from source escrow to specific address (private withdrawal - only taker)
 * @param {Ed25519Keypair} takerKeypair - Taker's keypair
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {Uint8Array} secret - Secret for withdrawal
 * @param {string} targetAddress - Address to send tokens to
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function withdrawSrcEscrowTo(
  takerKeypair,
  escrowObjectId,
  secret,
  targetAddress,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src::withdraw_to`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.pure.vector('u8', Array.from(secret)),
      tx.pure.address(targetAddress),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: takerKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Public withdrawal from source escrow (requires ResolverCap)
 * @param {Ed25519Keypair} resolverKeypair - Resolver's keypair (must have ResolverCap)
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {Uint8Array} secret - Secret for withdrawal
 * @param {string} resolverCapId - ID of the ResolverCap object
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function publicWithdrawSrcEscrow(
  resolverKeypair,
  escrowObjectId,
  secret,
  resolverCapId,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src::public_withdraw`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.pure.vector('u8', Array.from(secret)),
      tx.object(resolverCapId),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: resolverKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Cancel source escrow (private cancellation - only taker)
 * @param {Ed25519Keypair} takerKeypair - Taker's keypair
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function cancelSrcEscrow(
  takerKeypair,
  escrowObjectId,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src::cancel`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: takerKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Public cancel source escrow (requires ResolverCap)
 * @param {Ed25519Keypair} resolverKeypair - Resolver's keypair (must have ResolverCap)
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {string} resolverCapId - ID of the ResolverCap object
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function publicCancelSrcEscrow(
  resolverKeypair,
  escrowObjectId,
  resolverCapId,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_src::public_cancel`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.object(resolverCapId),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: resolverKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

// =====================================================
// DESTINATION ESCROW FUNCTIONS
// =====================================================

/**
 * Create destination escrow in one transaction (taker provides both deposits)
 * @param {Ed25519Keypair} takerKeypair - Taker's keypair (resolver)
 * @param {number} escrowDepositAmount - Amount for escrow deposit
 * @param {number} safetyDepositAmount - Amount for safety deposit (in SUI)
 * @param {string} makerAddress - Maker address (user who will receive tokens)
 * @param {Uint8Array} hashLock - Keccak256 hash lock
 * @param {string} escrowCoinType - Type of coin for escrow deposit
 * @param {number} gasAmount - Gas budget
 */
async function createDstEscrow(
  takerKeypair,
  escrowDepositAmount,
  safetyDepositAmount,
  makerAddress,
  hashLock,
  escrowCoinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  // Split escrow deposit from gas (for SUI) or from specific coin
  const [escrowDepositCoin] = tx.splitCoins(tx.gas, [escrowDepositAmount]);
  
  // Split safety deposit from gas (always SUI)
  const [safetyDepositCoin] = tx.splitCoins(tx.gas, [safetyDepositAmount]);

  // Create destination escrow with both deposits in one call
  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_dst::create_dst_escrow`,
    typeArguments: [escrowCoinType],
    arguments: [
      escrowDepositCoin,
      safetyDepositCoin,
      tx.pure.address(makerAddress),
      tx.pure.vector('u8', Array.from(hashLock)),
      tx.object(RESOLVER_CAP_ID),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: takerKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Withdraw tokens from destination escrow with secret (private withdrawal - only taker)
 * @param {Ed25519Keypair} takerKeypair - Taker's keypair
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {Uint8Array} secret - Secret for withdrawal
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function withdrawDstEscrow(
  takerKeypair,
  escrowObjectId,
  secret,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_dst::withdraw`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.pure.vector('u8', Array.from(secret)),
      tx.object(RESOLVER_CAP_ID),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: takerKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Public withdrawal from destination escrow (requires ResolverCap)
 * @param {Ed25519Keypair} resolverKeypair - Resolver's keypair (must have ResolverCap)
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {Uint8Array} secret - Secret for withdrawal
 * @param {string} resolverCapId - ID of the ResolverCap object
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function publicWithdrawDstEscrow(
  resolverKeypair,
  escrowObjectId,
  secret,
  resolverCapId,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_dst::public_withdraw`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.pure.vector('u8', Array.from(secret)),
      tx.object(resolverCapId),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: resolverKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Cancel destination escrow (private cancellation - only taker)
 * @param {Ed25519Keypair} takerKeypair - Taker's keypair
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {string} coinType - Type of coin for escrow
 * @param {number} gasAmount - Gas budget
 */
async function cancelDstEscrow(
  takerKeypair,
  escrowObjectId,
  coinType = '0x2::sui::SUI',
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::escrow_dst::cancel`,
    typeArguments: [coinType],
    arguments: [
      tx.object(escrowObjectId),
      tx.object('0x6') // Clock object
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: takerKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

// =====================================================
// CAPABILITY MANAGEMENT FUNCTIONS
// =====================================================

/**
 * Grant ResolverCap to a user (only admin can call)
 * @param {Ed25519Keypair} adminKeypair - Admin's keypair (must have AdminCap)
 * @param {string} adminCapId - ID of the AdminCap object
 * @param {string} recipientAddress - Address to grant ResolverCap to
 * @param {number} gasAmount - Gas budget
 */
async function grantResolverCap(
  adminKeypair,
  adminCapId,
  recipientAddress,
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::capabilities::grant_resolver_cap`,
    arguments: [
      tx.object(adminCapId),
      tx.pure.address(recipientAddress)
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: adminKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

/**
 * Revoke ResolverCap from a user (only admin can call)
 * @param {Ed25519Keypair} adminKeypair - Admin's keypair (must have AdminCap)
 * @param {string} adminCapId - ID of the AdminCap object
 * @param {string} resolverCapId - ID of the ResolverCap object to revoke
 * @param {number} gasAmount - Gas budget
 */
async function revokeResolverCap(
  adminKeypair,
  adminCapId,
  resolverCapId,
  gasAmount = 5_000_000
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${HTLC_PACKAGE_ID}::capabilities::revoke_resolver_cap`,
    arguments: [
      tx.object(adminCapId),
      tx.object(resolverCapId)
    ],
  });

  tx.setGasBudget(gasAmount);

  const result = await client.signAndExecuteTransaction({
    signer: adminKeypair,
    transaction: tx,
    options: { 
      showEffects: true, 
      showObjectChanges: true,
      showBalanceChanges: true 
    },
  });

  return result;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Get source escrow contract information
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {string} coinType - Type of coin for escrow
 */
async function getSrcEscrowInfo(escrowObjectId, coinType = '0x2::sui::SUI') {
  try {
    const result = await client.devInspectTransactionBlock({
      transactionBlock: (() => {
        const tx = new Transaction();
        tx.moveCall({
          target: `${HTLC_PACKAGE_ID}::escrow_src::get_escrow_info`,
          typeArguments: [coinType],
          arguments: [tx.object(escrowObjectId)],
        });
        return tx;
      })(),
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
    
    return result;
  } catch (error) {
    console.error('Error getting src escrow info:', error);
    throw error;
  }
}

/**
 * Get destination escrow contract information
 * @param {string} escrowObjectId - ID of the escrow object
 * @param {string} coinType - Type of coin for escrow
 */
async function getDstEscrowInfo(escrowObjectId, coinType = '0x2::sui::SUI') {
  try {
    const result = await client.devInspectTransactionBlock({
      transactionBlock: (() => {
        const tx = new Transaction();
        tx.moveCall({
          target: `${HTLC_PACKAGE_ID}::escrow_dst::get_escrow_info`,
          typeArguments: [coinType],
          arguments: [tx.object(escrowObjectId)],
        });
        return tx;
      })(),
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
    
    return result;
  } catch (error) {
    console.error('Error getting dst escrow info:', error);
    throw error;
  }
}

/**
 * Get escrow builder information
 * @param {string} builderObjectId - ID of the builder object
 * @param {string} coinType - Type of coin for escrow
 */
async function getBuilderInfo(builderObjectId, coinType = '0x2::sui::SUI') {
  try {
    const result = await client.devInspectTransactionBlock({
      transactionBlock: (() => {
        const tx = new Transaction();
        tx.moveCall({
          target: `${HTLC_PACKAGE_ID}::escrow_src_builder::get_builder_info`,
          typeArguments: [coinType],
          arguments: [tx.object(builderObjectId)],
        });
        return tx;
      })(),
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
    
    return result;
  } catch (error) {
    console.error('Error getting builder info:', error);
    throw error;
  }
}

/**
 * Get user's coin objects for a specific coin type
 * @param {string} userAddress - User's address
 * @param {string} coinType - Coin type to search for
 */
async function getUserCoins(userAddress, coinType = '0x2::sui::SUI') {
  try {
    const coins = await client.getCoins({
      owner: userAddress,
      coinType: coinType
    });
    return coins.data;
  } catch (error) {
    console.error('Error getting user coins:', error);
    throw error;
  }
}

export {
  client,
  HTLC_PACKAGE_ID,
  
  // Source escrow builder functions
  createSrcBuilder,
  completeSrcEscrow,
  refundExpiredBuilder,
  
  // Source escrow functions
  withdrawSrcEscrow,
  withdrawSrcEscrowTo,
  publicWithdrawSrcEscrow,
  cancelSrcEscrow,
  publicCancelSrcEscrow,
  
  // Destination escrow functions
  createDstEscrow,
  withdrawDstEscrow,
  publicWithdrawDstEscrow,
  cancelDstEscrow,
  
  // Capability management
  grantResolverCap,
  revokeResolverCap,
  
  // Utility functions
  getSrcEscrowInfo,
  getDstEscrowInfo,
  getBuilderInfo,
  getUserCoins
};