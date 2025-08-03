import express from 'express';
import RelayerService from '../services/RelayerService';
import { asyncHandler } from '../middleware/errorHandler';
// import {
//   validateBuildSwapOrder,
//   validateExecuteSwapOrder,
//   validateRevealSecret,
//   validateOrderId,
//   validateUserAddress,
//   validateAmountNotZero,
//   validateChainCompatibility,
// } from '../middleware/validation';
import {
  UserIntent,
  ExecuteSwapOrderRequest,
  RevealSecretRequest,
  ApiResponse,
  SuiSwapRequest,
} from '../types';
import logger from '../utils/logger';
import { parseUnits } from 'ethers';

const router = express.Router();

/**
 * Build swap order
 * POST /api/swap/eth_to_sui/build
 */
router.post(
  '/eth_to_sui/build',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const userIntent: UserIntent = req.body;

    logger.info('Build swap order request received', {
      userIntent,
    });

    const swapOrder = relayerService.buildEvmSwapOrder(userIntent);

    if (!swapOrder) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to build swap order',
      };

      logger.warn('Failed to build swap order', { userIntent });

      return res.status(400).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: swapOrder,
    };

    return res.status(200).json(response);
  })
);

/**
 * Execute swap order
 * POST /api/swap/eth_to_sui
 */
router.post(
  '/eth_to_sui',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const { orderHash, signature }: ExecuteSwapOrderRequest = req.body;

    logger.info('Execute swap order request received', {
      orderHash,
    });

    res.status(200).send('Request received and processing initiated');

    await relayerService.executeEvmSwapOrder(orderHash, signature);

    return;
  })
);

/**
 * Get swap order info by ID
 * GET /api/swap/:id
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const { id: orderHash } = req.params;

    logger.info('Get swap order request received', {
      orderHash,
    });

    const order = relayerService.getOrderByHash(orderHash);

    if (!order) {
      const response: ApiResponse = {
        success: false,
        error: 'Order not found',
      };

      logger.warn('Order not found', { orderHash, ip: req.ip });

      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: order,
    };

    logger.info('Swap order retrieved successfully', {
      orderHash,
    });

    return res.status(200).json(response);
  })
);

/**
 * Get user's swaps info
 * GET /api/swap/user/:address
 */
router.get(
  '/user/:address',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const { address } = req.params;

    logger.info('Get user swaps request received', {
      userAddress: address,
    });

    const orders = relayerService.getOrdersByUser(address);

    const response: ApiResponse = {
      success: true,
      data: {
        userAddress: address,
        orders,
        totalOrders: orders.length,
      },
    };

    logger.info('User swaps retrieved successfully', {
      userAddress: address,
      orderCount: orders.length,
    });

    return res.status(200).json(response);
  })
);

/**
 * Reveal secret for order completion
 * POST /api/swap/:id/reveal
 */
router.post(
  '/:id/reveal',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const { id: orderHash } = req.params;
    const { secret }: RevealSecretRequest = req.body;

    logger.info('Reveal secret request received', {
      orderHash,
    });

    res.status(200).send('Secret received and processing initiated');

    await relayerService.revealSecret(orderHash, secret);

    return;
  })
);

/**
 * Get supported chains
 * GET /api/swap/chains
 */
router.get(
  '/chains',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;

    logger.info('Get supported chains request received', { ip: req.ip });

    const chains = relayerService.getSupportedChains();

    const response: ApiResponse = {
      success: true,
      data: {
        supportedChains: chains,
        chainCount: chains.length,
      },
    };

    return res.status(200).json(response);
  })
);

/**
 * Build sponsored transaction from SUI
 * POST /api/build/from_sui
 */
router.post(
  '/sui_to_any/build',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const userIntent: UserIntent = req.body;

    logger.info('Build sponsored tx req received', {userIntent: userIntent});

    try {
      const amount =
        userIntent.srcChainAsset === '0x2::sui::SUI'
          ? parseUnits(userIntent.tokenAmount.toString(), 9)
          : parseUnits(userIntent.tokenAmount.toString(), 6);

      // Convert hashlock from hex string to Uint8Array
      const hashlockBytes = new Uint8Array(Buffer.from(userIntent.hashLock.replace('0x', ''), 'hex'));
      const sponsoredTx = await relayerService.getSuiResolver().buildSponsoredTx(
        userIntent.userAddress,
        userIntent.srcChainAsset,
        Number(amount),
        hashlockBytes
      );

      const response: ApiResponse = {
        success: true,
        data: sponsoredTx,
      };

      logger.info('Sponsored transaction built successfully', {
        userIntent: userIntent,
        txBytes: sponsoredTx.bytes.substring(0, 20) + '...',
      });

      return res.status(200).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: `Failed to build sponsored transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      logger.error('Failed to build sponsored transaction', {
        userIntent,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return res.status(500).json(response);
    }
  })
);

/**
 * Deploy srcEscrow with signed transaction
 * POST /api/deploy/from_sui
 */
router.post(
  '/sui_to_eth',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const swapRequest: SuiSwapRequest = req.body;

    try {
      const order = relayerService.newSuiSwapOrder(swapRequest.userIntent)
      const response: ApiResponse = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
      return await relayerService.executeSuiSwap(swapRequest, order)

    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: `Failed to make sui_swap ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      logger.error('Failed to make sui swap', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return res.status(500).json(response);
    }
  })
);

export default router;
