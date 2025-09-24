/**
 * Redis Configuration
 * Connection pooling, cluster support, and caching strategies
 */

import { RedisOptions, ClusterOptions } from 'ioredis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Redis connection modes
 */
export enum RedisMode {
  STANDALONE = 'standalone',
  CLUSTER = 'cluster',
  SENTINEL = 'sentinel'
}

/**
 * Redis database indices
 */
export enum RedisDatabase {
  DEFAULT = 0,
  CACHE = 1,
  SESSIONS = 2,
  QUEUES = 3,
  PUBSUB = 4,
  RATE_LIMIT = 5,
  FLOOR_PLANS = 6,
  PROCESSING_JOBS = 7,
  TEMP_DATA = 8,
  METRICS = 9
}

/**
 * Redis key prefixes for namespacing
 */
export enum RedisKeyPrefix {
  CACHE = 'cache:',
  SESSION = 'session:',
  QUEUE = 'queue:',
  JOB = 'job:',
  USER = 'user:',
  FLOOR_PLAN = 'floor_plan:',
  ROOM = 'room:',
  PROCESSING = 'processing:',
  RATE_LIMIT = 'rate:',
  LOCK = 'lock:',
  METRIC = 'metric:',
  TEMP = 'temp:'
}

/**
 * Cache TTL configurations (in seconds)
 */
export const CacheTTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
  WEEK: 604800, // 7 days
  MONTH: 2592000, // 30 days
  
  // Specific TTLs
  FLOOR_PLAN_METADATA: 3600,
  PROCESSING_STATUS: 60,
  USER_SESSION: 7200,
  API_RESPONSE: 300,
  ROOM_DATA: 1800,
  ANALYSIS_RESULT: 86400,
  THUMBNAIL: 604800,
  RATE_LIMIT_WINDOW: 900 // 15 minutes
} as const;

/**
 * Redis connection pool configuration
 */
export interface RedisPoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
  evictionRunIntervalMillis: number;
  softIdleTimeoutMillis: number;
}

/**
 * Redis retry strategy configuration
 */
export interface RedisRetryStrategy {
  retries: number;
  factor: number;
  minTimeout: number;
  maxTimeout: number;
  randomize: boolean;
}

/**
 * Redis sentinel configuration
 */
export interface RedisSentinelConfig {
  sentinels: Array<{ host: string; port: number }>;
  name: string;
  password?: string;
  sentinelPassword?: string;
  sentinelRetryStrategy?: RedisRetryStrategy;
}

/**
 * Complete Redis configuration
 */
export interface RedisConfig {
  mode: RedisMode;
  connection: RedisOptions;
  cluster?: ClusterOptions;
  sentinel?: RedisSentinelConfig;
  pool: RedisPoolConfig;
  retryStrategy: RedisRetryStrategy;
  monitoring: RedisMonitoringConfig;
  security: RedisSecurityConfig;
}

/**
 * Redis monitoring configuration
 */
export interface RedisMonitoringConfig {
  enableMetrics: boolean;
  enableSlowLog: boolean;
  slowLogThresholdMs: number;
  enableCommandLogging: boolean;
  enableMemoryMonitoring: boolean;
  memoryWarningThreshold: number; // Percentage
  memoryCriticalThreshold: number; // Percentage
}

/**
 * Redis security configuration
 */
export interface RedisSecurityConfig {
  requirePassword: boolean;
  enableTLS: boolean;
  tlsOptions?: {
    cert?: string;
    key?: string;
    ca?: string;
    rejectUnauthorized: boolean;
  };
  allowedCommands?: string[];
  deniedCommands?: string[];
}

/**
 * Parse Redis URL
 */
const parseRedisUrl = (url: string): Partial<RedisOptions> => {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379'),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      db: parseInt(parsed.pathname.slice(1) || '0')
    };
  } catch {
    return {};
  }
};

/**
 * Get Redis mode from environment
 */
