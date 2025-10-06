/**
 * Background Job Processor for Floor Plans
 * Handles asynchronous processing of floor plan detection
 */

import { RealDetectionService } from './real-detection.service';
import { billionDollarDetector } from './billion-dollar-detection.service';
import { gptVisionDetector } from './gpt-vision-detection.service';
import { getPdfConverterService } from './pdf-converter.service';
import JobDatabaseService from './job-database.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ProcessingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: any;
  imagePath?: string;
  uploadPath?: string;
  filename?: string;
  uploadedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  timestamp?: number;
  metadata?: {
    allPages?: string[];
    pageCount?: number;
    currentPage?: number;
    [key: string]: any;
  };
}

export class JobProcessorService {
  private detector: RealDetectionService;
  
  constructor() {
    this.detector = new RealDetectionService();
  }

  /**
   * Process a floor plan job
   */
  async processJob(job: ProcessingJob): Promise<ProcessingJob> {
    try {
      // Update job status
      job.status = 'processing';
      job.startedAt = new Date();
      job.progress = 10;
      
      // Save job state
      this.updateJobInMemory(job);
      
      // Get the image path
      let imagePath = this.getImagePath(job);
      
      if (!imagePath || !fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      
      // Check if it's a PDF and convert it
      if (imagePath.toLowerCase().endsWith('.pdf')) {
        console.log('📄 PDF detected, converting to image...');
        job.progress = 20;
        this.updateJobInMemory(job);
        
        try {
          // Convert PDF to images (all pages)
          const convertedImagePaths = await getPdfConverterService().convertToImages(imagePath);
          console.log(`✅ PDF converted to ${convertedImagePaths.length} images`);
          
          // For now, use the first page as the primary image
          // TODO: Process all pages or let user select which page
          imagePath = convertedImagePaths[0];
          job.imagePath = convertedImagePaths[0];
          
          // Store all converted pages in metadata for future use
          job.metadata = {
            ...job.metadata,
            allPages: convertedImagePaths,
            pageCount: convertedImagePaths.length,
            currentPage: 1
          };
          
          job.progress = 25;
          this.updateJobInMemory(job);
        } catch (pdfError) {
          console.error('❌ PDF conversion failed:', pdfError);
          job.status = 'failed';
          job.progress = 0;
          job.completedAt = new Date();
          job.error = {
            message: `Failed to convert PDF: ${pdfError.message}`,
            code: 'PDF_CONVERSION_ERROR'
          };
          this.updateJobInMemory(job);
          return job;
        }
      }
      
      // Update progress
      job.progress = 30;
      this.updateJobInMemory(job);
      
      // HYBRID DETECTION: Run OpenCV + GPT-4 Vision in parallel, then merge
      console.log('🔍 Running HYBRID detection (OpenCV + GPT-4 Vision)...');

      let detectionResult;
      let detectionMethod = 'hybrid';

      // Run BOTH detections in parallel for best results
      const [opencvResult, gptResult] = await Promise.allSettled([
        this.detector.detectFloorPlan(imagePath),
        gptVisionDetector.detectFloorPlan(imagePath)
      ]);

      // Check what succeeded
      const opencvSuccess = opencvResult.status === 'fulfilled';
      const gptSuccess = gptResult.status === 'fulfilled';

      console.log(`📊 Detection results: OpenCV ${opencvSuccess ? '✅' : '❌'}, GPT-4 Vision ${gptSuccess ? '✅' : '❌'}`);

      if (opencvSuccess && gptSuccess) {
        // BEST CASE: Both worked - merge results intelligently
        const opencv = opencvResult.value;
        const gpt = gptResult.value;

        console.log(`🔀 Merging results:`);
        console.log(`   OpenCV: ${opencv.walls?.length || 0} walls, ${opencv.rooms?.length || 0} rooms`);
        console.log(`   GPT-4:  ${gpt.walls.length} walls, ${gpt.rooms.length} rooms`);

        detectionResult = this.mergeDetectionResults(opencv, gpt);
        detectionMethod = 'hybrid-opencv-gpt4';
        console.log(`✅ HYBRID: ${detectionResult.walls?.length || 0} walls, ${detectionResult.rooms?.length || 0} rooms`);

      } else if (opencvSuccess) {
        // OpenCV worked, GPT failed - use OpenCV only
        console.log('⚠️ GPT-4 Vision failed, using OpenCV results only');
        detectionResult = opencvResult.value;
        detectionMethod = 'opencv-only';
        console.log(`✅ OpenCV: ${detectionResult.walls?.length || 0} walls, ${detectionResult.rooms?.length || 0} rooms`);

      } else if (gptSuccess) {
        // GPT worked, OpenCV failed - use GPT only
        console.log('⚠️ OpenCV failed, using GPT-4 Vision results only');
        const gpt = gptResult.value;
        detectionResult = {
          walls: gpt.walls,
          rooms: gpt.rooms,
          doors: gpt.doors,
          windows: gpt.windows,
          fixtures: [],
          text: [],
          measurements: gpt.measurements,
          metadata: gpt.metadata
        };
        detectionMethod = 'gpt4-only';
        console.log(`✅ GPT-4: ${gpt.walls.length} walls, ${gpt.rooms.length} rooms`);

      } else {
        // Both failed - try Billion Dollar as final fallback
        console.log('❌ Both OpenCV and GPT-4 failed, trying Billion Dollar Detection...');
        try {
          const billionResult = await billionDollarDetector.detectFloorPlan(imagePath);
          detectionResult = {
            walls: billionResult.walls,
            rooms: billionResult.rooms,
            doors: billionResult.doors,
            windows: billionResult.windows,
            fixtures: billionResult.fixtures,
            text: [],
            measurements: billionResult.measurements,
            metadata: billionResult.metadata
          };
          detectionMethod = 'billion-dollar-ai';
          console.log(`✅ Billion Dollar: ${billionResult.walls.length} walls, ${billionResult.rooms.length} rooms`);
        } catch (billionError) {
          console.error('❌ All detection methods failed');
          throw new Error('All detection methods failed');
        }
      }
      
      // Update progress
      job.progress = 80;
      this.updateJobInMemory(job);
      
      // Prepare the result
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date();
      
      // If we converted a PDF, include the converted image path in metadata
      if (job.metadata?.allPages && job.metadata.allPages.length > 0) {
        // Get the relative path for the converted image
        const convertedPath = job.metadata.allPages[0].replace(process.cwd() + '/uploads/floor-plans/', '');
        job.metadata.convertedImageUrl = `/uploads/floor-plans/${convertedPath}`;
        job.imagePath = job.metadata.allPages[0];
      }
      
      job.result = {
        features: {
          walls: detectionResult.walls || [],
          doors: detectionResult.doors || [],
          windows: detectionResult.windows || [],
          rooms: detectionResult.rooms || [],
          stairs: [],
          elevators: [],
          fixtures: detectionResult.fixtures || [],
          annotations: detectionResult.text || []
        },
        analysis: {
          summary: `Detected ${detectionResult.rooms?.length || 0} rooms, ${detectionResult.walls?.length || 0} walls, ${detectionResult.doors?.length || 0} doors`,
          roomCount: detectionResult.rooms?.length || 0,
          totalArea: detectionResult.rooms?.reduce((sum, r) => sum + (r.area || 0), 0) || 0,
          suggestions: this.generateSuggestions(detectionResult),
          violations: [],
          confidence: detectionResult.metadata?.confidence || 85,
          detectionMethod: detectionMethod
        },
        measurements: detectionResult.measurements || {},
        metadata: {
          processedAt: new Date(),
          processingTime: Date.now() - job.startedAt.getTime(),
          detectionMethods: ['yolo', 'ocr', 'canvas', 'parallel-walls']
        }
      };
      
      console.log('✅ Job processing complete:', job.id);
      this.updateJobInMemory(job);
      return job;
      
    } catch (error) {
      console.error('❌ Job processing error:', error);
      job.status = 'failed';
      job.progress = 0;
      job.completedAt = new Date();
      job.error = {
        message: error.message || 'Processing failed',
        code: error.code || 'PROCESSING_ERROR',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
      this.updateJobInMemory(job);
      return job;
    }
  }
  
  /**
   * Start background processing for a job
   */
  async startBackgroundProcessing(jobId: string): Promise<void> {
    // Get job from memory
    const jobs = global.floorPlanJobs || new Map();
    const job = jobs.get(jobId);
    
    if (!job) {
      console.error(`Job not found: ${jobId}`);
      return;
    }
    
    // Process in background (don't await)
    this.processJob(job).catch(error => {
      console.error(`Background processing failed for job ${jobId}:`, error);
    });
  }
  
  /**
   * Get image path from job
   */
  private getImagePath(job: ProcessingJob): string {
    if (job.uploadPath) {
      return path.join(process.cwd(), 'uploads', 'floor-plans', job.uploadPath);
    }
    
    if (job.imagePath) {
      return job.imagePath;
    }
    
    return path.join(
      process.cwd(), 
      'uploads', 
      'floor-plans', 
      job.id, 
      'original', 
      job.filename || `${job.id}.png`
    );
  }
  
  /**
   * Update job in memory storage
   */
  private async updateJobInMemory(job: ProcessingJob): Promise<void> {
    // Use database service to save job
    await JobDatabaseService.saveJob(job.id, job);
  }
  
  /**
   * Generate suggestions based on detection results
   */
  private generateSuggestions(detectionResult: any): string[] {
    const suggestions = [];

    if (!detectionResult.rooms || detectionResult.rooms.length === 0) {
      suggestions.push('No rooms detected - try uploading a clearer floor plan image');
    }

    if (!detectionResult.walls || detectionResult.walls.length < 4) {
      suggestions.push('Few walls detected - ensure the floor plan has clear wall lines');
    }

    if (detectionResult.rooms && detectionResult.rooms.length > 0) {
      const unnamedRooms = detectionResult.rooms.filter(r => !r.label || r.label.includes('Room'));
      if (unnamedRooms.length > 0) {
        suggestions.push(`${unnamedRooms.length} rooms need labels - add room names for better identification`);
      }
    }

    if (!detectionResult.doors || detectionResult.doors.length === 0) {
      suggestions.push('No doors detected - doors help with navigation flow analysis');
    }

    return suggestions;
  }

  /**
   * Merge OpenCV and GPT-4 Vision detection results
   * Strategy: Use OpenCV's precise walls, GPT-4's intelligent room naming
   */
  private mergeDetectionResults(opencv: any, gpt: any): any {
    // Use OpenCV's walls (more accurate coordinates)
    const walls = opencv.walls || [];

    // Enhance OpenCV rooms with GPT-4's intelligent naming
    const rooms = (opencv.rooms || []).map((opencvRoom: any) => {
      // Try to find matching GPT room by spatial overlap
      let matchingGptRoom: any = null;
      let maxOverlap = 0;

      for (const gptRoom of gpt.rooms) {
        const overlap = this.calculateRoomOverlap(opencvRoom, gptRoom);
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          matchingGptRoom = gptRoom;
        }
      }

      // If we found a good match (>30% overlap), use GPT's naming
      if (matchingGptRoom && maxOverlap > 0.3) {
        return {
          ...opencvRoom,
          label: matchingGptRoom.name || opencvRoom.label,
          type: matchingGptRoom.type || opencvRoom.type,
          area: matchingGptRoom.area || opencvRoom.area,
          confidence: Math.max(opencvRoom.confidence || 0, matchingGptRoom.confidence || 0)
        };
      }

      return opencvRoom;
    });

    // Merge doors from both sources (remove duplicates)
    const doors = this.mergePositionalElements(
      opencv.doors || [],
      gpt.doors || [],
      50 // Distance threshold in pixels
    );

    // Merge windows from both sources (remove duplicates)
    const windows = this.mergePositionalElements(
      opencv.windows || [],
      gpt.windows || [],
      50 // Distance threshold in pixels
    );

    // Use OpenCV's fixtures and text since GPT doesn't provide these
    const fixtures = opencv.fixtures || [];
    const text = opencv.text || [];

    // Combine measurements (prefer GPT if available and valid)
    const measurements = gpt.measurements && gpt.measurements.scale > 0
      ? gpt.measurements
      : opencv.measurements || {};

    // Combine metadata
    const metadata = {
      ...opencv.metadata,
      ...gpt.metadata,
      confidence: Math.max(opencv.metadata?.confidence || 0, gpt.metadata?.confidence || 0),
      detectionMethod: 'hybrid-opencv-gpt4',
      opencvWalls: walls.length,
      gptRooms: gpt.rooms.length,
      mergedRooms: rooms.length
    };

    return {
      walls,
      rooms,
      doors,
      windows,
      fixtures,
      text,
      measurements,
      metadata
    };
  }

  /**
   * Calculate overlap between two rooms (simplified bounding box overlap)
   */
  private calculateRoomOverlap(room1: any, room2: any): number {
    // Get bounding boxes for both rooms
    const bbox1 = this.getBoundingBox(room1.vertices || room1.polygon || []);
    const bbox2 = this.getBoundingBox(room2.vertices || []);

    // Calculate intersection area
    const xOverlap = Math.max(0, Math.min(bbox1.maxX, bbox2.maxX) - Math.max(bbox1.minX, bbox2.minX));
    const yOverlap = Math.max(0, Math.min(bbox1.maxY, bbox2.maxY) - Math.max(bbox1.minY, bbox2.minY));
    const intersectionArea = xOverlap * yOverlap;

    // Calculate union area
    const area1 = (bbox1.maxX - bbox1.minX) * (bbox1.maxY - bbox1.minY);
    const area2 = (bbox2.maxX - bbox2.minX) * (bbox2.maxY - bbox2.minY);
    const unionArea = area1 + area2 - intersectionArea;

    // Return intersection over union (IoU)
    return unionArea > 0 ? intersectionArea / unionArea : 0;
  }

  /**
   * Get bounding box from vertices
   */
  private getBoundingBox(vertices: Array<{x: number, y: number}>): {minX: number, maxX: number, minY: number, maxY: number} {
    if (!vertices || vertices.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }

  /**
   * Merge positional elements (doors/windows) from two sources
   * Removes duplicates based on distance threshold
   */
  private mergePositionalElements(elements1: any[], elements2: any[], distanceThreshold: number): any[] {
    const merged = [...elements1];

    for (const elem2 of elements2) {
      const pos2 = elem2.position || { x: elem2.x, y: elem2.y };

      // Check if this element is close to any existing element
      const isDuplicate = merged.some(elem1 => {
        const pos1 = elem1.position || { x: elem1.x, y: elem1.y };
        const distance = Math.sqrt(
          Math.pow(pos1.x - pos2.x, 2) +
          Math.pow(pos1.y - pos2.y, 2)
        );
        return distance < distanceThreshold;
      });

      // If not a duplicate, add it
      if (!isDuplicate) {
        merged.push(elem2);
      }
    }

    return merged;
  }
}

// Export singleton instance
export const jobProcessor = new JobProcessorService();