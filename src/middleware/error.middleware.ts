import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logDir = process.env.LOG_DIR || 'logs';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'homequest-api' },
  transports: [
    new DailyRotateFile({
      filename: `${logDir}/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: `${logDir}/combined-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, true, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, true);
  }
}

const getErrorMessage = (error: any): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
};

const getErrorStatusCode = (error: any): number => {
  if (error instanceof AppError) return error.statusCode;
  if (error.statusCode && typeof error.statusCode === 'number') return error.statusCode;
  if (error.status && typeof error.status === 'number') return error.status;
  return 500;
};

export const errorHandler = (
  err: Error | AppError | any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = getErrorStatusCode(err);
  const message = getErrorMessage(err);
  const isOperational = err instanceof AppError ? err.isOperational : false;

  const errorLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    statusCode,
    message,
    stack: err.stack,
    body: req.body,
    query: req.query,
    params: req.params,
    headers: req.headers,
    user: (req as any).user?.id,
  };

  if (statusCode >= 500) {
    logger.error('Server Error:', errorLog);
  } else {
    logger.warn('Client Error:', errorLog);
  }

  if (res.headersSent) {
    return next(err);
  }

  const responseBody: any = {
    error: {
      message: isOperational ? message : 'Internal server error',
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    },
  };

  if (process.env.NODE_ENV === 'development') {
    responseBody.error.stack = err.stack;
    responseBody.error.details = err instanceof AppError ? err.details : undefined;
  }

  if (err instanceof AppError && err.details) {
    responseBody.error.details = err.details;
  }

  res.status(statusCode).json(responseBody);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  
  logger.warn('404 Not Found:', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  res.status(404).json({
    error: {
      message: error.message,
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    },
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection:', { reason, promise });
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

export { logger };