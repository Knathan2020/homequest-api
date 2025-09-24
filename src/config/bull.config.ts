/**
 * Bull Queue Configuration
 * Job queue settings, retry strategies, and processing options
 */

import { QueueOptions, WorkerOptions, JobsOptions } from 'bullmq';
import { getRedisOptionsForDb, RedisDatabase } from './redis.config';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Queue names for different processing tasks
 */
export enum QueueName {
  FLOOR_PLAN_UPLOAD = 'floor-plan-upload',
  FLOOR_PLAN_PROCESSING = 'floor-plan-processing',
  IMAGE_PREPROCESSING = 'image-preprocessing',
  OCR_EXTRACTION = 'ocr-extraction',
  ROOM_DETECTION = 'room-detection',
  DIMENSION_CALCULATION = 'dimension-calculation',
  MODEL_3D_GENERATION = '3d-generation',
  PDF_CONVERSION = 'pdf-conversion',
  THUMBNAIL_GENERATION = 'thumbnail-generation',
  NOTIFICATION = 'notification',
  EMAIL = 'email',
  CLEANUP = 'cleanup',
  ANALYTICS = 'analytics',
  EXPORT = 'export',
  IMPORT = 'import'
}

/**
 * Job priority levels
 */
export enum JobPriority {
  CRITICAL = 1,
  HIGH = 2,
  NORMAL = 3,
  LOW = 4,
  DEFERRED = 5
}

/**
 * Backoff strategies
 */
export enum BackoffStrategy {
  FIXED = 'fixed',
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
  CUSTOM = 'custom'
}

/**
 * Queue configuration interface
 */
export interface QueueConfig {
  name: QueueName;
  options: QueueOptions;
  defaultJobOptions: JobsOptions;
  workerOptions: Omit<WorkerOptions, 'connection'>;
  rateLimiter?: RateLimiterConfig;
  metrics?: MetricsConfig;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  max: number; // Max number of jobs
  duration: number; // Per duration in milliseconds
  bounceBack?: boolean; // Bounce jobs back to wait state when rate limited
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  enabled: boolean;
  collectInterval: number; // Milliseconds
  retentionDays: number;
  aggregations: string[];
}

/**
 * Custom backoff configuration
 */
export interface BackoffConfig {
  strategy: BackoffStrategy;
  delay: number; // Base delay in milliseconds
  attempts: number; // Max retry attempts
  factor?: number; // Multiplication factor for exponential
  jitter?: boolean; // Add randomization
  maxDelay?: number; // Maximum delay cap
}

/**
 * Processing limits configuration
 */
export interface ProcessingLimits {
  maxFileSize: number; // Bytes
  maxProcessingTime: number; // Milliseconds
  maxMemoryUsage: number; // Bytes
  maxConcurrentJobs: number;
  maxJobsPerWorker: number;
}

/**
 * Get base Redis connection for queues
 */
const getRedisConnection = () => ({
  ...getRedisOptionsForDb(RedisDatabase.QUEUES),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true
});

/**
 * Calculate backoff delay
 */
export const calculateBackoff = (
  attemptsMade: number,
  config: BackoffConfig
): number => {
  let delay: number;

  switch (config.strategy) {
    case BackoffStrategy.FIXED:
      delay = config.delay;
      break;
      
    case BackoffStrategy.LINEAR:
      delay = config.delay * attemptsMade;
      break;
      
    case BackoffStrategy.EXPONENTIAL:
      delay = config.delay * Math.pow(config.factor || 2, attemptsMade - 1);
      break;
      
    default:
      delay = config.delay;
  }

  // Add jitter if enabled
  if (config.jitter) {
    const jitterRange = delay * 0.2; // 20% jitter
    delay += (Math.random() - 0.5) * jitterRange;
  }

  // Apply max delay cap
  if (config.maxDelay) {
    delay = Math.min(delay, config.maxDelay);
  }

  return Math.round(delay);
};

/**
 * Default backoff configuration
 */
export const defaultBackoffConfig: BackoffConfig = {
  strategy: BackoffStrategy.EXPONENTIAL,
  delay: parseInt(process.env.BULL_BACKOFF_DELAY || '1000'),
  attempts: parseInt(process.env.BULL_MAX_ATTEMPTS || '5'),
  factor: parseFloat(process.env.BULL_BACKOFF_FACTOR || '2'),
  jitter: process.env.BULL_BACKOFF_JITTER === 'true',
  maxDelay: parseInt(process.env.BULL_MAX_BACKOFF_DELAY || '300000') // 5 minutes
};

/**
 * Default job options
 */
export const defaultJobOptions: JobsOptions = {
  attempts: parseInt(process.env.BULL_DEFAULT_ATTEMPTS || '3'),
  backoff: {
    type: 'custom'
  },
  removeOnComplete: {
    age: parseInt(process.env.BULL_REMOVE_ON_COMPLETE_AGE || '86400'), // 24 hours
    count: parseInt(process.env.BULL_REMOVE_ON_COMPLETE_COUNT || '100')
  },
  removeOnFail: {
    age: parseInt(process.env.BULL_REMOVE_ON_FAIL_AGE || '604800'), // 7 days
    count: parseInt(process.env.BULL_REMOVE_ON_FAIL_COUNT || '500')
  },
  stackTraceLimit: parseInt(process.env.BULL_STACK_TRACE_LIMIT || '10')
};

