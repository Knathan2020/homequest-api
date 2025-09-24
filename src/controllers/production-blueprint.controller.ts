import { Request, Response } from 'express';
import multer from 'multer';
import { productionBlueprintProcessor } from '../services/production-blueprint-processor.service';
import { loggers } from '../utils/logger';
import { jobQueue } from '../services/job-queue.service';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf'
    ];
    
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Accepted types: ${validTypes.join(', ')}`));
    }
  }
}).single('blueprint');

export class ProductionBlueprintController {
  /**
   * Process blueprint with Claude Vision + OpenCV
   */
  async processBlueprint(req: Request, res: Response) {
    try {
      // Handle file upload
      await new Promise((resolve, reject) => {
        upload(req, res, (err) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      if (!req.file) {
        loggers.api.warn('Blueprint processing failed - no file uploaded');
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Parse options from request
      const options = {
        useOpus: req.body.useOpus !== 'false',
        enhanceImage: req.body.enhanceImage === 'true',
        validateCodes: req.body.validateCodes !== 'false',
        generateGLB: req.body.generateGLB === 'true'
      };

      const blueprintId = `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      loggers.blueprint.info(`Processing blueprint: ${req.file.originalname}`, {
        blueprintId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        fileSizeMB: (req.file.size / 1024 / 1024).toFixed(2),
        mimeType: req.file.mimetype,
        options
      });

      // Create job and return immediately
      const job = jobQueue.createJob(blueprintId, req.file.originalname);
      
      // Process in background (don't await)
      this.processInBackground(blueprintId, req.file.buffer, req.file.originalname, options);

      // Return job ID immediately
      res.json({
        success: true,
        jobId: blueprintId,
        message: 'Processing started. Poll /api/blueprint/status/:jobId for updates.',
        estimatedTime: '3-4 minutes'
      });

    } catch (error) {
      console.error('Blueprint processing error:', error);
      loggers.api.error('Blueprint processing failed', { error });
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  }

  /**
   * Process blueprint in background
   */
  private async processInBackground(blueprintId: string, buffer: Buffer, filename: string, options: any) {
    const startTime = Date.now();
    
    try {
      loggers.blueprint.process(blueprintId, 'Starting production processing');
      
      // Update progress periodically
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(95, Math.floor((elapsed / 240000) * 100)); // 4 minute estimate
        jobQueue.updateProgress(blueprintId, progress);
      }, 5000);
      
      const result = await productionBlueprintProcessor.processBlueprint(
        buffer,
        filename,
        options
      );
      
      clearInterval(progressInterval);
      jobQueue.updateProgress(blueprintId, 100);
      
      loggers.performance.measure('Blueprint processing', startTime);

      // Check if processing was successful
      if (!result.overall_results.processing_success && result.overall_results.critical_errors?.length > 0) {
        jobQueue.failJob(blueprintId, 'Processing failed: ' + result.overall_results.critical_errors.join(', '));
      } else {
        jobQueue.completeJob(blueprintId, result);
      }
      
    } catch (error) {
      console.error('Background processing error:', error);
      jobQueue.failJob(blueprintId, error instanceof Error ? error.message : 'Processing failed');
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(req: Request, res: Response) {
    const { jobId } = req.params;
    const job = jobQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        filename: job.filename,
        ...(job.status === 'completed' && { result: job.result }),
        ...(job.status === 'failed' && { error: job.error })
      }
    });
  }

  /**
   * Get detailed processing capabilities
   */
  async getCapabilities(req: Request, res: Response) {
    res.json({
      success: true,
      capabilities: {
        processing_methods: [
          {
            name: 'Claude Vision + OpenCV',
            description: 'Production-ready processing with AI vision and computer vision',
            accuracy: '85-90%',
            models: ['claude-3-opus', 'claude-3-sonnet']
          }
        ],
        supported_formats: [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'application/pdf'
        ],
        max_file_size: '50MB',
        processing_stages: [
          { stage: 1, name: 'Blueprint Quality Assessment' },
          { stage: 2, name: 'Element Recognition & Classification' },
          { stage: 2.5, name: 'Architectural Symbol Library' },
          { stage: 3, name: 'Scale Detection & Measurement' },
          { stage: 4, name: 'Precision Coordinate Extraction' },
          { stage: 5, name: 'Real-World Measurements' },
          { stage: 5.5, name: 'Building Code Validation' },
          { stage: 6, name: 'Room Boundary Detection' },
          { stage: 7, name: 'Three.js Formatting' },
          { stage: 8, name: 'GLB Model Specifications' }
        ],
        accuracy_targets: {
          overall: '85-90%',
          simple_cad: '92-95%',
          complex_cad: '85-92%',
          hand_drawn: '75-85%'
        },
        building_codes: {
          standards: ['IBC 2021', 'IRC 2021', 'ADA'],
          validations: [
            'Room minimum sizes',
            'Egress requirements',
            'ADA compliance',
            'Structural requirements'
          ]
        },
        output_formats: {
          data: 'JSON',
          '3d_preview': 'Three.js Scene',
          '3d_model': 'GLB/GLTF',
          report: 'PDF'
        },
        features: [
          'Claude Vision API integration',
          'OpenCV coordinate precision',
          'PDF to image conversion',
          'Curved wall detection',
          'Symbol recognition library',
          'Building code validation',
          'Property line detection',
          'Setback calculation',
          'Site planning data',
          '3D model generation'
        ]
      }
    });
  }

  /**
   * Quick validation without full processing
   */
  async validateBlueprint(req: Request, res: Response) {
    try {
      await new Promise((resolve, reject) => {
        upload(req, res, (err) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      if (!req.file) {
        loggers.api.warn('Blueprint processing failed - no file uploaded');
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Quick validation using sharp
      const sharp = require('sharp');
      const metadata = await sharp(req.file.buffer).metadata();
      
      const issues: string[] = [];
      let quality = 'good';
      
      // Check resolution
      if (metadata.width < 1000 || metadata.height < 800) {
        issues.push('Low resolution - minimum 1000x800 recommended');
        quality = 'fair';
      }
      
      // Check file size
      if (req.file.size > 20 * 1024 * 1024) {
        issues.push('Large file size - consider optimizing');
      }
      
      // Check format
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
        issues.push(`Format ${metadata.format} may not process optimally`);
      }

      res.json({
        success: true,
        validation: {
          file_valid: issues.length === 0,
          quality: quality,
          issues: issues,
          metadata: {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size_mb: (req.file.size / (1024 * 1024)).toFixed(2)
          },
          recommendation: issues.length === 0 ? 'proceed' : 'review_issues'
        }
      });

    } catch (error) {
      console.error('Validation error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      });
    }
  }

  /**
   * Get example/demo blueprint analysis
   */
  async getDemo(req: Request, res: Response) {
    res.json({
      success: true,
      demo: {
        blueprint_id: 'demo_bp_12345',
        processing_method: 'claude_vision_plus_opencv',
        accuracy_metrics: {
          overall_accuracy: 88,
          wall_detection_accuracy: 92,
          room_detection_accuracy: 87,
          measurement_accuracy: 89,
          code_compliance_accuracy: 95,
          site_planning_accuracy: 86
        },
        summary: {
          rooms_detected: 7,
          total_sqft: 2150,
          building_type: 'single_family_ranch',
          building_code_compliant: true,
          ready_for_3d: true
        },
        sample_rooms: [
          { name: 'Living Room', area_sqft: 320, compliant: true },
          { name: 'Master Bedroom', area_sqft: 180, compliant: true },
          { name: 'Kitchen', area_sqft: 150, compliant: true },
          { name: 'Bathroom 1', area_sqft: 60, compliant: true }
        ],
        message: 'This is a demo response. Upload a real blueprint for actual analysis.'
      }
    });
  }
}

// Create singleton instance
export const productionBlueprintController = new ProductionBlueprintController();