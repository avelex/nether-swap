import { body, param, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../types';

/**
 * Handle validation results
 */
export const handleValidationErrors = (
  req: Request,
  _: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    throw new ValidationError(
      `${firstError.msg}`,
      firstError.type === 'field' ? firstError.path : undefined
    );
  }
  next();
};

/**
 * Validation rules for build swap order
 */
export const validateBuildSwapOrder = [
  body('userIntent.srcChainId')
    .isInt({ min: 1 })
    .withMessage('Source chain ID must be a positive integer'),
  
  body('userIntent.dstChainId')
    .isInt({ min: 1 })
    .withMessage('Destination chain ID must be a positive integer'),
  
  body('userIntent.srcToken')
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Source token must be a valid Ethereum address'),
  
  body('userIntent.dstToken')
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Destination token must be a valid address'),
  
  body('userIntent.amount')
    .isString()
    .matches(/^\d+(\.\d+)?$/)
    .withMessage('Amount must be a valid number string'),
  
  body('userIntent.userAddress')
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('User address must be a valid Ethereum address'),
  
  body('userIntent.dstAddress')
    .optional()
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Destination address must be a valid address'),
  
  body('userIntent.slippage')
    .optional()
    .isFloat({ min: 0, max: 50 })
    .withMessage('Slippage must be between 0 and 50'),
  
  body('userIntent.deadline')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Deadline must be a positive integer'),

  handleValidationErrors,
];

/**
 * Validation rules for execute swap order
 */
export const validateExecuteSwapOrder = [
  body('orderHash')
    .isLength({ min: 66, max: 66 })
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('Order hash must be a valid 32-byte hex string'),
  
  body('signature')
    .isString()
    .isLength({ min: 130, max: 132 })
    .matches(/^0x[a-fA-F0-9]{128,130}$/)
    .withMessage('Signature must be a valid hex string'),

  handleValidationErrors,
];

/**
 * Validation rules for reveal secret
 */
export const validateRevealSecret = [
  body('orderHash')
    .isLength({ min: 66, max: 66 })
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('Order hash must be a valid 32-byte hex string'),
  
  body('secret')
    .isString()
    .isLength({ min: 32 })
    .withMessage('Secret must be at least 32 characters long'),

  handleValidationErrors,
];

/**
 * Validation rules for order ID parameter
 */
export const validateOrderId = [
  param('id')
    .isLength({ min: 66, max: 66 })
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('Order ID must be a valid 32-byte hex string'),

  handleValidationErrors,
];

/**
 * Validation rules for user address parameter
 */
export const validateUserAddress = [
  param('address')
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('User address must be a valid Ethereum address'),

  handleValidationErrors,
];

/**
 * Validation rules for swap quote
 */
export const validateSwapQuote = [
  body('srcChainId')
    .isInt({ min: 1 })
    .withMessage('Source chain ID must be a positive integer'),
  
  body('dstChainId')
    .isInt({ min: 1 })
    .withMessage('Destination chain ID must be a positive integer'),
  
  body('srcToken')
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Source token must be a valid Ethereum address'),
  
  body('dstToken')
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Destination token must be a valid address'),
  
  body('amount')
    .isString()
    .matches(/^\d+(\.\d+)?$/)
    .withMessage('Amount must be a valid number string'),
  
  body('userAddress')
    .isLength({ min: 42, max: 42 })
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('User address must be a valid Ethereum address'),

  handleValidationErrors,
];

/**
 * Custom validation for amount vs balance
 */
export const validateAmountNotZero = (
  req: Request,
  _: Response,
  next: NextFunction
): void => {
  const amount = req.body.userIntent?.amount || req.body.amount;
  
  if (amount && parseFloat(amount) <= 0) {
    throw new ValidationError('Amount must be greater than zero', 'amount');
  }
  
  next();
};

/**
 * Custom validation for chain compatibility
 */
export const validateChainCompatibility = (
  req: Request,
  _: Response,
  next: NextFunction
): void => {
  const srcChainId = req.body.userIntent?.srcChainId || req.body.srcChainId;
  const dstChainId = req.body.userIntent?.dstChainId || req.body.dstChainId;
  
  if (srcChainId === dstChainId) {
    throw new ValidationError('Source and destination chains must be different', 'chainId');
  }
  
  // Add more chain compatibility checks here
  const supportedChains = [1, 101]; // Ethereum and Sui
  if (!supportedChains.includes(srcChainId) || !supportedChains.includes(dstChainId)) {
    throw new ValidationError(
      `Unsupported chain. Supported chains: ${supportedChains.join(', ')}`,
      'chainId'
    );
  }
  
  next();
}; 