/**
 * Default worker options
 */
export const defaultWorkerOptions: Omit<WorkerOptions, 'connection'> = {
  concurrency: parseInt(process.env.BULL_WORKER_CONCURRENCY || '5'),
  limiter: {
    max: parseInt(process.env.BULL_LIMITER_MAX || '10'),
    duration: parseInt(process.env.BULL_LIMITER_DURATION || '1000')
  },
  drainDelay: parseInt(process.env.BULL_DRAIN_DELAY || '5'),
  stalledInterval: parseInt(process.env.BULL_STALLED_INTERVAL || '30000'),
  maxStalledCount: parseInt(process.env.BULL_MAX_STALLED_COUNT || '2'),
  lockDuration: parseInt(process.env.BULL_LOCK_DURATION || '30000'),
  lockRenewTime: parseInt(process.env.BULL_LOCK_RENEW_TIME || '15000')
};

/**
 * Advanced queue settings
 */
// Advanced settings moved to individual queue configurations
export const backoffStrategies = {
  custom: (attemptsMade: number) => calculateBackoff(attemptsMade, defaultBackoffConfig)
};

/**
 * Queue-specific configurations
 */
export const queueConfigs: Record<QueueName, QueueConfig> = {
  [QueueName.FLOOR_PLAN_UPLOAD]: {
    name: QueueName.FLOOR_PLAN_UPLOAD,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.HIGH,
        attempts: 3
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
      priority: JobPriority.HIGH
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 10
    },
    rateLimiter: {
      max: 100,
      duration: 60000 // 100 uploads per minute
    },
    metrics: {
      enabled: true,
      collectInterval: 60000,
      retentionDays: 30,
      aggregations: ['count', 'duration', 'wait', 'failed']
    }
  },

  [QueueName.FLOOR_PLAN_PROCESSING]: {
    name: QueueName.FLOOR_PLAN_PROCESSING,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.NORMAL,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
      priority: JobPriority.NORMAL,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 3 // Heavy processing, limit concurrency
    },
    rateLimiter: {
      max: 20,
      duration: 60000 // 20 processing jobs per minute
    },
    metrics: {
      enabled: true,
      collectInterval: 30000,
      retentionDays: 90,
      aggregations: ['count', 'duration', 'wait', 'failed', 'completed']
    }
  },

  [QueueName.IMAGE_PREPROCESSING]: {
    name: QueueName.IMAGE_PREPROCESSING,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.HIGH
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 5
    }
  },

  [QueueName.OCR_EXTRACTION]: {
    name: QueueName.OCR_EXTRACTION,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.NORMAL,
        attempts: 4
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 4
    }
  },

  [QueueName.ROOM_DETECTION]: {
    name: QueueName.ROOM_DETECTION,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.HIGH,
        attempts: 3
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 2 // CPU intensive
    }
  },

  [QueueName.DIMENSION_CALCULATION]: {
    name: QueueName.DIMENSION_CALCULATION,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.NORMAL
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 8
    }
  },

  [QueueName.MODEL_3D_GENERATION]: {
    name: QueueName.MODEL_3D_GENERATION,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.LOW,
        attempts: 2
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 1 // Very resource intensive
    },
    rateLimiter: {
      max: 5,
      duration: 300000 // 5 per 5 minutes
    }
  },

  [QueueName.PDF_CONVERSION]: {
    name: QueueName.PDF_CONVERSION,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.NORMAL
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 3
    }
  },

  [QueueName.THUMBNAIL_GENERATION]: {
    name: QueueName.THUMBNAIL_GENERATION,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.LOW
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 10
    }
  },

  [QueueName.NOTIFICATION]: {
    name: QueueName.NOTIFICATION,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.HIGH,
        attempts: 5
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 20
    }
  },

  [QueueName.EMAIL]: {
    name: QueueName.EMAIL,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.NORMAL,
        attempts: 3
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 10
    },
    rateLimiter: {
      max: 50,
      duration: 60000 // 50 emails per minute
    }
  },

  [QueueName.CLEANUP]: {
    name: QueueName.CLEANUP,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.DEFERRED,
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 1
    }
  },

  [QueueName.ANALYTICS]: {
    name: QueueName.ANALYTICS,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.LOW
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 2
    }
  },

  [QueueName.EXPORT]: {
    name: QueueName.EXPORT,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.NORMAL
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 3
    }
  },

  [QueueName.IMPORT]: {
    name: QueueName.IMPORT,
    options: {
      connection: getRedisConnection(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: JobPriority.NORMAL,
        attempts: 2
      }
    },
    defaultJobOptions: {
      ...defaultJobOptions,
    },
    workerOptions: {
      ...defaultWorkerOptions,
      concurrency: 2
    }
  }
};