const getRedisMode = (): RedisMode => {
  const mode = process.env.REDIS_MODE?.toLowerCase();
  switch (mode) {
    case 'cluster':
      return RedisMode.CLUSTER;
    case 'sentinel':
      return RedisMode.SENTINEL;
    default:
      return RedisMode.STANDALONE;
  }
};

/**
 * Get Redis connection options
 */
const getRedisConnection = (): RedisOptions => {
  const baseOptions: RedisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    
    // Connection options
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
    keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE || '30000'),
    noDelay: true,
    
    // Connection pool
    connectionName: `homequest-api-${process.env.NODE_ENV}`,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    
    // Auto-resending
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    
    // Lazy connect for better startup
    lazyConnect: process.env.NODE_ENV === 'production',
    
    // String numbers for better performance
    stringNumbers: false,
    
    // Monitoring
    enableAutoPipelining: true,
    autoPipeliningIgnoredCommands: ['info', 'ping', 'auth', 'select']
  };

  // Override with Redis URL if provided
  if (process.env.REDIS_URL) {
    Object.assign(baseOptions, parseRedisUrl(process.env.REDIS_URL));
  }

  return baseOptions;
};

/**
 * Get Redis cluster configuration
 */
const getClusterConfig = (): ClusterOptions | undefined => {
  if (getRedisMode() !== RedisMode.CLUSTER) {
    return undefined;
  }

  const nodes = process.env.REDIS_CLUSTER_NODES?.split(',').map(node => {
    const [host, port] = node.trim().split(':');
    return { host, port: parseInt(port || '6379') };
  }) || [];

  if (nodes.length === 0) {
    return undefined;
  }

  return {
    clusterRetryStrategy: (times: number) => {
      const delay = Math.min(100 * Math.pow(2, times), 10000);
      return delay;
    },
    enableOfflineQueue: true,
    enableReadyCheck: true,
    scaleReads: 'slave',
    maxRedirections: 16,
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 300,
    slotsRefreshTimeout: 10000,
    slotsRefreshInterval: 5000,
    redisOptions: {
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === 'true' ? {} : undefined
    }
  };
};

/**
 * Get Redis sentinel configuration
 */
const getSentinelConfig = (): RedisSentinelConfig | undefined => {
  if (getRedisMode() !== RedisMode.SENTINEL) {
    return undefined;
  }

  const sentinels = process.env.REDIS_SENTINELS?.split(',').map(sentinel => {
    const [host, port] = sentinel.trim().split(':');
    return { host, port: parseInt(port || '26379') };
  }) || [];

  if (sentinels.length === 0) {
    return undefined;
  }

  return {
    sentinels,
    name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
    password: process.env.REDIS_PASSWORD,
    sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
    sentinelRetryStrategy: {
      retries: 10,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      randomize: true
    }
  };
};

/**
 * Get connection pool configuration
 */
const getPoolConfig = (): RedisPoolConfig => ({
  min: parseInt(process.env.REDIS_POOL_MIN || '2'),
  max: parseInt(process.env.REDIS_POOL_MAX || '10'),
  acquireTimeoutMillis: parseInt(process.env.REDIS_POOL_ACQUIRE_TIMEOUT || '30000'),
  idleTimeoutMillis: parseInt(process.env.REDIS_POOL_IDLE_TIMEOUT || '30000'),
  evictionRunIntervalMillis: parseInt(process.env.REDIS_POOL_EVICTION_INTERVAL || '60000'),
  softIdleTimeoutMillis: parseInt(process.env.REDIS_POOL_SOFT_IDLE_TIMEOUT || '10000')
});

/**
 * Get retry strategy configuration
 */
const getRetryStrategy = (): RedisRetryStrategy => ({
  retries: parseInt(process.env.REDIS_MAX_RETRIES || '10'),
  factor: parseFloat(process.env.REDIS_RETRY_FACTOR || '2'),
  minTimeout: parseInt(process.env.REDIS_RETRY_MIN_TIMEOUT || '1000'),
  maxTimeout: parseInt(process.env.REDIS_RETRY_MAX_TIMEOUT || '20000'),
  randomize: process.env.REDIS_RETRY_RANDOMIZE === 'true'
});

