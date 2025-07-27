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
import { apiRateLimit } from '../middleware/security';
import {
  BuildSwapOrderRequest,
  BuildSwapOrderResponse,
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
    const { userIntent }: BuildSwapOrderRequest = req.body;

    logger.info('Build swap order request received', {
      userIntent,
      ip: req.ip,
    });

    const result = await relayerService.buildSwapOrder(userIntent);

    const response: ApiResponse<BuildSwapOrderResponse> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    logger.info('Swap order built successfully', {
      orderHash: result.orderHash,
      ip: req.ip,
    });

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
      ip: req.ip,
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
      timestamp: new Date().toISOString(),
    };

    logger.info('Swap order executed successfully', {
      orderHash,
      txHash,
      ip: req.ip,
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
        timestamp: new Date().toISOString(),
      };

      logger.warn('Order not found', { orderHash, ip: req.ip });

      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
    };

    logger.info('Swap order retrieved successfully', {
      orderHash,
      status: order.status,
      ip: req.ip,
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
      ip: req.ip,
    });

    const orders = relayerService.getOrdersByUser(address);

    const response: ApiResponse = {
      success: true,
      data: {
        userAddress: address,
        orders,
        totalOrders: orders.length,
      },
      timestamp: new Date().toISOString(),
    };

    logger.info('User swaps retrieved successfully', {
      userAddress: address,
      orderCount: orders.length,
      ip: req.ip,
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
      ip: req.ip,
    });

    const result = await relayerService.revealSecret(orderHash, secret);

    const response: ApiResponse = {
      success: true,
      data: {
        orderHash,
        secretRevealed: result,
        message: 'Secret revealed successfully',
      },
      timestamp: new Date().toISOString(),
    };

    logger.info('Secret revealed successfully', {
      orderHash,
      ip: req.ip,
    });

    return res.status(200).json(response);
  })
);

/**
 * Get swap quote
 * POST /api/swap/quote
 */
router.post(
  '/quote',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const userIntent = req.body;

    logger.info('Get swap quote request received', {
      userIntent,
      ip: req.ip,
    });

    const quote = await relayerService.getSwapQuote(userIntent);

    const response: ApiResponse = {
      success: true,
      data: quote,
      timestamp: new Date().toISOString(),
    };

    logger.info('Swap quote generated successfully', {
      srcChainId: userIntent.srcChainId,
      dstChainId: userIntent.dstChainId,
      amount: userIntent.amount,
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
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  })
);

/**
 * Health check endpoint
 * GET /api/swap/health
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;

    logger.info('Health check request received', { ip: req.ip });

    const health = await relayerService.healthCheck();
    const statistics = relayerService.getStatistics();

    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        resolvers: health,
        statistics,
        uptime: process.uptime(),
      },
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  })
);

/**
 * Get order statistics
 * GET /api/swap/stats
 */
router.get(
  '/stats',
  apiRateLimit,
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;

    logger.info('Get statistics request received', { ip: req.ip });

    const statistics = relayerService.getStatistics();

    const response: ApiResponse = {
      success: true,
      data: statistics,
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  })
);

export default router;