/**
 * Processing limits by queue type
 */
export const processingLimits: Record<QueueName, ProcessingLimits> = {
  [QueueName.FLOOR_PLAN_UPLOAD]: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxProcessingTime: 60000, // 1 minute
    maxMemoryUsage: 512 * 1024 * 1024, // 512MB
    maxConcurrentJobs: 50,
    maxJobsPerWorker: 10
  },
  [QueueName.FLOOR_PLAN_PROCESSING]: {
    maxFileSize: 200 * 1024 * 1024, // 200MB
    maxProcessingTime: 300000, // 5 minutes
    maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
    maxConcurrentJobs: 10,
    maxJobsPerWorker: 2
  },
  [QueueName.IMAGE_PREPROCESSING]: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxProcessingTime: 60000,
    maxMemoryUsage: 256 * 1024 * 1024, // 256MB
    maxConcurrentJobs: 20,
    maxJobsPerWorker: 5
  },
  [QueueName.OCR_EXTRACTION]: {
    maxFileSize: 50 * 1024 * 1024,
    maxProcessingTime: 120000,
    maxMemoryUsage: 512 * 1024 * 1024,
    maxConcurrentJobs: 15,
    maxJobsPerWorker: 3
  },
  [QueueName.ROOM_DETECTION]: {
    maxFileSize: 100 * 1024 * 1024,
    maxProcessingTime: 180000,
    maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
    maxConcurrentJobs: 5,
    maxJobsPerWorker: 1
  },
  [QueueName.DIMENSION_CALCULATION]: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxProcessingTime: 60000,
    maxMemoryUsage: 128 * 1024 * 1024, // 128MB
    maxConcurrentJobs: 30,
    maxJobsPerWorker: 10
  },
  [QueueName.MODEL_3D_GENERATION]: {
    maxFileSize: 200 * 1024 * 1024,
    maxProcessingTime: 600000,
    maxMemoryUsage: 4 * 1024 * 1024 * 1024, // 4GB
    maxConcurrentJobs: 2,
    maxJobsPerWorker: 1
  },
  [QueueName.PDF_CONVERSION]: {
    maxFileSize: 100 * 1024 * 1024,
    maxProcessingTime: 120000,
    maxMemoryUsage: 512 * 1024 * 1024,
    maxConcurrentJobs: 10,
    maxJobsPerWorker: 3
  },
  [QueueName.THUMBNAIL_GENERATION]: {
    maxFileSize: 20 * 1024 * 1024,
    maxProcessingTime: 30000,
    maxMemoryUsage: 128 * 1024 * 1024,
    maxConcurrentJobs: 50,
    maxJobsPerWorker: 10
  },
  [QueueName.NOTIFICATION]: {
    maxFileSize: 1 * 1024 * 1024, // 1MB
    maxProcessingTime: 10000,
    maxMemoryUsage: 64 * 1024 * 1024, // 64MB
    maxConcurrentJobs: 100,
    maxJobsPerWorker: 20
  },
  [QueueName.EMAIL]: {
    maxFileSize: 10 * 1024 * 1024,
    maxProcessingTime: 30000,
    maxMemoryUsage: 128 * 1024 * 1024,
    maxConcurrentJobs: 50,
    maxJobsPerWorker: 10
  },
  [QueueName.CLEANUP]: {
    maxFileSize: 0,
    maxProcessingTime: 600000,
    maxMemoryUsage: 256 * 1024 * 1024,
    maxConcurrentJobs: 1,
    maxJobsPerWorker: 1
  },
  [QueueName.ANALYTICS]: {
    maxFileSize: 0,
    maxProcessingTime: 300000,
    maxMemoryUsage: 512 * 1024 * 1024,
    maxConcurrentJobs: 3,
    maxJobsPerWorker: 1
  },
  [QueueName.EXPORT]: {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    maxProcessingTime: 300000,
    maxMemoryUsage: 1024 * 1024 * 1024,
    maxConcurrentJobs: 10,
    maxJobsPerWorker: 3
  },
  [QueueName.IMPORT]: {
    maxFileSize: 500 * 1024 * 1024,
    maxProcessingTime: 600000,
    maxMemoryUsage: 2 * 1024 * 1024 * 1024,
    maxConcurrentJobs: 5,
    maxJobsPerWorker: 2
  }
};

/**
 * Get queue configuration by name
 */
export const getQueueConfig = (queueName: QueueName): QueueConfig => {
  return queueConfigs[queueName];
};

/**
 * Get processing limits by queue name
 */
export const getProcessingLimits = (queueName: QueueName): ProcessingLimits => {
  return processingLimits[queueName];
};

/**
 * Export default configuration
 */
export default {
  queues: queueConfigs,
  limits: processingLimits,
  defaultJobOptions,
  defaultWorkerOptions,
  backoffStrategies,
  defaultBackoffConfig
};