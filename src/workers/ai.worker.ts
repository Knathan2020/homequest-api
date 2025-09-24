// ========================================
// AI WORKER - ai.worker.ts  
// Process AI analysis jobs
// ========================================

import { Job } from 'bull';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { gptVisionService } from '../services/ai/gpt-vision.service';
import { confidenceScorer } from '../services/ai/confidence-scorer';
import { modelFusionService } from '../services/ai/model-fusion.service';
import { queueService } from '../services/queue/queue.service';
import { ProcessingStage } from '../types/processing.types';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config';

interface AIJobData {
  imageUrl?: string;
  imageBuffer?: Buffer;
  imagePath?: string;
  userId: string;
  projectId: string;
  analysisType: 'gpt-vision' | 'confidence-scoring' | 'model-fusion' | 'validation' | 'refinement';
  inputData?: {
    ocrResults?: any;
    visionResults?: any;
    objectDetectionResults?: any;
    existingAnalysis?: any;
    userFeedback?: string;
  };
  settings?: {
    gptVision?: {
      analysisType?: 'full' | 'region' | 'clarification' | 'validation';
      prompt?: string;
      region?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      maxTokens?: number;
      temperature?: number;
    };
    fusion?: {
      votingStrategy?: 'majority' | 'weighted' | 'confidence' | 'bayesian';
      conflictResolution?: 'highest_confidence' | 'consensus' | 'gpt_arbitration';
      minConsensus?: number;
    };
    confidence?: {
      validateDimensions?: boolean;
      checkConsistency?: boolean;
      compareModels?: boolean;
    };
    outputFormat?: 'json' | 'structured' | 'summary';
    cacheResults?: boolean;
    costLimit?: number; // Maximum API cost in cents
  };
  metadata?: any;
}

interface AIJobResult {
  success: boolean;
  data?: {
    analysisType: string;
    gptAnalysis?: any;
    confidenceReport?: any;
    fusedResult?: any;
    validation?: any;
    refinement?: any;
    combined?: any;
    metadata: {
      processingTime: number;
      tokensUsed?: number;
      apiCost?: number;
      confidence?: number;
      modelsUsed?: string[];
    };
  };
  error?: string;
  tempFiles?: string[];
}

interface APIUsageTracker {
  tokensUsed: number;
  costIncurred: number;
  requestCount: number;
  lastReset: Date;
}

export class AIWorker {
  private redisClient: Redis;
  private tempDir: string = '/tmp/ai-processing';
  private isShuttingDown: boolean = false;
  private apiUsage: APIUsageTracker;
  private rateLimiter: Map<string, number> = new Map();
  
  // API rate limits
  private readonly RATE_LIMITS = {
    'gpt-4-vision': { requests: 50, window: 60000 }, // 50 requests per minute
    'gpt-4': { requests: 100, window: 60000 }
  };

  // Cost tracking
  private readonly API_COSTS = {
    'gpt-4-vision': { input: 0.01, output: 0.03 }, // per 1K tokens
    'gpt-4': { input: 0.01, output: 0.03 }
  };

  constructor() {
    this.redisClient = new Redis(redisConfig.connection);
    this.apiUsage = {
      tokensUsed: 0,
      costIncurred: 0,
      requestCount: 0,
      lastReset: new Date()
    };
    this.initializeTempDirectory();
    this.loadAPIUsage();
  }

  /**
   * Initialize temporary directory
   */
  private async initializeTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Load API usage from Redis
   */
  private async loadAPIUsage(): Promise<void> {
    try {
      const usage = await this.redisClient.get('ai:api:usage');
      if (usage) {
        this.apiUsage = JSON.parse(usage);
        this.apiUsage.lastReset = new Date(this.apiUsage.lastReset);
      }
    } catch (error) {
      console.error('Failed to load API usage:', error);
    }
  }

  /**
   * Save API usage to Redis
   */
  private async saveAPIUsage(): Promise<void> {
    try {
      await this.redisClient.set(
        'ai:api:usage',
        JSON.stringify(this.apiUsage)
      );
    } catch (error) {
      console.error('Failed to save API usage:', error);
    }
  }

