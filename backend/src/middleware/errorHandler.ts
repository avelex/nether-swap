import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { SwapError, ValidationError, ChainError } from '../types';

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
  timestamp: string;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _: NextFunction
): void => {
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  const errorResponse: ErrorResponse = {
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  };

  if (err instanceof ValidationError) {
    res.status(400).json({
      ...errorResponse,
      error: err.message,
      code: 'VALIDATION_ERROR',
      details: { field: err.field },
    });
    return;
  }

  if (err instanceof SwapError) {
    res.status(400).json({
      ...errorResponse,
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }

  if (err instanceof ChainError) {
    res.status(503).json({
      ...errorResponse,
      error: err.message,
      code: 'CHAIN_ERROR',
      details: { chainId: err.chainId },
    });
    return;
  }

  // Handle specific error types
  if (err.name === 'CastError') {
    res.status(400).json({
      ...errorResponse,
      error: 'Invalid ID format',
      code: 'INVALID_ID',
    });
    return;
  }

  if (err.name === 'SyntaxError' && 'body' in err) {
    res.status(400).json({
      ...errorResponse,
      error: 'Invalid JSON',
      code: 'INVALID_JSON',
    });
    return;
  }

  // Default error response
  const statusCode = process.env.NODE_ENV === 'production' ? 500 : 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    ...errorResponse,
    error: message,
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  _: NextFunction
): void => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  res.status(404).json({
    success: false,
    error: error.message,
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}; 