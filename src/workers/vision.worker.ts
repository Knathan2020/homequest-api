// ========================================
// VISION WORKER - vision.worker.ts
// Process computer vision jobs
// ========================================

import { Job } from 'bull';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import opencvService from '../services/vision/opencv.service';
import { roomDetectionService } from '../services/vision/room-detection.service';
import { yoloService } from '../services/vision/yolo.service';
import { queueService } from '../services/queue/queue.service';
import { ProcessingStage } from '../types/processing.types';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config';
import sharp from 'sharp';

interface VisionJobData {
  imageUrl?: string;
  imageBuffer?: Buffer;
  imagePath?: string;
  userId: string;
  projectId: string;
  analysisType: 'edges' | 'lines' | 'contours' | 'rooms' | 'objects' | 'full';
  settings?: {
    edgeDetection?: {
      lowThreshold?: number;
      highThreshold?: number;
      apertureSize?: number;
    };
    lineDetection?: {
      rhoResolution?: number;
      thetaResolution?: number;
      threshold?: number;
      minLineLength?: number;
      maxLineGap?: number;
    };
    roomDetection?: {
      minRoomArea?: number;
      maxRoomArea?: number;
      wallThicknessRange?: { min: number; max: number };
      doorWidthRange?: { min: number; max: number };
      windowWidthRange?: { min: number; max: number };
    };
    objectDetection?: {
      confidenceThreshold?: number;
      iouThreshold?: number;
      maxDetections?: number;
      targetClasses?: string[];
    };
    outputFormat?: 'json' | 'simplified' | 'detailed';
  };
  metadata?: any;
}

interface VisionJobResult {
  success: boolean;
  data?: {
    analysisType: string;
    edges?: any;
    lines?: any;
    contours?: any;
    rooms?: any;
    objects?: any;
    combined?: any;
    metadata: {
      processingTime: number;
      imageSize: { width: number; height: number };
      detectionCounts?: {
        edges?: number;
        lines?: number;
        contours?: number;
        rooms?: number;
        objects?: number;
      };
    };
  };
  error?: string;
  tempFiles?: string[];
}

export class VisionWorker {
  private redisClient: Redis;
  private tempDir: string = '/tmp/vision-processing';
  private maxFileSize: number = 100 * 1024 * 1024; // 100MB
  private isShuttingDown: boolean = false;
  private gpuAvailable: boolean = false;

