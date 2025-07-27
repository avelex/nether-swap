import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Rate limiting for API endpoints
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * Strict rate limiting for sensitive operations
 */
export const strictRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: 'Too many sensitive requests from this IP, please try again later',
    code: 'STRICT_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Strict rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
    });
    res.status(429).json({
      success: false,
      error: 'Too many sensitive requests from this IP, please try again later',
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * Request logging middleware
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  });

  next();
};


/**
 * API key authentication middleware
 */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.header('X-API-Key') || req.query.apiKey;
  
  if (!apiKey) {
    logger.warn('Missing API key', {
      ip: req.ip,
      url: req.url,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(401).json({
      success: false,
      error: 'API key is required',
      code: 'MISSING_API_KEY',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // In production, validate against a database or environment variable
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (validApiKeys.length > 0 && !validApiKeys.includes(apiKey as string)) {
    logger.warn('Invalid API key', {
      ip: req.ip,
      url: req.url,
      userAgent: req.get('User-Agent'),
      providedKey: apiKey,
    });
    
    res.status(401).json({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};

/**
 * Content type validation
 */
export const validateContentType = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes('application/json')) {
      logger.warn('Invalid content type', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        contentType: contentType || 'none',
      });
      
      res.status(400).json({
        success: false,
        error: 'Content-Type must be application/json',
        code: 'INVALID_CONTENT_TYPE',
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }

  next();
};

/**
 * Request size validation
 */
export const validateRequestSize = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const contentLength = req.get('Content-Length');
  const maxSize = 1024 * 1024; // 1MB

  if (contentLength && parseInt(contentLength) > maxSize) {
    logger.warn('Request too large', {
      ip: req.ip,
      url: req.url,
      contentLength,
      maxSize,
    });
    
    res.status(413).json({
      success: false,
      error: 'Request entity too large',
      code: 'REQUEST_TOO_LARGE',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (
  _: Request,
  res: Response,
  next: NextFunction
): void => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add CORS headers for API
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');

  next();
}; 