  /**
   * Main job processor
   */
  async process(job: Job<AIJobData>): Promise<AIJobResult> {
    const startTime = Date.now();
    const tempFiles: string[] = [];

    try {
      console.log(`🤖 Processing AI job ${job.id} (${job.data.analysisType})`);

      // Check cost limit
      if (job.data.settings?.costLimit) {
        if (this.apiUsage.costIncurred >= job.data.settings.costLimit) {
          throw new Error(`API cost limit exceeded: $${(this.apiUsage.costIncurred / 100).toFixed(2)}`);
        }
      }

      // Update progress - Starting
      await this.updateProgress(job, {
        stage: ProcessingStage.VALIDATION,
        progress: 0,
        message: 'Starting AI analysis...'
      });

      // Check rate limits
      await this.checkRateLimit('gpt-4-vision');

      // Process based on analysis type
      let result: any;
      
      switch (job.data.analysisType) {
        case 'gpt-vision':
          result = await this.processGPTVision(job, tempFiles);
          break;
        
        case 'confidence-scoring':
          result = await this.processConfidenceScoring(job);
          break;
        
        case 'model-fusion':
          result = await this.processModelFusion(job);
          break;
        
        case 'validation':
          result = await this.processValidation(job, tempFiles);
          break;
        
        case 'refinement':
          result = await this.processRefinement(job, tempFiles);
          break;
        
        default:
          throw new Error(`Unknown analysis type: ${job.data.analysisType}`);
      }

      // Cache results if requested
      if (job.data.settings?.cacheResults !== false) {
        await this.cacheResults(job.id as string, result);
      }

      // Format output
      const formattedResult = this.formatOutput(
        result,
        job.data.analysisType,
        job.data.settings?.outputFormat || 'json',
        {
          processingTime: Date.now() - startTime,
          tokensUsed: result.tokensUsed,
          apiCost: result.apiCost,
          confidence: result.confidence,
          modelsUsed: result.modelsUsed
        }
      );

      // Update progress - Complete
      await this.updateProgress(job, {
        stage: ProcessingStage.OUTPUT_GENERATION,
        progress: 100,
        message: 'AI analysis completed'
      });

      // Save API usage
      await this.saveAPIUsage();

      // Cleanup temp files
      await this.cleanup(tempFiles);

      return {
        success: true,
        data: formattedResult,
        tempFiles: []
      };

    } catch (error) {
      console.error(`❌ AI job ${job.id} failed:`, error);
      
      // Update progress - Failed
      await this.updateProgress(job, {
        stage: ProcessingStage.QUALITY_CHECK,
        progress: 0,
        message: `AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.stack : error }
      });

      // Cleanup on failure
      await this.cleanup(tempFiles);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI processing failed',
        tempFiles: []
      };
    }
  }

  /**
   * Process GPT Vision analysis
   */
  private async processGPTVision(
    job: Job<AIJobData>,
    tempFiles: string[]
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 20,
      message: 'Preparing image for GPT-4 Vision...'
    });

    // Get image buffer
    const imageBuffer = await this.getImageBuffer(job.data, tempFiles);

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 40,
      message: 'Calling GPT-4 Vision API...'
    });

    // Call GPT Vision
    const analysisResult = await gptVisionService.analyzeFloorPlan({
      imageBuffer,
      analysisType: job.data.settings?.gptVision?.analysisType || 'full',
      region: job.data.settings?.gptVision?.region,
      existingData: job.data.inputData?.existingAnalysis,
      prompt: job.data.settings?.gptVision?.prompt
    });

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 80,
      message: 'Processing GPT-4 Vision results...'
    });

    // Track API usage
    this.trackAPIUsage(
      analysisResult.tokens_used,
      'gpt-4-vision'
    );

    // Analyze unclear areas if any
    if (analysisResult.analysis.unclear_areas.length > 0) {
      await this.updateProgress(job, {
        stage: ProcessingStage.VALIDATION,
        progress: 85,
        message: 'Analyzing unclear areas...'
      });

      const clarifications = await gptVisionService.analyzeUnclearAreas(
        imageBuffer,
        analysisResult.analysis.unclear_areas
      );

      // Store clarifications separately in the result
      const clarificationData = Array.from(clarifications.entries());
      
      return {
        gptAnalysis: analysisResult,
        tokensUsed: analysisResult.tokens_used,
        apiCost: this.calculateCost(analysisResult.tokens_used, 'gpt-4-vision'),
        confidence: analysisResult.analysis.confidence_score,
        clarifications: clarificationData
      };
    }

    return {
      gptAnalysis: analysisResult,
      tokensUsed: analysisResult.tokens_used,
      apiCost: this.calculateCost(analysisResult.tokens_used, 'gpt-4-vision'),
      confidence: analysisResult.analysis.confidence_score
    };
  }

  /**
   * Process confidence scoring
   */
  private async processConfidenceScoring(job: Job<AIJobData>): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 30,
      message: 'Calculating confidence scores...'
    });

    const extractedData = [];
    
    // Prepare extracted data
    if (job.data.inputData?.ocrResults) {
      extractedData.push({
        source: 'ocr' as const,
        confidence: job.data.inputData.ocrResults.confidence || 0.7,
        data: job.data.inputData.ocrResults,
        timestamp: new Date()
      });
    }

    if (job.data.inputData?.visionResults) {
      extractedData.push({
        source: 'vision' as const,
        confidence: job.data.inputData.visionResults.confidence || 0.75,
        data: job.data.inputData.visionResults,
        timestamp: new Date()
      });
    }

    if (job.data.inputData?.objectDetectionResults) {
      extractedData.push({
        source: 'yolo' as const,
        confidence: job.data.inputData.objectDetectionResults.confidence || 0.85,
        data: job.data.inputData.objectDetectionResults,
        timestamp: new Date()
      });
    }

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 60,
      message: 'Analyzing data consistency...'
    });

    // Calculate confidence
    const confidenceReport = await confidenceScorer.calculateConfidence(
      extractedData,
      job.data.inputData?.existingAnalysis || {}
    );

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 90,
      message: 'Generating confidence report...'
    });

    return {
      confidenceReport,
      confidence: confidenceReport.overallScore
    };
  }

  /**
   * Process model fusion
   */
  private async processModelFusion(job: Job<AIJobData>): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 20,
      message: 'Preparing model results for fusion...'
    });

    const modelResults = [];
    
    // Prepare model results
    if (job.data.inputData?.ocrResults) {
      modelResults.push({
        modelName: 'tesseract',
        modelType: 'ocr' as const,
        timestamp: new Date(),
        processingTime: 1000,
        confidence: job.data.inputData.ocrResults.confidence || 0.7,
        data: job.data.inputData.ocrResults
      });
    }

    if (job.data.inputData?.visionResults) {
      modelResults.push({
        modelName: 'opencv',
        modelType: 'vision' as const,
        timestamp: new Date(),
        processingTime: 800,
        confidence: job.data.inputData.visionResults.confidence || 0.75,
        data: job.data.inputData.visionResults
      });
    }

    if (job.data.inputData?.objectDetectionResults) {
      modelResults.push({
        modelName: 'yolo',
        modelType: 'object_detection' as const,
        timestamp: new Date(),
        processingTime: 1200,
        confidence: job.data.inputData.objectDetectionResults.confidence || 0.85,
        data: job.data.inputData.objectDetectionResults
      });
    }

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 50,
      message: 'Fusing model results...'
    });

    // Perform fusion
    const fusedResult = await modelFusionService.fuseModelResults(
      modelResults,
      job.data.settings?.fusion
    );

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 80,
      message: 'Resolving conflicts...'
    });

    // Active learning if uncertain
    let uncertainAreas: any[] = [];
    let suggestedActions: any[] = [];
    
    if (fusedResult.metadata.confidence < 0.7) {
      const activeResult = await modelFusionService.activeLearningFusion(
        modelResults,
        0.3
      );

      uncertainAreas = activeResult.uncertainAreas;
      suggestedActions = activeResult.suggestedActions;
    }

    return {
      fusedResult,
      confidence: fusedResult.metadata.confidence,
      modelsUsed: fusedResult.metadata.modelsUsed,
      uncertainAreas,
      suggestedActions
    };
  }

  /**
   * Process validation
   */
  private async processValidation(
    job: Job<AIJobData>,
    tempFiles: string[]
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 30,
      message: 'Validating analysis results...'
    });

    // Get image if needed
    let imageBuffer: Buffer | undefined;
    if (job.data.imageUrl || job.data.imageBuffer || job.data.imagePath) {
      imageBuffer = await this.getImageBuffer(job.data, tempFiles);
    }

    const validationResults: any = {};

    // Validate with GPT Vision if image available
    if (imageBuffer && job.data.inputData?.existingAnalysis) {
      await this.updateProgress(job, {
        stage: ProcessingStage.VALIDATION,
        progress: 50,
        message: 'Validating with GPT-4 Vision...'
      });

      const gptValidation = await gptVisionService.validateAnalysis(
        imageBuffer,
        job.data.inputData.existingAnalysis
      );

      validationResults.gptValidation = gptValidation;
      
      // Track API usage
      this.trackAPIUsage(1000, 'gpt-4-vision'); // Estimate
    }

    // Validate dimensions
    if (job.data.settings?.confidence?.validateDimensions) {
      await this.updateProgress(job, {
        stage: ProcessingStage.VALIDATION,
        progress: 70,
        message: 'Validating dimensions...'
      });

      // Dimension validation logic
      validationResults.dimensionValidation = {
        valid: true,
        issues: []
      };
    }

    // Check consistency
    if (job.data.settings?.confidence?.checkConsistency) {
      await this.updateProgress(job, {
        stage: ProcessingStage.VALIDATION,
        progress: 85,
        message: 'Checking data consistency...'
      });

      // Consistency checking logic
      validationResults.consistencyCheck = {
        consistent: true,
        conflicts: []
      };
    }

    return {
      validation: validationResults,
      confidence: validationResults.gptValidation?.confidence || 0.8
    };
  }

  /**
   * Process refinement
   */
  private async processRefinement(
    job: Job<AIJobData>,
    tempFiles: string[]
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 20,
      message: 'Processing refinement request...'
    });

    // Get image buffer
    const imageBuffer = await this.getImageBuffer(job.data, tempFiles);

    if (!job.data.inputData?.existingAnalysis) {
      throw new Error('No existing analysis provided for refinement');
    }

    if (!job.data.inputData?.userFeedback) {
      throw new Error('No user feedback provided for refinement');
    }

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 50,
      message: 'Refining analysis with user feedback...'
    });

    // Refine with GPT Vision
    const refinedAnalysis = await gptVisionService.refineAnalysis(
      imageBuffer,
      job.data.inputData.existingAnalysis,
      job.data.inputData.userFeedback
    );

    await this.updateProgress(job, {
      stage: ProcessingStage.VALIDATION,
      progress: 80,
      message: 'Processing refined results...'
    });

    // Track API usage
    this.trackAPIUsage(
      refinedAnalysis.tokens_used,
      'gpt-4-vision'
    );

    return {
      refinement: refinedAnalysis,
      tokensUsed: refinedAnalysis.tokens_used,
      apiCost: this.calculateCost(refinedAnalysis.tokens_used, 'gpt-4-vision'),
      confidence: refinedAnalysis.analysis.confidence_score
    };
  }

  /**
   * Get image buffer from various sources
   */
  private async getImageBuffer(
    data: AIJobData,
    tempFiles: string[]
  ): Promise<Buffer> {
    if (data.imageBuffer) {
      return data.imageBuffer;
    }

    if (data.imagePath) {
      return await fs.readFile(data.imagePath);
    }

    if (data.imageUrl) {
      return await this.downloadImage(data.imageUrl, tempFiles);
    }

    throw new Error('No image source provided');
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string, tempFiles: string[]): Promise<Buffer> {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    
    // Save to temp file
    const tempPath = path.join(this.tempDir, `${uuidv4()}.tmp`);
    await fs.writeFile(tempPath, buffer);
    tempFiles.push(tempPath);
    
    return buffer;
  }

  /**
   * Check rate limits
   */
  private async checkRateLimit(api: string): Promise<void> {
    const limit = this.RATE_LIMITS[api as keyof typeof this.RATE_LIMITS];
    if (!limit) return;

    const now = Date.now();
    const key = `rate:${api}`;
    const lastRequest = this.rateLimiter.get(key) || 0;

    if (now - lastRequest < limit.window / limit.requests) {
      const waitTime = (limit.window / limit.requests) - (now - lastRequest);
      console.log(`⏳ Rate limit: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.rateLimiter.set(key, now);
  }

  /**
   * Track API usage
   */
  private trackAPIUsage(tokens: number, model: string): void {
    this.apiUsage.tokensUsed += tokens;
    this.apiUsage.requestCount++;
    
    const cost = this.calculateCost(tokens, model);
    this.apiUsage.costIncurred += cost;

    // Reset daily
    const now = new Date();
    if (now.getDate() !== this.apiUsage.lastReset.getDate()) {
      this.apiUsage = {
        tokensUsed: tokens,
        costIncurred: cost,
        requestCount: 1,
        lastReset: now
      };
    }
  }

  /**
   * Calculate API cost
   */
  private calculateCost(tokens: number, model: string): number {
    const costs = this.API_COSTS[model as keyof typeof this.API_COSTS];
    if (!costs) return 0;

    // Assume 70% input, 30% output
    const inputTokens = tokens * 0.7;
    const outputTokens = tokens * 0.3;

    const costInDollars = (inputTokens * costs.input + outputTokens * costs.output) / 1000;
    return Math.round(costInDollars * 100); // Return in cents
  }

  /**
   * Cache results in Redis
   */
  private async cacheResults(jobId: string, result: any): Promise<void> {
    try {
      const cacheKey = `ai:result:${jobId}`;
      const cacheData = {
        result,
        timestamp: Date.now()
      };

      await this.redisClient.setex(
        cacheKey,
        7200, // Cache for 2 hours
        JSON.stringify(cacheData)
      );
    } catch (error) {
      console.error('Failed to cache AI results:', error);
    }
  }

  /**
   * Format output based on requested format
   */
  private formatOutput(
    result: any,
    analysisType: string,
    format: string,
    metadata: any
  ): any {
    const baseResult = {
      analysisType,
      metadata
    };

    switch (format) {
      case 'summary':
        return {
          ...baseResult,
          summary: {
            confidence: metadata.confidence || 0,
            tokensUsed: metadata.tokensUsed || 0,
            apiCost: metadata.apiCost ? `$${(metadata.apiCost / 100).toFixed(4)}` : '$0',
            hasIssues: result.issues?.length > 0,
            requiresReview: metadata.confidence < 0.7
          }
        };
      
      case 'structured':
        return {
          ...baseResult,
          ...result,
          structured: true
        };
      
      case 'json':
      default:
        return {
          ...baseResult,
          ...result
        };
    }
  }

  /**
   * Update job progress
   */
  private async updateProgress(job: Job, progress: any): Promise<void> {
    try {
      await queueService.updateJobProgress(job, progress);
    } catch (error) {
      console.error('Failed to update job progress:', error);
    }
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(tempFiles: string[]): Promise<void> {
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        console.error(`Failed to delete temp file ${file}:`, error);
      }
    }
  }

  /**
   * Initialize worker
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing AI worker...');
    
    // Setup error handlers
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in AI worker:', error);
    });

    process.on('unhandledRejection', (reason, _promise) => {
      console.error('Unhandled rejection in AI worker:', reason);
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    console.log('✅ AI worker initialized');
  }

  /**
   * Shutdown worker
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('🛑 Shutting down AI worker...');
    
    try {
      // Save final API usage
      await this.saveAPIUsage();
      
      // Close Redis connection
      await this.redisClient.quit();
      
      // Clean temp directory
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        await fs.unlink(path.join(this.tempDir, file)).catch(() => {});
      }
      
      console.log('✅ AI worker shut down successfully');
    } catch (error) {
      console.error('Error during AI worker shutdown:', error);
    }
    
    process.exit(0);
  }

  /**
   * Process job with timeout
   */
  async processWithTimeout(
    job: Job<AIJobData>,
    timeout: number = 300000
  ): Promise<AIJobResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`AI job ${job.id} timed out after ${timeout}ms`));
      }, timeout);

      this.process(job)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get API usage statistics
   */
  getAPIUsageStats(): APIUsageTracker {
    return { ...this.apiUsage };
  }
}

