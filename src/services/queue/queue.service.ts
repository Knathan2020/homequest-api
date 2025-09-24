// ========================================
// QUEUE SERVICE - queue.service.ts
// Bull queue setup with priority, retries, and monitoring
// ========================================

import Bull, { Queue, Job, JobOptions, JobStatus, QueueOptions } from 'bull';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { ProcessingStage } from '../../types/processing.types';
import { ProcessingStatus } from '../../types/floor-plan.types';
import { redisConfig } from '../../config/redis.config';
import bullConfig, { QueueConfig } from '../../config/bull.config';

interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  health: 'healthy' | 'degraded' | 'unhealthy';
  avgProcessingTime: number;
  successRate: number;
}

interface JobProgress {
  stage: ProcessingStage;
  progress: number;
  message: string;
  details?: any;
}

// Removed unused interface

export enum JobPriority {
  CRITICAL = 1,
  HIGH = 5,
  NORMAL = 10,
  LOW = 20
}

export class QueueService extends EventEmitter {
  private queues: Map<string, Queue> = new Map();
  private redisClient: Redis;
  private redisSubscriber: Redis;
  private isInitialized: boolean = false;
  private metricsInterval?: NodeJS.Timeout;
  
  // Queue names
  public readonly QUEUE_NAMES = {
    OCR: 'ocr-processing',
    VISION: 'vision-processing',
    AI: 'ai-analysis',
    PIPELINE: 'pipeline-orchestration',
    EXPORT: 'export-generation',
    NOTIFICATION: 'notifications'
  };

  constructor() {
    super();
    
    // Initialize Redis clients
    this.redisClient = new Redis(redisConfig.connection);
    this.redisSubscriber = new Redis(redisConfig.connection);
    
    this.setupRedisEventHandlers();
  }

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🚀 Initializing queue service...');

