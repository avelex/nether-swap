import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';

import RelayerService from './services/RelayerService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { 
  requestLogger, 
  securityHeaders, 
  validateContentType, 
  validateRequestSize 
} from './middleware/security';

import swapRoutes from './routes/swap';
import logger from './utils/logger';

/**
 * Create and configure Express application
 */
async function createApp(): Promise<express.Application> {
  const app = express();


  app.use(compression());
  app.use(securityHeaders);

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key'],
  }));

  // Request parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request validation and logging
  app.use(validateContentType);
  app.use(validateRequestSize);
  app.use(requestLogger);

  // Initialize services
  const relayerService = await RelayerService.create();
  app.locals.relayerService = relayerService;

  // Health check route
  app.get('/health', (_, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // API routes
  app.use('/api/swap', swapRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

/**
 * Start the HTTP server
 */
async function startServer(): Promise<void> {
  try {
    const app = await createApp();
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    const server = createServer(app);

    server.listen(port, host, () => {
      logger.info('Server started successfully', {
        port,
        host,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
      });
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Rejection at:', { promise, reason });
      // Don't exit the process in production, just log the error
      if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      // Exit the process for uncaught exceptions
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Application startup failed:', error);
    process.exit(1);
  });
}

export { createApp, startServer }; 