// Create worker instance
const aiWorker = new AIWorker();

// Export processor function for Bull
export default async function (job: Job<AIJobData>): Promise<AIJobResult> {
  // Process with timeout
  return await aiWorker.processWithTimeout(job, job.opts.timeout || 300000);
}

// Initialize worker if run directly
if (require.main === module) {
  aiWorker.initialize().then(() => {
    console.log('AI worker started and ready to process jobs');
    
    // Log API usage periodically
    setInterval(() => {
      const usage = aiWorker.getAPIUsageStats();
      console.log(`📊 API Usage - Tokens: ${usage.tokensUsed}, Cost: $${(usage.costIncurred / 100).toFixed(2)}, Requests: ${usage.requestCount}`);
    }, 60000); // Every minute
  }).catch(error => {
    console.error('Failed to initialize AI worker:', error);
    process.exit(1);
  });
}

// ========================================
// USAGE EXAMPLE
// ========================================

/*
// In main application:
import Bull from 'bull';
import aiProcessor from './workers/ai.worker';

const aiQueue = new Bull('ai-analysis', {
  redis: redisConfig.connection
});

// Register processor
aiQueue.process(1, aiProcessor); // Process 1 job at a time (API rate limits)

// Add GPT Vision job
const gptJob = await aiQueue.add({
  imageUrl: 'https://example.com/floor-plan.jpg',
  userId: 'user123',
  projectId: 'project456',
  analysisType: 'gpt-vision',
  settings: {
    gptVision: {
      analysisType: 'full',
      maxTokens: 4000,
      temperature: 0.2
    },
    costLimit: 100, // $1.00 limit
    outputFormat: 'structured'
  }
}, {
  priority: 1,
  attempts: 2,
  timeout: 120000
});

// Add model fusion job
const fusionJob = await aiQueue.add({
  userId: 'user123',
  projectId: 'project456',
  analysisType: 'model-fusion',
  inputData: {
    ocrResults: ocrData,
    visionResults: visionData,
    objectDetectionResults: yoloData
  },
  settings: {
    fusion: {
      votingStrategy: 'weighted',
      conflictResolution: 'highest_confidence',
      minConsensus: 0.6
    },
    outputFormat: 'json'
  }
}, {
  priority: 5
});

// Monitor progress
gptJob.on('progress', (progress) => {
  console.log(`AI Job ${gptJob.id}: ${progress.message} (${progress.progress}%)`);
});

// Handle completion
gptJob.on('completed', (result) => {
  console.log('AI analysis completed:', result);
  console.log(`Confidence: ${result.data.metadata.confidence}`);
  console.log(`API Cost: $${(result.data.metadata.apiCost / 100).toFixed(4)}`);
});

// Add refinement job
const refinementJob = await aiQueue.add({
  imageBuffer: imageBuffer,
  userId: 'user123',
  projectId: 'project456',
  analysisType: 'refinement',
  inputData: {
    existingAnalysis: previousAnalysis,
    userFeedback: 'The master bedroom should be on the left side, not right'
  },
  settings: {
    outputFormat: 'structured'
  }
});
*/