/**
 * Get monitoring configuration
 */
const getMonitoringConfig = (): RedisMonitoringConfig => ({
  enableMetrics: process.env.REDIS_ENABLE_METRICS === 'true',
  enableSlowLog: process.env.REDIS_ENABLE_SLOW_LOG === 'true',
  slowLogThresholdMs: parseInt(process.env.REDIS_SLOW_LOG_THRESHOLD || '100'),
  enableCommandLogging: process.env.REDIS_ENABLE_COMMAND_LOGGING === 'true',
  enableMemoryMonitoring: process.env.REDIS_ENABLE_MEMORY_MONITORING === 'true',
  memoryWarningThreshold: parseInt(process.env.REDIS_MEMORY_WARNING_THRESHOLD || '80'),
  memoryCriticalThreshold: parseInt(process.env.REDIS_MEMORY_CRITICAL_THRESHOLD || '95')
});

/**
 * Get security configuration
 */
const getSecurityConfig = (): RedisSecurityConfig => ({
  requirePassword: !!process.env.REDIS_PASSWORD,
  enableTLS: process.env.REDIS_TLS === 'true',
  tlsOptions: process.env.REDIS_TLS === 'true' ? {
    cert: process.env.REDIS_TLS_CERT,
    key: process.env.REDIS_TLS_KEY,
    ca: process.env.REDIS_TLS_CA,
    rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
  } : undefined,
  allowedCommands: process.env.REDIS_ALLOWED_COMMANDS?.split(','),
  deniedCommands: process.env.REDIS_DENIED_COMMANDS?.split(',')
});

/**
 * Main Redis configuration
 */
export const redisConfig: RedisConfig = {
  mode: getRedisMode(),
  connection: getRedisConnection(),
  cluster: getClusterConfig(),
  sentinel: getSentinelConfig(),
  pool: getPoolConfig(),
  retryStrategy: getRetryStrategy(),
  monitoring: getMonitoringConfig(),
  security: getSecurityConfig()
};

/**
 * Redis retry strategy function for ioredis
 */
export const redisRetryStrategy = (times: number): number | void => {
  const { retryStrategy } = redisConfig;
  
  if (times > retryStrategy.retries) {
    // Stop retrying
    console.error('Redis: Max retries reached, stopping reconnection attempts');
    return undefined;
  }
  
  // Calculate delay with exponential backoff
  let delay = retryStrategy.minTimeout * Math.pow(retryStrategy.factor, times - 1);
  
  // Add randomization if enabled
  if (retryStrategy.randomize) {
    delay *= (1 + Math.random());
  }
  
  // Cap at max timeout
  delay = Math.min(delay, retryStrategy.maxTimeout);
  
  console.log(`Redis: Retry attempt ${times}, waiting ${delay}ms`);
  return Math.round(delay);
};

/**
 * Get Redis options for specific database
 */
export const getRedisOptionsForDb = (db: RedisDatabase): RedisOptions => ({
  ...redisConfig.connection,
  db,
  retryStrategy: redisRetryStrategy
});

/**
 * Helper function to generate cache keys
 */
export const generateCacheKey = (
  prefix: RedisKeyPrefix,
  ...parts: (string | number)[]
): string => {
  return `${prefix}${parts.join(':')}`;
};

/**
 * Helper function to parse cache key
 */
export const parseCacheKey = (key: string): {
  prefix: string;
  parts: string[];
} => {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) {
    return { prefix: '', parts: [key] };
  }
  
  const prefix = key.substring(0, colonIndex + 1);
  const parts = key.substring(colonIndex + 1).split(':');
  
  return { prefix, parts };
};

/**
 * Export default configuration
 */
export default redisConfig;