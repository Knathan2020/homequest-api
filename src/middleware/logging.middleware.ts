/**
 * Logging Middleware
 * Request/Response logging and monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { loggers } from '../utils/logger';

// Extend Express Request to add logging properties
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
      requestId?: string;
    }
  }
}

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Skip logging for health checks
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  // Add request metadata
  req.startTime = Date.now();
  req.requestId = req.headers['x-request-id'] as string || generateRequestId();

  // Log incoming request
  loggers.api.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    contentType: req.get('content-type'),
    ...(req.body && Object.keys(req.body).length > 0 && {
      body: sanitizeBody(req.body)
    })
  });

  // Log response when finished
  const originalSend = res.send;
  res.send = function(data: any) {
    res.send = originalSend;
    
    // Calculate response time
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Log based on status code
    const logLevel = res.statusCode >= 500 ? 'error' : 
                     res.statusCode >= 400 ? 'warn' : 'info';
    
    loggers.api[logLevel]('Request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      ...(responseTime > 1000 && {
        slowRequest: true,
        threshold: 1000
      })
    });

    // Log slow requests separately
    if (responseTime > 3000) {
      loggers.performance.slow('HTTP Request', responseTime, 3000);
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Error logging middleware
 */
export const errorLogger = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log the error
  loggers.api.error('Request error', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    error: {
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status || err.statusCode
    }
  });

  next(err);
};

/**
 * Blueprint-specific logging middleware
 */
export const blueprintLogger = (req: Request, res: Response, next: NextFunction) => {
  // Only log for blueprint routes
  if (!req.path.includes('/blueprint')) {
    return next();
  }

  // Log file upload details if present
  if (req.file) {
    loggers.blueprint.info('Blueprint file received', {
      requestId: req.requestId,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      sizeMB: (req.file.size / (1024 * 1024)).toFixed(2)
    });
  }

  // Log multipart files if present
  if (req.files && Array.isArray(req.files)) {
    loggers.blueprint.info('Multiple blueprint files received', {
      requestId: req.requestId,
      count: req.files.length,
      files: req.files.map(f => ({
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size
      }))
    });
  }

  next();
};

/**
 * Performance monitoring middleware
 */
export const performanceMonitor = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();

  // Monitor response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    
    // Log performance metrics for slow requests
    if (duration > 5000) {
      loggers.performance.slow('Request processing', duration, 5000);
      loggers.api.warn('Slow request detected', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        duration,
        memoryUsed: {
          heapUsed: ((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024).toFixed(2) + ' MB',
          external: ((endMemory.external - startMemory.external) / 1024 / 1024).toFixed(2) + ' MB'
        }
      });
    }
  });

  next();
};

/**
 * Claude API call logging
 */
export const claudeApiLogger = (model: string, tokens?: number) => {
  loggers.claude.apiCall(model, tokens);
};

/**
 * OpenCV processing logging
 */
export const opencvLogger = {
  start: (operation: string, imageSize?: { width: number; height: number }) => {
    loggers.opencv.info(`Starting ${operation}`, { operation, imageSize });
  },
  complete: (operation: string, duration: number) => {
    loggers.opencv.info(`Completed ${operation} in ${duration}ms`, { operation, duration });
  },
  error: (operation: string, error: any) => {
    loggers.opencv.error(`Failed ${operation}`, { operation, error });
  }
};

/**
 * Helper function to generate request ID
 */
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sanitize request body for logging
 */
const sanitizeBody = (body: any): any => {
  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  // Limit large fields
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
      sanitized[key] = sanitized[key].substring(0, 1000) + '... [TRUNCATED]';
    }
  }
  
  return sanitized;
};