    try {
      // Create queues for each processing type
      for (const [_key, queueName] of Object.entries(this.QUEUE_NAMES)) {
        const config = Object.values(bullConfig.queues).find((q: any) => q.name === queueName);
        if (config) {
          await this.createQueue(queueName, config);
        }
      }

      // Start metrics collection
      this.startMetricsCollection();

      this.isInitialized = true;
      console.log('✅ Queue service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize queue service:', error);
      throw error;
    }
  }

  /**
   * Create and configure a queue
   */
  private async createQueue(name: string, config: QueueConfig): Promise<Queue> {
    const queueOptions: QueueOptions = {
      redis: redisConfig.connection,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    };

    const queue = new Bull(name, queueOptions);
    
    // Setup queue event handlers
    this.setupQueueEventHandlers(queue, name);
    
    // Setup rate limiting if configured
    // Rate limiting not available in basic Bull

    this.queues.set(name, queue);
    
    console.log(`📦 Queue created: ${name}`);
    return queue;
  }

  /**
   * Add a job to a queue
   */
  async addJob<T = any>(
    queueName: string,
    data: T,
    options?: {
      priority?: JobPriority;
      delay?: number;
      attempts?: number;
      backoff?: number | { type: string; delay: number };
      timeout?: number;
      lifo?: boolean;
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
      stackTraceLimit?: number;
    }
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobOptions: JobOptions = {
      priority: options?.priority ?? JobPriority.NORMAL,
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff ?? { type: 'exponential', delay: 2000 },
      timeout: options?.timeout ?? 300000, // 5 minutes default
      lifo: options?.lifo ?? false,
      removeOnComplete: options?.removeOnComplete ?? true,
      removeOnFail: options?.removeOnFail ?? false,
      stackTraceLimit: options?.stackTraceLimit ?? 10
    };

    const job = await queue.add(data, jobOptions);
    
    this.emit('job:added', { queue: queueName, jobId: job.id, data });
    
    return job;
  }

  /**
   * Add multiple jobs to a queue
   */
  async addBulkJobs<T = any>(
    queueName: string,
    jobs: Array<{ data: T; opts?: JobOptions }>
  ): Promise<Job<T>[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const bulkJobs = await queue.addBulk(jobs);
    
    this.emit('jobs:bulk-added', { 
      queue: queueName, 
      count: bulkJobs.length,
      jobIds: bulkJobs.map(j => j.id)
    });
    
    return bulkJobs;
  }

  /**
   * Get job by ID
   */
  async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return await queue.getJob(jobId);
  }

  /**
   * Get job progress
   */
  async getJobProgress(queueName: string, jobId: string): Promise<JobProgress | null> {
    const job = await this.getJob(queueName, jobId);
    if (!job) return null;

    const progress = job.progress();
    return typeof progress === 'object' ? progress as JobProgress : {
      stage: ProcessingStage.INITIALIZATION,
      progress: progress as number,
      message: 'Processing...'
    };
  }

  /**
   * Update job progress
   */
  async updateJobProgress(
    job: Job,
    progress: JobProgress
  ): Promise<void> {
    await job.progress(progress);
    
    this.emit('job:progress', {
      queue: job.queue.name,
      jobId: job.id,
      progress
    });
  }

  /**
   * Get jobs by status
   */
  async getJobs(
    queueName: string,
    status: JobStatus | JobStatus[],
    start: number = 0,
    end: number = -1
  ): Promise<Job[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const statusArray = Array.isArray(status) ? status : [status];
    return await queue.getJobs(statusArray, start, end);
  }

  /**
   * Retry failed job
   */
  async retryJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue ${queueName}`);
    }

    await job.retry();
    
    this.emit('job:retried', {
      queue: queueName,
      jobId: job.id
    });
  }

  /**
   * Remove job
   */
  async removeJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue ${queueName}`);
    }

    await job.remove();
    
    this.emit('job:removed', {
      queue: queueName,
      jobId: job.id
    });
  }

  /**
   * Clean queue (remove completed/failed jobs)
   */
  async cleanQueue(
    queueName: string,
    grace: number = 0,
    status?: 'completed' | 'failed',
    limit?: number
  ): Promise<Job[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const removed = await queue.clean(grace, status, limit);
    
    this.emit('queue:cleaned', {
      queue: queueName,
      removed: removed.length,
      status,
      grace
    });
    
    return removed;
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName: string, isLocal?: boolean): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause(isLocal);
    
    this.emit('queue:paused', {
      queue: queueName,
      isLocal
    });
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName: string, isLocal?: boolean): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume(isLocal);
    
    this.emit('queue:resumed', {
      queue: queueName,
      isLocal
    });
  }

  /**
   * Empty queue (remove all jobs)
   */
  async emptyQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.empty();
    
    this.emit('queue:emptied', {
      queue: queueName
    });
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(queueName: string): Promise<QueueMetrics> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [
      waitingCount,
      activeCount,
      completedCount,
      failedCount,
      delayedCount,
      isPaused
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused()
    ]);

    // Calculate average processing time
    const completedJobs = await queue.getCompleted(0, 100);
    let totalProcessingTime = 0;
    let processedCount = 0;

    for (const job of completedJobs) {
      if (job.finishedOn && job.processedOn) {
        totalProcessingTime += job.finishedOn - job.processedOn;
        processedCount++;
      }
    }

    const avgProcessingTime = processedCount > 0 ? 
      totalProcessingTime / processedCount : 0;

    // Calculate success rate
    const totalProcessed = completedCount + failedCount;
    const successRate = totalProcessed > 0 ? 
      completedCount / totalProcessed : 0;

    // Determine health status
    let health: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (failedCount > completedCount * 0.1 || activeCount > waitingCount * 2) {
      health = 'degraded';
    }
    if (failedCount > completedCount * 0.5 || isPaused) {
      health = 'unhealthy';
    }

    return {
      waiting: waitingCount,
      active: activeCount,
      completed: completedCount,
      failed: failedCount,
      delayed: delayedCount,
      paused: isPaused,
      health,
      avgProcessingTime,
      successRate
    };
  }

  /**
   * Get all queues metrics
   */
  async getAllMetrics(): Promise<Map<string, QueueMetrics>> {
    const metrics = new Map<string, QueueMetrics>();

    for (const [name, _] of this.queues) {
      metrics.set(name, await this.getQueueMetrics(name));
    }

    return metrics;
  }

  /**
   * Setup queue event handlers
   */
  private setupQueueEventHandlers(queue: Queue, name: string): void {
    // Job lifecycle events
    queue.on('active', (job: Job) => {
      this.emit('job:active', {
        queue: name,
        jobId: job.id,
        data: job.data
      });
    });

    queue.on('completed', (job: Job, result: any) => {
      this.emit('job:completed', {
        queue: name,
        jobId: job.id,
        result
      });

      // Auto-cleanup old completed jobs
      this.scheduleJobCleanup(name, job.id.toString());
    });

    queue.on('failed', (job: Job, error: Error) => {
      this.emit('job:failed', {
        queue: name,
        jobId: job.id,
        error: error.message,
        stack: error.stack
      });

      // Check if should alert
      this.checkFailureThreshold(name);
    });

    queue.on('progress', (job: Job, progress: any) => {
      this.emit('job:progress', {
        queue: name,
        jobId: job.id,
        progress
      });
    });

    queue.on('stalled', (job: Job) => {
      this.emit('job:stalled', {
        queue: name,
        jobId: job.id
      });
    });

    // Queue events
    queue.on('error', (error: Error) => {
      console.error(`Queue ${name} error:`, error);
      this.emit('queue:error', {
        queue: name,
        error: error.message
      });
    });

    queue.on('waiting', (jobId: string) => {
      this.emit('job:waiting', {
        queue: name,
        jobId
      });
    });

    queue.on('drained', () => {
      this.emit('queue:drained', {
        queue: name
      });
    });
  }

  /**
   * Setup Redis event handlers
   */
  private setupRedisEventHandlers(): void {
    this.redisClient.on('error', (error) => {
      console.error('Redis client error:', error);
      this.emit('redis:error', error);
    });

    this.redisClient.on('connect', () => {
      console.log('✅ Redis client connected');
      this.emit('redis:connected');
    });

    this.redisClient.on('disconnect', () => {
      console.log('❌ Redis client disconnected');
      this.emit('redis:disconnected');
    });

    this.redisSubscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error);
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Collect metrics every 30 seconds
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.getAllMetrics();
        
        // Store metrics in Redis
        const metricsKey = `metrics:${Date.now()}`;
        await this.redisClient.setex(
          metricsKey,
          3600, // Keep for 1 hour
          JSON.stringify(Array.from(metrics.entries()))
        );

        this.emit('metrics:collected', metrics);
      } catch (error) {
        console.error('Failed to collect metrics:', error);
      }
    }, 30000);
  }

  /**
   * Schedule job cleanup
   */
  private scheduleJobCleanup(queueName: string, jobId: string): void {
    // Schedule cleanup after 1 hour
    setTimeout(async () => {
      try {
        const job = await this.getJob(queueName, jobId);
        if (job && await job.isCompleted()) {
          await job.remove();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }, 3600000); // 1 hour
  }

  /**
   * Check failure threshold
   */
  private async checkFailureThreshold(queueName: string): Promise<void> {
    const metrics = await this.getQueueMetrics(queueName);
    
    if (metrics.successRate < 0.5 && metrics.failed > 10) {
      this.emit('queue:high-failure-rate', {
        queue: queueName,
        failureRate: 1 - metrics.successRate,
        failedCount: metrics.failed
      });
    }
  }

  /**
   * Create job dependencies
   */
  async createJobDependency(
    parentJobId: string,
    parentQueue: string,
    dependentQueue: string,
    dependentData: any
  ): Promise<Job> {
    const parentJob = await this.getJob(parentQueue, parentJobId);
    if (!parentJob) {
      throw new Error(`Parent job ${parentJobId} not found`);
    }

    // Add dependent job that waits for parent
    const dependentJob = await this.addJob(dependentQueue, {
      ...dependentData,
      parentJobId,
      parentQueue
    }, {
      delay: 100 // Small delay to ensure parent processes first
    });

    // Store dependency relationship
    await this.redisClient.sadd(
      `job:dependencies:${parentJobId}`,
      `${dependentQueue}:${dependentJob.id}`
    );

    return dependentJob;
  }

  /**
   * Handle job failure with cleanup
   */
  async handleJobFailure(
    job: Job,
    error: Error,
    cleanup?: () => Promise<void>
  ): Promise<void> {
    console.error(`Job ${job.id} failed:`, error);

    // Perform cleanup if provided
    if (cleanup) {
      try {
        await cleanup();
      } catch (cleanupError) {
        console.error(`Cleanup failed for job ${job.id}:`, cleanupError);
      }
    }

    // Store failure details
    await this.redisClient.hset(
      `job:failures:${job.queue.name}`,
      job.id as string,
      JSON.stringify({
        error: error.message,
        stack: error.stack,
        timestamp: Date.now(),
        attempts: job.attemptsMade,
        data: job.data
      })
    );

    // Check if should retry
    if (job.attemptsMade < (job.opts.attempts || 3)) {
      await job.retry();
    } else {
      // Move to dead letter queue
      await this.moveToDeadLetterQueue(job);
    }
  }

  /**
   * Move failed job to dead letter queue
   */
  private async moveToDeadLetterQueue(job: Job): Promise<void> {
    const dlqName = `${job.queue.name}:dead-letter`;
    
    // Create DLQ if it doesn't exist
    if (!this.queues.has(dlqName)) {
      await this.createQueue(dlqName, {
        name: dlqName as any,
        options: {} as any,
        defaultJobOptions: {
          attempts: 0
        },
        workerOptions: {
          concurrency: 1
        }
      });
    }

    // Add to DLQ
    await this.addJob(dlqName, {
      originalQueue: job.queue.name,
      originalJobId: job.id,
      data: job.data,
      failedAt: Date.now(),
      attempts: job.attemptsMade,
      error: job.failedReason
    });

    this.emit('job:dead-letter', {
      queue: job.queue.name,
      jobId: job.id
    });
  }

  /**
   * Process dead letter queue
   */
  async processDeadLetterQueue(
    queueName: string,
    processor: (job: Job) => Promise<void>
  ): Promise<void> {
    const dlqName = `${queueName}:dead-letter`;
    const dlq = this.queues.get(dlqName);
    
    if (!dlq) {
      console.log(`No dead letter queue for ${queueName}`);
      return;
    }

    const jobs = await dlq.getJobs(['failed', 'waiting']);
    
    for (const job of jobs) {
      try {
        await processor(job);
        await job.remove();
      } catch (error) {
        console.error(`Failed to process DLQ job ${job.id}:`, error);
      }
    }
  }

  /**
   * Get queue health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    queues: Map<string, QueueMetrics>;
    redis: {
      connected: boolean;
      latency: number;
    };
  }> {
    const queues = await this.getAllMetrics();
    
    // Check Redis connection
    const startTime = Date.now();
    let redisConnected = false;
    let latency = 0;
    
    try {
      await this.redisClient.ping();
      redisConnected = true;
      latency = Date.now() - startTime;
    } catch (error) {
      redisConnected = false;
    }

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!redisConnected) {
      overallHealth = 'unhealthy';
    } else {
      for (const [_, metrics] of queues) {
        if (metrics.health === 'unhealthy') {
          overallHealth = 'unhealthy';
          break;
        } else if (metrics.health === 'degraded') {
          overallHealth = 'degraded';
        }
      }
    }

    return {
      status: overallHealth,
      queues,
      redis: {
        connected: redisConnected,
        latency
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down queue service...');

    // Stop metrics collection
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Close all queues
    const closePromises = Array.from(this.queues.values()).map(queue => 
      queue.close()
    );
    
    await Promise.all(closePromises);

    // Close Redis connections
    await this.redisClient.quit();
    await this.redisSubscriber.quit();

    this.queues.clear();
    this.isInitialized = false;

    console.log('✅ Queue service shut down successfully');
  }

  /**
   * Export queue for external processing
   */
  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const queueService = new QueueService();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { queueService, JobPriority } from './services/queue/queue.service';

// Initialize service
await queueService.initialize();

// Add a job to OCR queue
const ocrJob = await queueService.addJob(
  queueService.QUEUE_NAMES.OCR,
  {
    imageUrl: 'https://example.com/floor-plan.jpg',
    userId: 'user123',
    settings: {
      language: 'eng',
      dpi: 300
    }
  },
  {
    priority: JobPriority.HIGH,
    attempts: 5,
    timeout: 120000 // 2 minutes
  }
);

console.log(`OCR job added: ${ocrJob.id}`);

// Monitor job progress
queueService.on('job:progress', ({ jobId, progress }) => {
  console.log(`Job ${jobId}: ${progress.message} (${progress.progress}%)`);
});

// Handle job completion
queueService.on('job:completed', async ({ jobId, result }) => {
  console.log(`Job ${jobId} completed:`, result);
});

// Get queue metrics
const metrics = await queueService.getQueueMetrics(queueService.QUEUE_NAMES.OCR);
console.log(`OCR Queue - Active: ${metrics.active}, Waiting: ${metrics.waiting}`);
console.log(`Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);

// Retry failed job
await queueService.retryJob(queueService.QUEUE_NAMES.OCR, 'failed-job-id');

// Clean old jobs
await queueService.cleanQueue(
  queueService.QUEUE_NAMES.OCR,
  3600000, // 1 hour grace period
  'completed'
);

// Get health status
const health = await queueService.getHealthStatus();
console.log(`System health: ${health.status}`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await queueService.shutdown();
  process.exit(0);
});
*/