import { Request, Response } from 'express';
import multer from 'multer';
import { enhancedBlueprintProcessor } from '../services/enhanced-blueprint-processor.service';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  }
}).single('blueprint');

export class EnhancedBlueprintController {
  /**
   * Process a blueprint through the enhanced 10-stage pipeline
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
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      console.log(`📤 Received blueprint: ${req.file.originalname} (${req.file.size} bytes)`);

      // Process the blueprint
      const result = await enhancedBlueprintProcessor.processBlueprint(
        req.file.buffer,
        req.file.originalname
      );

      // Send successful response
      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Blueprint processing error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  }

  /**
   * Get current processing status
   */
  async getProcessingStatus(req: Request, res: Response) {
    try {
      const status = enhancedBlueprintProcessor.getProcessingStatus();
      
      res.json({
        success: true,
        stages: status,
        summary: {
          total: status.length,
          completed: status.filter(s => s.status === 'completed').length,
          processing: status.filter(s => s.status === 'processing').length,
          pending: status.filter(s => s.status === 'pending').length,
          failed: status.filter(s => s.status === 'failed').length
        }
      });
    } catch (error) {
      console.error('Status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get status'
      });
    }
  }

  /**
   * Process blueprint with specific stages only
   */
  async processSelectedStages(req: Request, res: Response) {
    try {
      await new Promise((resolve, reject) => {
        upload(req, res, (err) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { stages } = req.body;
      if (!stages || !Array.isArray(stages)) {
        return res.status(400).json({
          success: false,
          error: 'Stages parameter must be an array of stage numbers'
        });
      }

      console.log(`📤 Processing blueprint with stages: ${stages.join(', ')}`);

      // For now, process all stages (can be modified to process selected stages)
      const result = await enhancedBlueprintProcessor.processBlueprint(
        req.file.buffer,
        req.file.originalname
      );

      // Filter results to only include requested stages
      const filteredResult = {
        ...result,
        processing_stages: Object.fromEntries(
          Object.entries(result.processing_stages).filter(([key]) => {
            const stageNum = parseFloat(key.replace('stage_', '').replace('_', '.'));
            return stages.includes(stageNum);
          })
        )
      };

      res.json({
        success: true,
        data: filteredResult
      });

    } catch (error) {
      console.error('Selective processing error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  }

  /**
   * Validate blueprint quality before processing
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
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Initialize processor
      await enhancedBlueprintProcessor.initialize();

      // Process only Stage 1 (Quality Assessment)
      const result = await enhancedBlueprintProcessor.processBlueprint(
        req.file.buffer,
        req.file.originalname
      );

      const qualityAssessment = result.processing_stages.stage_1_assessment;

      res.json({
        success: true,
        data: {
          quality: qualityAssessment,
          recommendation: qualityAssessment?.processing_recommendation || 'unknown',
          canProcess: qualityAssessment?.processing_recommendation === 'proceed'
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
   * Get supported blueprint types and features
   */
  async getCapabilities(req: Request, res: Response) {
    res.json({
      success: true,
      capabilities: {
        supportedFormats: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
        maxFileSize: '50MB',
        processingStages: [
          { stage: 1, name: 'Blueprint Quality Assessment', description: 'Assess image quality and readability' },
          { stage: 2, name: 'Element Recognition & Classification', description: 'Detect walls, doors, windows, and property lines' },
          { stage: 2.5, name: 'Architectural Symbol Library', description: 'Identify electrical, plumbing, HVAC symbols' },
          { stage: 3, name: 'Scale Detection & Measurement', description: 'Detect drawing scale using multiple methods' },
          { stage: 4, name: 'Coordinate Extraction with Curves', description: 'Extract precise coordinates including curved elements' },
          { stage: 5, name: 'Real-World Measurements', description: 'Convert pixels to feet/inches' },
          { stage: 5.5, name: 'Building Code Validation', description: 'Validate against IBC/ADA requirements' },
          { stage: 6, name: 'Room Boundary Detection', description: 'Detect room boundaries and spatial relationships' },
          { stage: 7, name: 'Three.js Formatting', description: 'Format for 3D visualization' },
          { stage: 8, name: 'GLB Model Specifications', description: 'Generate specs for 3D model creation' }
        ],
        accuracyTargets: {
          overall: '85-90%',
          simpleCAD: '92-95%',
          complexCAD: '85-92%',
          handDrawn: '75-85%'
        },
        features: [
          'OCR confidence thresholds',
          'Architectural symbol recognition',
          'Curved wall handling',
          'Building code compliance checking',
          'Property line and setback detection',
          'ADA compliance validation',
          'Site planning data extraction'
        ]
      }
    });
  }
}

// Create singleton instance
export const enhancedBlueprintController = new EnhancedBlueprintController();