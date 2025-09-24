/**
 * Logger Configuration
 * Centralized logging system using Winston
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'gray'
};

// Add colors to winston
winston.addColors(logColors);

// Custom log format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      // Handle error objects specially
      if (metadata.error && metadata.error instanceof Error) {
        metadata.error = {
          message: metadata.error.message,
          stack: metadata.error.stack,
          name: metadata.error.name
        };
      }
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} ${level}: ${message}`;
    
    // Add metadata in a readable format for console
    if (Object.keys(metadata).length > 0 && process.env.NODE_ENV === 'development') {
      msg += '\n' + JSON.stringify(metadata, null, 2);
    }
    
    return msg;
  })
);

// Create daily rotate file transport for all logs
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, '%DATE%-combined.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: customFormat,
  level: process.env.LOG_LEVEL || 'info'
});

// Create daily rotate file transport for errors
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, '%DATE%-error.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: customFormat,
  level: 'error'
});

// Create daily rotate file transport for HTTP logs
const httpFileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, '%DATE%-http.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '7d',
  format: customFormat,
  level: 'http'
});

// Create Winston logger
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  transports: process.env.NODE_ENV === 'production' && process.env.DISABLE_FILE_LOGGING === 'true' ? [] : [
    fileRotateTransport,
    errorFileRotateTransport,
    httpFileRotateTransport
  ],
  exitOnError: false
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'debug',
    handleExceptions: true,
    handleRejections: true,
    // Add silent mode when output stream is closed
    silent: false
  }));
}

// Add console transport for production with limited output
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
    level: 'warn',
    handleExceptions: true,
    handleRejections: true,
    // Add silent mode when output stream is closed
    silent: false
  }));
}

// Handle EPIPE errors gracefully
logger.on('error', (error: any) => {
  if (error.code === 'EPIPE') {
    // Silently ignore EPIPE errors (broken pipe)
    return;
  }
  // Re-throw other errors
  console.error('Logger error:', error);
});

// Stream for Morgan HTTP logger
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};

// Helper functions for specific log categories
export const loggers = {
  // System logs
  system: {
    info: (message: string, metadata?: any) => logger.info(`[SYSTEM] ${message}`, metadata),
    warn: (message: string, metadata?: any) => logger.warn(`[SYSTEM] ${message}`, metadata),
    error: (message: string, metadata?: any) => logger.error(`[SYSTEM] ${message}`, metadata),
    debug: (message: string, metadata?: any) => logger.debug(`[SYSTEM] ${message}`, metadata)
  },
  
  // API logs
  api: {
    info: (message: string, metadata?: any) => logger.info(`[API] ${message}`, metadata),
    warn: (message: string, metadata?: any) => logger.warn(`[API] ${message}`, metadata),
    error: (message: string, metadata?: any) => logger.error(`[API] ${message}`, metadata),
    debug: (message: string, metadata?: any) => logger.debug(`[API] ${message}`, metadata)
  },
  
  // Blueprint processing logs
  blueprint: {
    info: (message: string, metadata?: any) => logger.info(`[BLUEPRINT] ${message}`, metadata),
    warn: (message: string, metadata?: any) => logger.warn(`[BLUEPRINT] ${message}`, metadata),
    error: (message: string, metadata?: any) => logger.error(`[BLUEPRINT] ${message}`, metadata),
    debug: (message: string, metadata?: any) => logger.debug(`[BLUEPRINT] ${message}`, metadata),
    process: (blueprintId: string, stage: string, data?: any) => {
      logger.info(`[BLUEPRINT] Processing ${blueprintId} - ${stage}`, data);
    }
  },
  
  // Claude Vision logs
  claude: {
    info: (message: string, metadata?: any) => logger.info(`[CLAUDE] ${message}`, metadata),
    warn: (message: string, metadata?: any) => logger.warn(`[CLAUDE] ${message}`, metadata),
    error: (message: string, metadata?: any) => logger.error(`[CLAUDE] ${message}`, metadata),
    debug: (message: string, metadata?: any) => logger.debug(`[CLAUDE] ${message}`, metadata),
    apiCall: (model: string, tokens?: number) => {
      logger.info(`[CLAUDE] API call to ${model}`, { model, tokens });
    }
  },
  
  // OpenCV logs
  opencv: {
    info: (message: string, metadata?: any) => logger.info(`[OPENCV] ${message}`, metadata),
    warn: (message: string, metadata?: any) => logger.warn(`[OPENCV] ${message}`, metadata),
    error: (message: string, metadata?: any) => logger.error(`[OPENCV] ${message}`, metadata),
    debug: (message: string, metadata?: any) => logger.debug(`[OPENCV] ${message}`, metadata)
  },
  
  // Database logs
  database: {
    info: (message: string, metadata?: any) => logger.info(`[DB] ${message}`, metadata),
    warn: (message: string, metadata?: any) => logger.warn(`[DB] ${message}`, metadata),
    error: (message: string, metadata?: any) => logger.error(`[DB] ${message}`, metadata),
    debug: (message: string, metadata?: any) => logger.debug(`[DB] ${message}`, metadata),
    query: (query: string, params?: any) => {
      logger.debug(`[DB] Query: ${query}`, { params });
    }
  },
  
  // Performance logs
  performance: {
    measure: (operation: string, startTime: number) => {
      const duration = Date.now() - startTime;
      logger.info(`[PERFORMANCE] ${operation} completed in ${duration}ms`, { duration, operation });
    },
    slow: (operation: string, duration: number, threshold: number) => {
      logger.warn(`[PERFORMANCE] Slow operation: ${operation} took ${duration}ms (threshold: ${threshold}ms)`, {
        operation,
        duration,
        threshold
      });
    }
  }
};

// Log unhandled errors
process.on('uncaughtException', (error: Error) => {
  // Handle EPIPE errors gracefully without crashing
  if ((error as any).code === 'EPIPE') {
    console.warn('[SYSTEM] EPIPE error caught, continuing...');
    return;
  }
  
  // Try to log the error safely
  try {
    logger.error('[SYSTEM] Uncaught Exception', { error });
  } catch (logError) {
    console.error('[SYSTEM] Failed to log uncaught exception:', error);
  }
  
  // Only exit for non-EPIPE errors
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  // Try to log the rejection safely
  try {
    logger.error('[SYSTEM] Unhandled Rejection', { reason, promise });
  } catch (logError) {
    console.error('[SYSTEM] Failed to log unhandled rejection:', reason);
  }
});

// Log startup
logger.info('[SYSTEM] Logger initialized', {
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir,
  environment: process.env.NODE_ENV || 'development'
});

export default logger;