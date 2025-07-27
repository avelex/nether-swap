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
  ExecuteSwapOrderResponse,
  RevealSecretRequest,
  ApiResponse,
} from '../types';
import logger from '../utils/logger';

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

    const swapOrder = relayerService.buildSwapOrder(userIntent);

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

    const txHash = await relayerService.executeSwapOrder(orderHash, signature);

    const executeResponse: ExecuteSwapOrderResponse = {
      success: true,
      txHash,
      message: 'Swap order executed successfully',
    };

    const response: ApiResponse<ExecuteSwapOrderResponse> = {
      success: true,
      data: executeResponse,
    };

    logger.info('Swap order executed successfully', {
      orderHash,
      txHash,
    });

    return res.status(200).json(response);
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
      status: order.status,
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

    const result = await relayerService.revealSecret(orderHash, secret);

    const response: ApiResponse = {
      success: true,
      data: {
        orderHash,
        secretRevealed: result,
        message: 'Secret revealed successfully',
      },
    };

    logger.info('Secret revealed successfully', {
      orderHash,
      ip: req.ip,
    });

    return res.status(200).json(response);
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

export default router;
