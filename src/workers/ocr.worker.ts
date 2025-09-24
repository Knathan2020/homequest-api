// ========================================
// OCR WORKER - ocr.worker.ts
// Process OCR jobs with progress reporting
// ========================================

import { Job } from 'bull';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { tesseractService } from '../services/ocr/tesseract.service';
import preprocessingService from '../services/ocr/preprocessing.service';
import textParserService from '../services/ocr/text-parser.service';
import { queueService } from '../services/queue/queue.service';
import { ProcessingStage } from '../types/processing.types';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config';

interface OCRJobData {
  imageUrl?: string;
  imageBuffer?: Buffer;
  imagePath?: string;
  userId: string;
  projectId: string;
  settings?: {
    language?: string;
    preprocessing?: boolean;
    regions?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      label?: string;
    }>;
    outputFormat?: 'text' | 'json' | 'structured';
    confidence_threshold?: number;
  };
  metadata?: any;
}

interface OCRJobResult {
  success: boolean;
  data?: {
    text: string;
    structuredData?: any;
    confidence: number;
    words: Array<{
      text: string;
      confidence: number;
      bbox: any;
    }>;
    lines: Array<{
      text: string;
      confidence: number;
      bbox: any;
    }>;
    regions?: Array<{
      label: string;
      text: string;
      confidence: number;
    }>;
    processingTime: number;
  };
  error?: string;
  tempFiles?: string[];
}

export class OCRWorker {
  private redisClient: Redis;
  private tempDir: string = '/tmp/ocr-processing';
  private maxFileSize: number = 50 * 1024 * 1024; // 50MB
  private isShuttingDown: boolean = false;

