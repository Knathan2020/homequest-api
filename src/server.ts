/**
 * Server Initialization
 * HTTP server setup with graceful shutdown and clustering support
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cluster from 'cluster';
import os from 'os';
import dotenv from 'dotenv';
import { AddressInfo } from 'net';

// Load environment variables
dotenv.config();

// Import app
import app from './app';
import { loggers } from './utils/logger';
import { setupDirectWebSocket } from './websocket-handler';
import autonomousCallingService from './services/autonomous-calling.service';
import autonomousMessagingService from './services/autonomous-messaging.service';

// Configuration
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const USE_CLUSTER = process.env.USE_CLUSTER === 'true' && NODE_ENV === 'production';
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || String(os.cpus().length), 10);
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10);

// Server instance
let server: http.Server | https.Server;

/**
 * Create HTTP or HTTPS server
 */
const createServer = (): http.Server | https.Server => {
  if (USE_HTTPS) {
    // HTTPS configuration
    const httpsOptions = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH || path.join(__dirname, '../ssl/key.pem')),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH || path.join(__dirname, '../ssl/cert.pem')),
      ...(process.env.SSL_CA_PATH && {
        ca: fs.readFileSync(process.env.SSL_CA_PATH)
      })
    };
    return https.createServer(httpsOptions, app);
  } else {
    return http.createServer(app);
  }
};

/**
 * Start server
 */