  constructor() {
    this.redisClient = new Redis(redisConfig.connection);
    this.initializeTempDirectory();
    this.checkGPUAvailability();
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
   * Check GPU availability
   */
  private checkGPUAvailability(): void {
    // Check for CUDA or OpenCL support
    // This is platform-specific
    this.gpuAvailable = false; // Default to false
    
    if (this.gpuAvailable) {
      console.log('✅ GPU acceleration available');
    } else {
      console.log('ℹ️ Running on CPU only');
    }
  }

  /**
   * Main job processor
   */
  async process(job: Job<VisionJobData>): Promise<VisionJobResult> {
    const startTime = Date.now();
    const tempFiles: string[] = [];

    try {
      console.log(`👁️ Processing vision job ${job.id} (${job.data.analysisType})`);

      // Update progress - Starting
      await this.updateProgress(job, {
        stage: ProcessingStage.ROOM_SEGMENTATION,
        progress: 0,
        message: 'Starting vision analysis...'
      });

      // Step 1: Get image buffer
      const imageBuffer = await this.getImageBuffer(job.data, tempFiles);
      
      // Validate and get metadata
      const imageMetadata = await this.validateAndGetMetadata(imageBuffer);

      // Step 2: Process based on analysis type
      let result: any;
      
      switch (job.data.analysisType) {
        case 'edges':
          result = await this.processEdgeDetection(imageBuffer, job);
          break;
        
        case 'lines':
          result = await this.processLineDetection(imageBuffer, job);
          break;
        
        case 'contours':
          result = await this.processContourDetection(imageBuffer, job);
          break;
        
        case 'rooms':
          result = await this.processRoomDetection(imageBuffer, job);
          break;
        
        case 'objects':
          result = await this.processObjectDetection(imageBuffer, job);
          break;
        
        case 'full':
          result = await this.processFullAnalysis(imageBuffer, job);
          break;
        
        default:
          throw new Error(`Unknown analysis type: ${job.data.analysisType}`);
      }

      // Step 3: Cache results
      await this.cacheResults(job.id as string, result);

      // Step 4: Format output
      const formattedResult = this.formatOutput(
        result,
        job.data.analysisType,
        job.data.settings?.outputFormat || 'json',
        {
          processingTime: Date.now() - startTime,
          imageSize: imageMetadata
        }
      );

      // Update progress - Complete
      await this.updateProgress(job, {
        stage: ProcessingStage.OUTPUT_GENERATION,
        progress: 100,
        message: 'Vision analysis completed'
      });

      // Cleanup temp files
      await this.cleanup(tempFiles);

      return {
        success: true,
        data: formattedResult,
        tempFiles: []
      };

    } catch (error) {
      console.error(`❌ Vision job ${job.id} failed:`, error);
      
      // Update progress - Failed
      await this.updateProgress(job, {
        stage: ProcessingStage.QUALITY_CHECK,
        progress: 0,
        message: `Vision analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.stack : error }
      });

      // Cleanup on failure
      await this.cleanup(tempFiles);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Vision processing failed',
        tempFiles: []
      };
    }
  }

  /**
   * Get image buffer from various sources
   */
  private async getImageBuffer(
    data: VisionJobData,
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
   * Validate image and get metadata
   */
  private async validateAndGetMetadata(buffer: Buffer): Promise<{ width: number; height: number }> {
    // Check file size
    if (buffer.length > this.maxFileSize) {
      throw new Error(`Image too large: ${buffer.length} bytes (max: ${this.maxFileSize})`);
    }

    try {
      const metadata = await sharp(buffer).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image dimensions');
      }

      if (metadata.width > 20000 || metadata.height > 20000) {
        throw new Error('Image dimensions too large (max: 20000x20000)');
      }

      return {
        width: metadata.width,
        height: metadata.height
      };
    } catch (error) {
      throw new Error(`Invalid image format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process edge detection
   */
  private async processEdgeDetection(
    buffer: Buffer,
    job: Job<VisionJobData>
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 30,
      message: 'Detecting edges...'
    });

    const edgeSettings = job.data.settings?.edgeDetection || {};
    const params: any = {
      cannyLowThreshold: edgeSettings.lowThreshold,
      cannyHighThreshold: edgeSettings.highThreshold,
      sobelKernelSize: edgeSettings.apertureSize
    };
    const result = await opencvService.detectEdges(buffer, params);

    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 70,
      message: 'Edge detection complete'
    });

    return result;
  }

  /**
   * Process line detection
   */
  private async processLineDetection(
    buffer: Buffer,
    job: Job<VisionJobData>
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 30,
      message: 'Detecting lines...'
    });

