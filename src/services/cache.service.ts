import Redis, { Redis as RedisClient } from 'ioredis';
import logger from '../utils/logger';
import { REDIS, CacheKey } from '../utils/constants';

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
  compress?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

class CacheService {
  private client: RedisClient;
  private subscriber: RedisClient;
  private publisher: RedisClient;
  private isConnected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };
  private static instance: CacheService;

  private constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times: number) => {
        if (times > REDIS.MAX_RETRIES) {
          logger.error('Redis connection failed after max retries');
          return null;
        }
        return Math.min(times * REDIS.RETRY_DELAY, 3000);
      },
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      connectTimeout: REDIS.CONNECTION_TIMEOUT,
    };

    this.client = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
    this.publisher = new Redis(redisConfig);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis cache connected');
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      this.stats.errors++;
      logger.error('Redis cache error:', error);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis cache connection closed');
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      this.handlePubSubMessage(channel, message);
    });
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private generateKey(key: string, prefix?: string): string {
    const actualPrefix = prefix || REDIS.CACHE_PREFIX;
    return `${actualPrefix}${key}`;
  }

  private serialize(value: any): string {
    return JSON.stringify(value);
  }

  private deserialize(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  public async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping get operation');
      return null;
    }

    const startTime = Date.now();
    const cacheKey = this.generateKey(key, options.prefix);

    try {
      const value = await this.client.get(cacheKey);
      const duration = Date.now() - startTime;

      if (value) {
        this.stats.hits++;
        logger.debug(`[CACHE] Cache hit for ${cacheKey} (${duration}ms)`);
        return this.deserialize(value) as T;
      }

      this.stats.misses++;
      logger.debug(`[CACHE] Cache miss for ${cacheKey} (${duration}ms)`);
      return null;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache get error:', error, { key: cacheKey });
      return null;
    }
  }

  public async set(
    key: string,
    value: any,
    options: CacheOptions = {}
  ): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping set operation');
      return false;
    }

    const startTime = Date.now();
    const cacheKey = this.generateKey(key, options.prefix);
    const ttl = options.ttl || REDIS.DEFAULT_TTL;

    try {
      const serialized = this.serialize(value);
      
      if (ttl > 0) {
        await this.client.setex(cacheKey, ttl, serialized);
      } else {
        await this.client.set(cacheKey, serialized);
      }

      this.stats.sets++;
      const duration = Date.now() - startTime;
      logger.debug(`[CACHE] Set ${cacheKey} (${duration}ms)`);
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache set error:', error, { key: cacheKey });
      return false;
    }
  }

  public async delete(key: string, prefix?: string): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping delete operation');
      return false;
    }

    const cacheKey = this.generateKey(key, prefix);

    try {
      const result = await this.client.del(cacheKey);
      this.stats.deletes++;
      logger.debug(`[CACHE] Deleted ${cacheKey} - success: ${result > 0}`);
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache delete error:', error, { key: cacheKey });
      return false;
    }
  }

  public async deletePattern(pattern: string, prefix?: string): Promise<number> {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping delete pattern operation');
      return 0;
    }

    const actualPrefix = prefix || REDIS.CACHE_PREFIX;
    const fullPattern = `${actualPrefix}${pattern}`;

    try {
      const keys = await this.client.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const pipeline = this.client.pipeline();
      keys.forEach(key => pipeline.del(key));
      await pipeline.exec();

      this.stats.deletes += keys.length;
      logger.debug(`Deleted ${keys.length} keys matching pattern ${fullPattern}`);
      return keys.length;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache delete pattern error:', error, { pattern: fullPattern });
      return 0;
    }
  }

  public async exists(key: string, prefix?: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    const cacheKey = this.generateKey(key, prefix);

    try {
      const exists = await this.client.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache exists error:', error, { key: cacheKey });
      return false;
    }
  }

  public async ttl(key: string, prefix?: string): Promise<number> {
    if (!this.isConnected) {
      return -1;
    }

    const cacheKey = this.generateKey(key, prefix);

    try {
      return await this.client.ttl(cacheKey);
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache ttl error:', error, { key: cacheKey });
      return -1;
    }
  }

  public async expire(key: string, seconds: number, prefix?: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    const cacheKey = this.generateKey(key, prefix);

    try {
      const result = await this.client.expire(cacheKey, seconds);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache expire error:', error, { key: cacheKey });
      return false;
    }
  }

  public async increment(key: string, by: number = 1, prefix?: string): Promise<number | null> {
    if (!this.isConnected) {
      return null;
    }

    const cacheKey = this.generateKey(key, prefix);

    try {
      return await this.client.incrby(cacheKey, by);
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache increment error:', error, { key: cacheKey });
      return null;
    }
  }

  public async decrement(key: string, by: number = 1, prefix?: string): Promise<number | null> {
    if (!this.isConnected) {
      return null;
    }

    const cacheKey = this.generateKey(key, prefix);

    try {
      return await this.client.decrby(cacheKey, by);
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache decrement error:', error, { key: cacheKey });
      return null;
    }
  }

  public async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T | null> {
    const cached = await this.get<T>(key, options);
    
    if (cached !== null) {
      return cached;
    }

    try {
      const value = await fetcher();
      await this.set(key, value, options);
      return value;
    } catch (error) {
      logger.error('Cache getOrSet fetcher error:', error, { key });
      return null;
    }
  }

  public async mget<T = any>(keys: string[], prefix?: string): Promise<(T | null)[]> {
    if (!this.isConnected || keys.length === 0) {
      return keys.map(() => null);
    }

    const cacheKeys = keys.map(key => this.generateKey(key, prefix));

    try {
      const values = await this.client.mget(...cacheKeys);
      return values.map(value => value ? this.deserialize(value) as T : null);
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  public async mset(
    items: Array<{ key: string; value: any }>,
    options: CacheOptions = {}
  ): Promise<boolean> {
    if (!this.isConnected || items.length === 0) {
      return false;
    }

    const pipeline = this.client.pipeline();
    const ttl = options.ttl || REDIS.DEFAULT_TTL;

    items.forEach(({ key, value }) => {
      const cacheKey = this.generateKey(key, options.prefix);
      const serialized = this.serialize(value);
      
      if (ttl > 0) {
        pipeline.setex(cacheKey, ttl, serialized);
      } else {
        pipeline.set(cacheKey, serialized);
      }
    });

    try {
      await pipeline.exec();
      this.stats.sets += items.length;
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  public async flush(prefix?: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      if (prefix) {
        const deleted = await this.deletePattern('*', prefix);
        return deleted > 0;
      } else {
        await this.client.flushdb();
        return true;
      }
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  public async publish(channel: string, message: any): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const serialized = this.serialize(message);
      return await this.publisher.publish(channel, serialized);
    } catch (error) {
      logger.error('Cache publish error:', error, { channel });
      return 0;
    }
  }

  public async subscribe(channels: string | string[]): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      if (Array.isArray(channels)) {
        await this.subscriber.subscribe(...channels);
      } else {
        await this.subscriber.subscribe(channels);
      }
      logger.debug(`Subscribed to channels: ${Array.isArray(channels) ? channels.join(', ') : channels}`);
    } catch (error) {
      logger.error('Cache subscribe error:', error, { channels });
    }
  }

  public async unsubscribe(channels?: string | string[]): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      if (channels) {
        if (Array.isArray(channels)) {
          await this.subscriber.unsubscribe(...channels);
        } else {
          await this.subscriber.unsubscribe(channels);
        }
      } else {
        await this.subscriber.unsubscribe();
      }
    } catch (error) {
      logger.error('Cache unsubscribe error:', error, { channels });
    }
  }

  private handlePubSubMessage(channel: string, message: string): void {
    try {
      const data = this.deserialize(message);
      logger.debug('PubSub message received', { channel, data });
    } catch (error) {
      logger.error('Error handling PubSub message:', error, { channel, message });
    }
  }

  public getStats(): CacheStats {
    return { ...this.stats };
  }

  public resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  public isHealthy(): boolean {
    return this.isConnected;
  }

  public async ping(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit(),
    ]);
    this.isConnected = false;
    logger.info('Redis cache disconnected');
  }

  public static createCacheKey(type: CacheKey, ...parts: (string | number)[]): string {
    return `${type}:${parts.join(':')}`;
  }

  public static parseCacheKey(key: string): { type: string; parts: string[] } {
    const [type, ...parts] = key.split(':');
    return { type, parts };
  }
}

export const cache = CacheService.getInstance();

export const createCacheDecorator = (options: CacheOptions = {}) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      const cached = await cache.get(key, options);

      if (cached !== null) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      await cache.set(key, result, options);
      return result;
    };

    return descriptor;
  };
};

export default cache;