const startServer = (): void => {
  server = createServer();

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    switch (error.code) {
      case 'EACCES':
        console.error(`❌ Port ${PORT} requires elevated privileges`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  // WebSocket setup will be done after server starts listening
  
  // Start listening
  server.listen(PORT, HOST, () => {
    const address = server.address() as AddressInfo;
    
    // Set up direct WebSocket handling for Twilio streams AFTER server is listening
    setupDirectWebSocket(server);
    
    // Initialize autonomous calling system
    autonomousCallingService.initialize().catch(console.error);
    
    // Initialize autonomous messaging system
    autonomousMessagingService.initialize().catch(console.error);
    
    const protocol = USE_HTTPS ? 'https' : 'http';
    const workerId = cluster.worker?.id || 'main';
    
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🏗️  HomeQuest Floor Plan Processing API                ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  🚀 Server Started Successfully                            ║
║                                                            ║
║  📡 Address:  ${protocol}://${address.address}:${address.port}${' '.repeat(Math.max(0, 29 - (protocol.length + address.address.length + String(address.port).length)))}║
║  🌍 Environment: ${NODE_ENV}${' '.repeat(Math.max(0, 41 - NODE_ENV.length))}║
║  👷 Worker: ${workerId}${' '.repeat(Math.max(0, 46 - String(workerId).length))}║
║  ⏰ Started: ${new Date().toISOString()}${' '.repeat(15)}║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  📊 Endpoints:                                             ║
║                                                            ║
║  • Health Check: ${protocol}://${HOST}:${PORT}/health${' '.repeat(Math.max(0, 22 - (protocol.length + HOST.length + String(PORT).length)))}║
║  • API Info: ${protocol}://${HOST}:${PORT}/api${' '.repeat(Math.max(0, 27 - (protocol.length + HOST.length + String(PORT).length)))}║
║  • Floor Plans: ${protocol}://${HOST}:${PORT}/api/floor-plans${' '.repeat(Math.max(0, 16 - (protocol.length + HOST.length + String(PORT).length)))}║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);

    // Log additional configuration in development
    if (NODE_ENV === 'development') {
      console.log('📝 Development Mode - Verbose logging enabled');
      console.log('🔧 Configuration:', {
        port: PORT,
        host: HOST,
        https: USE_HTTPS,
        cluster: USE_CLUSTER,
        workers: USE_CLUSTER ? WORKER_COUNT : 1,
        shutdownTimeout: SHUTDOWN_TIMEOUT
      });
    }
  });

  // Handle keep-alive connections
  server.keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT || '65000', 10);
  server.headersTimeout = parseInt(process.env.HEADERS_TIMEOUT || '66000', 10);
};

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n📍 Received ${signal} signal, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');

    try {
      // Close database connections
      await closeDatabaseConnections();

      // Close Redis connections
      await closeRedisConnections();

      // Close message queues
      await closeMessageQueues();

      // Clean up temporary files
      await cleanupTempFiles();

      console.log('✅ All connections closed successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  // Track active connections
  const connections = new Set<any>();
  
  server.on('connection', (connection) => {
    connections.add(connection);
    connection.on('close', () => {
      connections.delete(connection);
    });
  });

  // Close active connections
  console.log(`📊 Closing ${connections.size} active connections...`);
  connections.forEach((connection) => {
    connection.end();
  });

  // Destroy connections that don't close gracefully
  setTimeout(() => {
    connections.forEach((connection) => {
      connection.destroy();
    });
  }, 5000);
};

/**
 * Close database connections
 */
const closeDatabaseConnections = async (): Promise<void> => {
  // TODO: Implement actual database connection cleanup
  console.log('🔌 Closing database connections...');
  return new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
};

/**
 * Close Redis connections
 */
const closeRedisConnections = async (): Promise<void> => {
  // TODO: Implement actual Redis connection cleanup
  console.log('🔌 Closing Redis connections...');
  return new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
};

/**
 * Close message queue connections
 */
const closeMessageQueues = async (): Promise<void> => {
  // TODO: Implement actual message queue cleanup
  console.log('🔌 Closing message queue connections...');
  return new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
};

/**
 * Clean up temporary files
 */
const cleanupTempFiles = async (): Promise<void> => {
  console.log('🧹 Cleaning up temporary files...');
  const tempDir = path.join(__dirname, '../../temp');
  
  if (fs.existsSync(tempDir)) {
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
        
        // Delete files older than 24 hours
        if (ageInHours > 24) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('Error cleaning temp files:', error);
    }
  }
};

/**
 * Setup process handlers
 */
const setupProcessHandlers = (): void => {
  // Graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Error handlers
  process.on('uncaughtException', (error: Error) => {
    console.error('❌ Uncaught Exception:', error);
    console.error(error.stack);
    
    // Attempt graceful shutdown
    gracefulShutdown('UNCAUGHT_EXCEPTION').finally(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    
    // In production, you might want to exit
    if (NODE_ENV === 'production') {
      gracefulShutdown('UNHANDLED_REJECTION').finally(() => {
        process.exit(1);
      });
    }
  });

  // Warning handler
  process.on('warning', (warning: Error) => {
    console.warn('⚠️  Warning:', warning.name);
    console.warn(warning.message);
    console.warn(warning.stack);
  });
};

/**
 * Setup clustering
 */
const setupClustering = (): void => {
  if (cluster.isPrimary) {
    console.log(`🔧 Master process ${process.pid} is running`);
    console.log(`👷 Spawning ${WORKER_COUNT} worker processes...`);

    // Fork workers
    for (let i = 0; i < WORKER_COUNT; i++) {
      cluster.fork();
    }

    // Handle worker events
    cluster.on('exit', (worker, code, signal) => {
      console.error(`❌ Worker ${worker.process.pid} died (${signal || code})`);
      
      // Restart worker
      if (NODE_ENV === 'production') {
        console.log('🔄 Restarting worker...');
        cluster.fork();
      }
    });

    cluster.on('online', (worker) => {
      console.log(`✅ Worker ${worker.process.pid} is online`);
    });

    // Handle master process shutdown
    setupProcessHandlers();
  } else {
    // Worker process
    startServer();
    setupProcessHandlers();
  }
};

/**
 * Main execution
 */
const main = (): void => {
  console.log('🚀 Initializing HomeQuest API Server...');

  if (USE_CLUSTER && NODE_ENV === 'production') {
    setupClustering();
  } else {
    startServer();
    setupProcessHandlers();
  }
};

// Start the server
main();

// Export for testing
export { server, gracefulShutdown };