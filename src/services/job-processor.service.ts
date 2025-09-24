/**
 * Background Job Processor for Floor Plans
 * Handles asynchronous processing of floor plan detection
 */

import { RealDetectionService } from './real-detection.service';
import { billionDollarDetector } from './billion-dollar-detection.service';
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
      
      // Process the image with BOTH detection services
      console.log('🔍 Processing image with detection services...');
      
      // Try billion dollar detector first for highest accuracy
      let detectionResult;
      let usedBillionDollar = false;
      
      try {
        console.log('💎 Using Billion Dollar Detection Service...');
        const billionResult = await billionDollarDetector.detectFloorPlan(imagePath);
        
        // Convert billion dollar format to standard format
        detectionResult = {
          walls: billionResult.walls.map(w => ({
            id: w.id,
            start: w.start,
            end: w.end,
            thickness: w.thickness,
            type: w.type,
            confidence: w.confidence
          })),
          rooms: billionResult.rooms.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            vertices: r.vertices,
            area: r.area
          })),
          doors: billionResult.doors.map(d => ({
            id: d.id,
            position: d.position,
            width: d.width,
            orientation: d.orientation,
            confidence: d.confidence
          })),
          windows: billionResult.windows,
          fixtures: billionResult.fixtures,
          text: [],
          measurements: billionResult.measurements,
          metadata: billionResult.metadata
        };
        usedBillionDollar = true;
        console.log(`✅ Billion Dollar Detection: ${billionResult.walls.length} walls, ${billionResult.rooms.length} rooms, confidence: ${billionResult.metadata.confidence}%`);
      } catch (billionError) {
        console.log('⚠️ Billion Dollar Detection failed, falling back to Real Detection...');
        console.error(billionError);
        
        // Fallback to Real Detection Service
        detectionResult = await this.detector.detectFloorPlan(imagePath);
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
          confidence: usedBillionDollar ? detectionResult.metadata?.confidence || 95 : 85,
          detectionMethod: usedBillionDollar ? 'billion-dollar-ai' : 'standard'
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
}

// Export singleton instance
export const jobProcessor = new JobProcessorService();