  constructor() {
    this.redisClient = new Redis(redisConfig.connection);
    this.initializeTempDirectory();
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
   * Main job processor
   */
  async process(job: Job<OCRJobData>): Promise<OCRJobResult> {
    const startTime = Date.now();
    const tempFiles: string[] = [];

    try {
      console.log(`🔤 Processing OCR job ${job.id}`);

      // Update progress - Starting
      await this.updateProgress(job, {
        stage: ProcessingStage.TEXT_EXTRACTION,
        progress: 0,
        message: 'Starting OCR processing...'
      });

      // Step 1: Get image buffer
      const imageBuffer = await this.getImageBuffer(job.data, tempFiles);
      
      // Validate image
      await this.validateImage(imageBuffer);

      // Update progress - Preprocessing
      await this.updateProgress(job, {
        stage: ProcessingStage.TEXT_EXTRACTION,
        progress: 20,
        message: 'Preprocessing image...'
      });

      // Step 2: Preprocess image if requested
      let processedBuffer = imageBuffer;
      if (job.data.settings?.preprocessing !== false) {
        processedBuffer = await this.preprocessImage(imageBuffer, job);
      }

      // Update progress - OCR
      await this.updateProgress(job, {
        stage: ProcessingStage.TEXT_EXTRACTION,
        progress: 40,
        message: 'Running text extraction...'
      });

      // Step 3: Perform OCR
      let ocrResult;
      if (job.data.settings?.regions && job.data.settings.regions.length > 0) {
        // Process specific regions
        ocrResult = await this.processRegions(
          processedBuffer,
          job.data.settings.regions,
          job
        );
      } else {
        // Process entire image
        ocrResult = await tesseractService.processImage(processedBuffer, {
          language: job.data.settings?.language || 'eng'
        });
      }

      // Update progress - Parsing
      await this.updateProgress(job, {
        stage: ProcessingStage.TEXT_EXTRACTION,
        progress: 70,
        message: 'Parsing extracted text...'
      });

      // Step 4: Parse and structure text
      const structuredData = await this.parseText(ocrResult, job);

      // Update progress - Finalizing
      await this.updateProgress(job, {
        stage: ProcessingStage.TEXT_EXTRACTION,
        progress: 90,
        message: 'Finalizing results...'
      });

      // Step 5: Cache results
      await this.cacheResults(job.id as string, ocrResult, structuredData);

      // Step 6: Format output
      const result = this.formatOutput(
        ocrResult,
        structuredData,
        job.data.settings?.outputFormat || 'json',
        Date.now() - startTime
      );

      // Update progress - Complete
      await this.updateProgress(job, {
        stage: ProcessingStage.OUTPUT_GENERATION,
        progress: 100,
        message: 'OCR processing completed'
      });

      // Cleanup temp files
      await this.cleanup(tempFiles);

      return {
        success: true,
        data: result,
        tempFiles: []
      };

    } catch (error) {
      console.error(`❌ OCR job ${job.id} failed:`, error);
      
      // Update progress - Failed
      await this.updateProgress(job, {
        stage: ProcessingStage.QUALITY_CHECK,
        progress: 0,
        message: `OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.stack : error }
      });

      // Cleanup on failure
      await this.cleanup(tempFiles);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed',
        tempFiles: []
      };
    }
  }

  /**
   * Get image buffer from various sources
   */
  private async getImageBuffer(
    data: OCRJobData,
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
    
    // Save to temp file for processing
    const tempPath = path.join(this.tempDir, `${uuidv4()}.tmp`);
    await fs.writeFile(tempPath, buffer);
    tempFiles.push(tempPath);
    
    return buffer;
  }

  /**
   * Validate image
   */
  private async validateImage(buffer: Buffer): Promise<void> {
    // Check file size
    if (buffer.length > this.maxFileSize) {
      throw new Error(`Image too large: ${buffer.length} bytes (max: ${this.maxFileSize})`);
    }

    // Check if valid image format
    const sharp = (await import('sharp')).default;
    try {
      const metadata = await sharp(buffer).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image dimensions');
      }

      if (metadata.width > 10000 || metadata.height > 10000) {
        throw new Error('Image dimensions too large (max: 10000x10000)');
      }
    } catch (error) {
      throw new Error(`Invalid image format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Preprocess image
   */
  private async preprocessImage(
    buffer: Buffer,
    job: Job<OCRJobData>
  ): Promise<Buffer> {
    try {
      // Auto-preprocess for OCR
      const preprocessed = await preprocessingService.autoPreprocess(buffer);
      
      // Save preprocessed image to temp
      const tempPath = path.join(this.tempDir, `${job.id}_preprocessed.png`);
      await fs.writeFile(tempPath, preprocessed.buffer);
      
      return preprocessed.buffer;
    } catch (error) {
      console.warn('Preprocessing failed, using original image:', error);
      return buffer;
    }
  }

  /**
   * Process specific regions
   */
  private async processRegions(
    buffer: Buffer,
    regions: any[],
    job: Job<OCRJobData>
  ): Promise<any> {
    const results = await tesseractService.processImageRegions(buffer, regions);
    
    // Update progress as regions are processed
    let processedCount = 0;
    const totalRegions = regions.length;
    
    const combinedResult = {
      text: '',
      confidence: 0,
      words: [] as any[],
      lines: [] as any[],
      regions: [] as any[]
    };

    for (const regionResult of results) {
      processedCount++;
      
      await this.updateProgress(job, {
        stage: ProcessingStage.TEXT_EXTRACTION,
        progress: 40 + (30 * processedCount / totalRegions),
        message: `Processing region ${processedCount}/${totalRegions}...`
      });

      combinedResult.text += regionResult.result.text + '\n';
      combinedResult.confidence += regionResult.result.confidence;
      combinedResult.words.push(...regionResult.result.words);
      combinedResult.lines.push(...regionResult.result.lines);
      combinedResult.regions.push({
        label: regionResult.region.label || `Region ${processedCount}`,
        text: regionResult.result.text,
        confidence: regionResult.result.confidence
      });
    }

    combinedResult.confidence /= results.length;
    
    return combinedResult;
  }

  /**
   * Parse extracted text
   */
  private async parseText(ocrResult: any, _job: Job<OCRJobData>): Promise<any> {
    try {
      // Parse floor plan specific text
      const parsed = await textParserService.parseFloorPlanText(
        ocrResult.text,
        []
      );
      
      return parsed;
    } catch (error) {
      console.warn('Text parsing failed:', error);
      return null;
    }
  }

  /**
   * Cache results in Redis
   */
  private async cacheResults(
    jobId: string,
    ocrResult: any,
    structuredData: any
  ): Promise<void> {
    try {
      const cacheKey = `ocr:result:${jobId}`;
      const cacheData = {
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        structuredData,
        timestamp: Date.now()
      };

      await this.redisClient.setex(
        cacheKey,
        3600, // Cache for 1 hour
        JSON.stringify(cacheData)
      );
    } catch (error) {
      console.error('Failed to cache OCR results:', error);
    }
  }

  /**
   * Format output based on requested format
   */
  private formatOutput(
    ocrResult: any,
    structuredData: any,
    format: string,
    processingTime: number
  ): any {
    switch (format) {
      case 'text':
        return {
          text: ocrResult.text,
          confidence: ocrResult.confidence,
          processingTime
        };
      
      case 'structured':
        return {
          text: ocrResult.text,
          structuredData,
          confidence: ocrResult.confidence,
          processingTime
        };
      
      case 'json':
      default:
        return {
          text: ocrResult.text,
          structuredData,
          confidence: ocrResult.confidence,
          words: ocrResult.words,
          lines: ocrResult.lines,
          regions: ocrResult.regions,
          processingTime
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
   * Handle memory management
   */
  private checkMemoryUsage(): void {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    
    if (heapUsedMB > heapTotalMB * 0.9) {
      console.warn(`⚠️ High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Initialize worker
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing OCR worker...');
    
    // Initialize Tesseract
    await tesseractService.initialize();
    
    // Setup error handlers
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in OCR worker:', error);
    });

    process.on('unhandledRejection', (reason, _promise) => {
      console.error('Unhandled rejection in OCR worker:', reason);
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    console.log('✅ OCR worker initialized');
  }

  /**
   * Shutdown worker
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('🛑 Shutting down OCR worker...');
    
    try {
      // Cleanup Tesseract
      await tesseractService.cleanup();
      
      // Close Redis connection
      await this.redisClient.quit();
      
      // Clean temp directory
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        await fs.unlink(path.join(this.tempDir, file)).catch(() => {});
      }
      
      console.log('✅ OCR worker shut down successfully');
    } catch (error) {
      console.error('Error during OCR worker shutdown:', error);
    }
    
    process.exit(0);
  }

  /**
   * Process job with timeout
   */
  async processWithTimeout(
    job: Job<OCRJobData>,
    timeout: number = 120000
  ): Promise<OCRJobResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`OCR job ${job.id} timed out after ${timeout}ms`));
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
}

// Create worker instance
const ocrWorker = new OCRWorker();

// Export processor function for Bull
export default async function (job: Job<OCRJobData>): Promise<OCRJobResult> {
  // Check memory before processing
  ocrWorker['checkMemoryUsage']();
  
  // Process with timeout
  return await ocrWorker.processWithTimeout(job, job.opts.timeout || 120000);
}

// Initialize worker if run directly
if (require.main === module) {
  ocrWorker.initialize().then(() => {
    console.log('OCR worker started and ready to process jobs');
  }).catch(error => {
    console.error('Failed to initialize OCR worker:', error);
    process.exit(1);
  });
}

// ========================================
// USAGE EXAMPLE
// ========================================

/*
// In main application:
import Bull from 'bull';
import ocrProcessor from './workers/ocr.worker';

const ocrQueue = new Bull('ocr-processing', {
  redis: redisConfig.connection
});

// Register processor
ocrQueue.process(4, ocrProcessor); // Process 4 jobs concurrently

// Add job
const job = await ocrQueue.add({
  imageUrl: 'https://example.com/floor-plan.jpg',
  userId: 'user123',
  projectId: 'project456',
  settings: {
    language: 'eng',
    preprocessing: true,
    outputFormat: 'structured',
    regions: [
      { x: 100, y: 100, width: 200, height: 50, label: 'title' },
      { x: 300, y: 500, width: 400, height: 300, label: 'rooms' }
    ]
  }
}, {
  priority: 1,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
});

// Monitor progress
job.on('progress', (progress) => {
  console.log(`OCR Job ${job.id}: ${progress.message} (${progress.progress}%)`);
});

// Handle completion
job.on('completed', (result) => {
  console.log('OCR completed:', result);
  console.log('Extracted text:', result.data.text);
  console.log('Confidence:', result.data.confidence);
});

// Handle failure
job.on('failed', (error) => {
  console.error('OCR failed:', error);
});
*/