    const settings = job.data.settings?.lineDetection || {};
    const result = await opencvService.detectLines(buffer, settings);

    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 70,
      message: `Detected ${result.lines.length} lines`
    });

    return result;
  }

  /**
   * Process contour detection
   */
  private async processContourDetection(
    buffer: Buffer,
    job: Job<VisionJobData>
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 30,
      message: 'Detecting contours...'
    });

    const result = await opencvService.detectContours(buffer);

    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 70,
      message: `Detected ${result.contours.length} contours`
    });

    return result;
  }

  /**
   * Process room detection
   */
  private async processRoomDetection(
    buffer: Buffer,
    job: Job<VisionJobData>
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 20,
      message: 'Analyzing floor plan structure...'
    });

    const settings = job.data.settings?.roomDetection || {};
    
    // Detect rooms, walls, doors, windows
    const result = await roomDetectionService.detectRooms(buffer, settings);

    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 80,
      message: `Detected ${result.rooms.length} rooms, ${result.walls.length} walls`
    });

    return result;
  }

  /**
   * Process object detection
   */
  private async processObjectDetection(
    buffer: Buffer,
    job: Job<VisionJobData>
  ): Promise<any> {
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 20,
      message: 'Initializing object detection...'
    });

    // Initialize YOLO if needed
    if (!yoloService.getStats().initialized) {
      await yoloService.initialize();
    }

    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 40,
      message: 'Running object detection...'
    });

    const settings = job.data.settings?.objectDetection || {};
    const result = await yoloService.detectObjects(buffer, settings);

    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 80,
      message: `Detected ${result.objects.length} objects`
    });

    return result;
  }

  /**
   * Process full analysis
   */
  private async processFullAnalysis(
    buffer: Buffer,
    job: Job<VisionJobData>
  ): Promise<any> {
    const results: any = {};

    // Step 1: Edge detection (15%)
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 10,
      message: 'Running edge detection...'
    });
    results.edges = await opencvService.detectEdges(buffer);

    // Step 2: Line detection (15%)
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 25,
      message: 'Running line detection...'
    });
    results.lines = await opencvService.detectLines(buffer);

    // Step 3: Contour detection (15%)
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 40,
      message: 'Running contour detection...'
    });
    results.contours = await opencvService.detectContours(buffer);

    // Step 4: Room detection (25%)
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 55,
      message: 'Detecting rooms and structures...'
    });
    const roomResults = await roomDetectionService.detectRooms(buffer);
    results.rooms = roomResults.rooms;
    results.walls = roomResults.walls;
    results.doors = roomResults.doors;
    results.windows = roomResults.windows;

    // Step 5: Object detection (25%)
    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 80,
      message: 'Detecting objects and fixtures...'
    });
    
    if (!yoloService.getStats().initialized) {
      await yoloService.initialize();
    }
    
    const objectResults = await yoloService.detectObjects(buffer);
    results.objects = objectResults.objects;
    results.fixtures = objectResults.fixtures;
    results.furniture = objectResults.furniture;
    results.appliances = objectResults.appliances;

    await this.updateProgress(job, {
      stage: ProcessingStage.ROOM_SEGMENTATION,
      progress: 95,
      message: 'Finalizing analysis...'
    });

    return results;
  }

  /**
   * Cache results in Redis
   */
  private async cacheResults(jobId: string, result: any): Promise<void> {
    try {
      const cacheKey = `vision:result:${jobId}`;
      const cacheData = {
        result,
        timestamp: Date.now()
      };

      await this.redisClient.setex(
        cacheKey,
        3600, // Cache for 1 hour
        JSON.stringify(cacheData)
      );
    } catch (error) {
      console.error('Failed to cache vision results:', error);
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
    const detectionCounts: any = {};

    if (result.edges) detectionCounts.edges = result.edges.edgeCount || 0;
    if (result.lines) detectionCounts.lines = result.lines.lines?.length || 0;
    if (result.contours) detectionCounts.contours = result.contours.contours?.length || 0;
    if (result.rooms) detectionCounts.rooms = result.rooms.length || 0;
    if (result.objects) detectionCounts.objects = result.objects.length || 0;

    const baseResult = {
      analysisType,
      metadata: {
        ...metadata,
        detectionCounts
      }
    };

    switch (format) {
      case 'simplified':
        // Return only counts and basic info
        return {
          ...baseResult,
          summary: {
            hasEdges: detectionCounts.edges > 0,
            lineCount: detectionCounts.lines || 0,
            contourCount: detectionCounts.contours || 0,
            roomCount: detectionCounts.rooms || 0,
            objectCount: detectionCounts.objects || 0
          }
        };
      
      case 'detailed':
        // Return everything
        return {
          ...baseResult,
          ...result,
          combined: analysisType === 'full' ? this.combineResults(result) : null
        };
      
      case 'json':
      default:
        // Return standard format
        return {
          ...baseResult,
          edges: result.edges,
          lines: result.lines,
          contours: result.contours,
          rooms: result.rooms,
          objects: result.objects,
          walls: result.walls,
          doors: result.doors,
          windows: result.windows,
          fixtures: result.fixtures,
          furniture: result.furniture,
          appliances: result.appliances
        };
    }
  }

  /**
   * Combine results from full analysis
   */
  private combineResults(result: any): any {
    return {
      structures: {
        walls: result.walls || [],
        doors: result.doors || [],
        windows: result.windows || []
      },
      spaces: {
        rooms: result.rooms || [],
        contours: result.contours?.contours || []
      },
      features: {
        fixtures: result.fixtures || [],
        furniture: result.furniture || [],
        appliances: result.appliances || [],
        objects: result.objects || []
      },
      geometry: {
        edges: result.edges || {},
        lines: result.lines || {}
      }
    };
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
   * Check memory usage
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
    console.log('🚀 Initializing vision worker...');
    
    // Setup error handlers
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in vision worker:', error);
    });

    process.on('unhandledRejection', (reason, _promise) => {
      console.error('Unhandled rejection in vision worker:', reason);
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    console.log('✅ Vision worker initialized');
  }

  /**
   * Shutdown worker
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('🛑 Shutting down vision worker...');
    
    try {
      // Cleanup YOLO if initialized
      if (yoloService.getStats().initialized) {
        await yoloService.cleanup();
      }
      
      // Close Redis connection
      await this.redisClient.quit();
      
      // Clean temp directory
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        await fs.unlink(path.join(this.tempDir, file)).catch(() => {});
      }
      
      console.log('✅ Vision worker shut down successfully');
    } catch (error) {
      console.error('Error during vision worker shutdown:', error);
    }
    
    process.exit(0);
  }

  /**
   * Process job with timeout
   */
  async processWithTimeout(
    job: Job<VisionJobData>,
    timeout: number = 180000
  ): Promise<VisionJobResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Vision job ${job.id} timed out after ${timeout}ms`));
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
const visionWorker = new VisionWorker();

// Export processor function for Bull
export default async function (job: Job<VisionJobData>): Promise<VisionJobResult> {
  // Check memory before processing
  visionWorker['checkMemoryUsage']();
  
  // Process with timeout
  return await visionWorker.processWithTimeout(job, job.opts.timeout || 180000);
}

// Initialize worker if run directly
if (require.main === module) {
  visionWorker.initialize().then(() => {
    console.log('Vision worker started and ready to process jobs');
  }).catch(error => {
    console.error('Failed to initialize vision worker:', error);
    process.exit(1);
  });
}

// ========================================
// USAGE EXAMPLE
// ========================================

/*
// In main application:
import Bull from 'bull';
import visionProcessor from './workers/vision.worker';

const visionQueue = new Bull('vision-processing', {
  redis: redisConfig.connection
});

// Register processor
visionQueue.process(2, visionProcessor); // Process 2 jobs concurrently

// Add job for room detection
const roomJob = await visionQueue.add({
  imageUrl: 'https://example.com/floor-plan.jpg',
  userId: 'user123',
  projectId: 'project456',
  analysisType: 'rooms',
  settings: {
    roomDetection: {
      minRoomArea: 50,
      maxRoomArea: 1000,
      wallThicknessRange: { min: 5, max: 30 }
    },
    outputFormat: 'detailed'
  }
}, {
  priority: 1,
  attempts: 3
});

// Add job for full analysis
const fullJob = await visionQueue.add({
  imageBuffer: imageBuffer,
  userId: 'user123',
  projectId: 'project456',
  analysisType: 'full',
  settings: {
    objectDetection: {
      confidenceThreshold: 0.7,
      maxDetections: 100
    },
    outputFormat: 'json'
  }
}, {
  priority: 5,
  timeout: 300000 // 5 minutes for full analysis
});

// Monitor progress
roomJob.on('progress', (progress) => {
  console.log(`Vision Job ${roomJob.id}: ${progress.message} (${progress.progress}%)`);
});

// Handle completion
roomJob.on('completed', (result) => {
  console.log('Room detection completed:', result);
  console.log(`Found ${result.data.rooms.length} rooms`);
  console.log(`Found ${result.data.walls.length} walls`);
});
*/