import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import Redis from 'ioredis';

let rateLimiter: RateLimiterRedis | RateLimiterMemory;

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.warn('Redis connection failed, falling back to memory rate limiter');
      return null;
    }
    return Math.min(times * 100, 3000);
  }
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
  if (!rateLimiter || rateLimiter instanceof RateLimiterRedis) {
    console.log('Switching to memory-based rate limiter');
    rateLimiter = new RateLimiterMemory({
      points: 100,
      duration: 60,
      blockDuration: 60,
    });
  }
});

redisClient.on('connect', () => {
  console.log('Redis connected for rate limiting');
  rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    points: 100,
    duration: 60,
    blockDuration: 60,
    keyPrefix: 'rl:',
  });
});

rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
  blockDuration: 60,
});

export interface RateLimitOptions {
  points?: number;
  duration?: number;
  blockDuration?: number;
  keyPrefix?: string;
}

export const createRateLimiter = (options: RateLimitOptions = {}) => {
  const {
    points = 100,
    duration = 60,
    blockDuration = 60,
    keyPrefix = 'rl:default:',
  } = options;

  const customRateLimiter = redisClient.status === 'ready'
    ? new RateLimiterRedis({
        storeClient: redisClient,
        points,
        duration,
        blockDuration,
        keyPrefix,
      })
    : new RateLimiterMemory({
        points,
        duration,
        blockDuration,
      });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.ip || req.socket.remoteAddress || 'unknown';
      await customRateLimiter.consume(key);
      next();
    } catch (rateLimiterRes) {
      const error = rateLimiterRes as RateLimiterRes;
      res.set({
        'Retry-After': String(Math.round(error.msBeforeNext / 1000) || 60),
        'X-RateLimit-Limit': String(points),
        'X-RateLimit-Remaining': String(error.remainingPoints || 0),
        'X-RateLimit-Reset': new Date(Date.now() + (error.msBeforeNext || 0)).toISOString(),
      });
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.round(error.msBeforeNext / 1000) || 60,
      });
    }
  };
};

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    await rateLimiter.consume(key);
    next();
  } catch (rateLimiterRes) {
    const error = rateLimiterRes as RateLimiterRes;
    res.set({
      'Retry-After': String(Math.round(error.msBeforeNext / 1000) || 60),
      'X-RateLimit-Limit': String(100),
      'X-RateLimit-Remaining': String(error.remainingPoints || 0),
      'X-RateLimit-Reset': new Date(Date.now() + (error.msBeforeNext || 0)).toISOString(),
    });
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.round(error.msBeforeNext / 1000) || 60,
    });
  }
};

export const apiRateLimiter = createRateLimiter({
  points: 100,
  duration: 60,
  keyPrefix: 'rl:api:',
});

export const authRateLimiter = createRateLimiter({
  points: 5,
  duration: 900,
  blockDuration: 900,
  keyPrefix: 'rl:auth:',
});

export const uploadRateLimiter = createRateLimiter({
  points: 10,
  duration: 3600,
  keyPrefix: 'rl:upload:',
});