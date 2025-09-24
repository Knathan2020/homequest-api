import { Router } from 'express';
import multer from 'multer';
import { body, param, query, validationResult } from 'express-validator';
import { FloorPlanController } from '../controllers/floor-plan.controller';
import { RealDetectionService } from '../services/real-detection.service';
import { jobProcessor } from '../services/job-processor.service';
import JobDatabaseService from '../services/job-database.service';
import CADProcessorService from '../services/cad/cad-processor.service';
import { AutoCADParserService } from '../services/cad/autocad-parser.service';
import Bull from 'bull';
import fs from 'fs';
import path from 'path';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/tiff',
      'application/pdf',
      // CAD file formats
      'application/acad',           // AutoCAD DWG
      'application/dwg',            // AutoCAD DWG
      'application/dxf',            // AutoCAD DXF
      'application/x-dwg',          // AutoCAD DWG (alternative)
      'application/x-dxf',          // AutoCAD DXF (alternative)
      'model/vnd.skp',              // SketchUp SKP
      'application/x-sketchup',     // SketchUp (alternative)
      // Additional CAD formats
      'application/octet-stream'    // Generic binary (for .dwg, .skp files)
    ];

    // Also check file extensions for CAD files (some browsers don't set correct MIME types)
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.pdf', '.dwg', '.dxf', '.skp'];
    const fileExtension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
    
    if (allowedMimeTypes.includes(file.mimetype) || (fileExtension && allowedExtensions.includes(fileExtension))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported formats: JPEG, PNG, WebP, TIFF, PDF, DWG, DXF, SKP'));
    }
  }
});

// Initialize job database service
JobDatabaseService.initialize();

// Cleanup old jobs every 10 minutes to prevent memory leaks
const jobCleanupInterval = setInterval(async () => {
  await JobDatabaseService.cleanupOldJobs();
}, 600000); // Run every 10 minutes

// Clear interval on process exit
process.on('SIGTERM', () => clearInterval(jobCleanupInterval));
process.on('SIGINT', () => clearInterval(jobCleanupInterval));

const processingQueue = new Bull('floor-plan-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  }
});
const controller = new FloorPlanController(processingQueue);
const cadProcessor = new CADProcessorService();
const autoCADParser = new AutoCADParserService();

const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * @route   POST /api/floor-plans/upload
 * @desc    Upload a floor plan image
 * @access  Private
 */
router.post(
  '/upload',
  upload.single('floorPlan'),
  controller.uploadFloorPlan.bind(controller)
);

/**
 * @route   GET /api/floor-plans/project/:projectId
 * @desc    Get all floor plans for a project
 * @access  Public
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // For now, return empty array since we don't have persistent storage
    // TODO: Implement database storage
    const floorPlans = [];
    
    res.json({
      success: true,
      data: floorPlans,
      projectId
    });
  } catch (error) {
    console.error('Error fetching project floor plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch floor plans',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/floor-plans/job/:jobId
 * @desc    Get job status for floor plan processing
 * @access  Public
 */
router.get('/job/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  // Get job from database service
  const job = await JobDatabaseService.getJob(jobId);
  
  if (!job) {
    return res.status(404).json({
      error: 'Job not found',
      jobId
    });
  }
  
  // If job is pending, start background processing
  if (job.status === 'pending') {
    console.log(`🚀 Starting background processing for job: ${jobId}`);
    job.status = 'processing';
    job.progress = 5;
    await JobDatabaseService.saveJob(jobId, job);
    
    // Start background processing (non-blocking)
    jobProcessor.startBackgroundProcessing(jobId);
    
    // Return current status while processing
    return res.json({
      jobId,
      status: job.status,
      progress: job.progress || 0,
      message: 'Processing started...'
    });
  }
  
  // If still processing, return current status
  if (job.status === 'processing') {
    return res.json({
      jobId,
      status: job.status,
      progress: job.progress || 10,
      message: 'Processing in progress...'
    });
  }
  
  // Job is complete or failed - return full result
  res.json({
    id: job.id,
    jobId,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    data: job
  });
});

// Remove old processing code below
/*
      // Get the uploaded file path
      const imagePath = job.uploadPath 
        ? path.join(process.cwd(), 'uploads', 'floor-plans', job.uploadPath)
        : path.join(process.cwd(), 'uploads', 'floor-plans', jobId, 'original', job.filename || `${jobId}.png`);
      
      console.log('🔍 Looking for image at:', imagePath);
      console.log('📁 File exists:', fs.existsSync(imagePath));
      
      if (fs.existsSync(imagePath)) {
        console.log('📸 Processing file with Real Detection Service...');
        
        try {
          // Check if it's a PDF and skip processing for now
          if (imagePath.toLowerCase().endsWith('.pdf')) {
            console.log('⚠️ PDF processing not yet supported');
            job.status = 'completed';
            job.progress = 100;
            job.result = {
              features: {
                walls: [],
                rooms: [],
                doors: [],
                windows: [],
                stairs: [],
                fixtures: []
              },
              message: 'PDF processing not yet supported. Please upload an image file (PNG, JPG, etc.)'
            };
          } else {
            const detector = new RealDetectionService();
            const detectionResult = await detector.detectFloorPlan(imagePath);
            console.log('✅ Detection complete:', detectionResult.rooms?.length || 0, 'rooms detected');
            
            job.status = 'completed';
            job.progress = 100;
            job.result = {
              features: {
                walls: detectionResult.walls || [],
              doors: detectionResult.doors || [],
              windows: detectionResult.windows || [],
              rooms: detectionResult.rooms || [],
              stairs: [],
              elevators: [],
              annotations: detectionResult.text || []
            },
            analysis: {
              summary: `Detected ${detectionResult.rooms?.length || 0} rooms, ${detectionResult.walls?.length || 0} walls, ${detectionResult.doors?.length || 0} doors`,
              roomCount: detectionResult.rooms?.length || 0,
              totalArea: detectionResult.rooms?.reduce((sum, r) => sum + (r.area || 0), 0) || 0,
              suggestions: [],
              violations: [],
              confidence: 85
            },
            measurements: detectionResult.measurements || {}
          };
          }
        } catch (error) {
          console.error('❌ Detection error:', error);
          job.status = 'failed';
          job.error = error.message;
        }
      } else {
        console.log('⚠️ File not found, using fallback');
        // Fallback to default detection if file not found
        job.status = 'completed';
        job.progress = 100;
        job.result = {
          ai_analysis: {
            rooms_detected: 3,
            total_sqft: 330,
            confidence: 0.85,
            room_types: ['bedroom', 'bathroom'],
            wall_count: 12,
            door_count: 5,
            window_count: 4,
            detailed_rooms: [
              { 
                type: 'bedroom', 
                area: 150, 
                confidence: 0.9,
                coordinates: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.3], [0.1, 0.3], [0.1, 0.1]]
              },
              { 
                type: 'bedroom', 
                area: 130, 
                confidence: 0.88,
                coordinates: [[0.45, 0.1], [0.7, 0.1], [0.7, 0.3], [0.45, 0.3], [0.45, 0.1]]
              },
              { 
                type: 'bathroom', 
                area: 50, 
                confidence: 0.85,
                coordinates: [[0.75, 0.1], [0.9, 0.1], [0.9, 0.25], [0.75, 0.25], [0.75, 0.1]]
              }
            ],
            detailed_walls: [
              { start: [0.1, 0.1], end: [0.4, 0.1], thickness: 5 },
              { start: [0.4, 0.1], end: [0.4, 0.3], thickness: 5 },
              { start: [0.4, 0.3], end: [0.1, 0.3], thickness: 5 },
              { start: [0.1, 0.3], end: [0.1, 0.1], thickness: 5 },
              { start: [0.45, 0.1], end: [0.7, 0.1], thickness: 5 },
              { start: [0.7, 0.1], end: [0.7, 0.3], thickness: 5 },
              { start: [0.7, 0.3], end: [0.45, 0.3], thickness: 5 },
              { start: [0.45, 0.3], end: [0.45, 0.1], thickness: 5 },
              { start: [0.75, 0.1], end: [0.9, 0.1], thickness: 5 },
              { start: [0.9, 0.1], end: [0.9, 0.25], thickness: 5 },
              { start: [0.9, 0.25], end: [0.75, 0.25], thickness: 5 },
              { start: [0.75, 0.25], end: [0.75, 0.1], thickness: 5 }
            ]
          },
          measurements: {
            doors: [],
            windows: []
          }
        };
      }
      
      jobs.set(jobId, job);
    } catch (error) {
      console.error('Detection error:', error);
      // Use fallback detection on error
      job.status = 'completed';
      job.progress = 100;
      job.result = {
        ai_analysis: {
          rooms_detected: 3,
          total_sqft: 330,
          confidence: 0.85,
          room_types: ['bedroom', 'bathroom'],
          wall_count: 12,
          door_count: 5,
          window_count: 4,
          detailed_rooms: [
            { 
              type: 'bedroom', 
              area: 150, 
              confidence: 0.9,
              coordinates: [[100, 100], [400, 100], [400, 300], [100, 300], [100, 100]]
            },
            { 
              type: 'bedroom', 
              area: 130, 
              confidence: 0.88,
              coordinates: [[450, 100], [700, 100], [700, 300], [450, 300], [450, 100]]
            },
            { 
              type: 'bathroom', 
              area: 50, 
              confidence: 0.85,
              coordinates: [[750, 100], [900, 100], [900, 250], [750, 250], [750, 100]]
            }
          ],
          detailed_walls: [
            { start: [100, 100], end: [400, 100], thickness: 5 },
            { start: [400, 100], end: [400, 300], thickness: 5 },
            { start: [400, 300], end: [100, 300], thickness: 5 },
            { start: [100, 300], end: [100, 100], thickness: 5 },
            { start: [450, 100], end: [700, 100], thickness: 5 },
            { start: [700, 100], end: [700, 300], thickness: 5 },
            { start: [700, 300], end: [450, 300], thickness: 5 },
            { start: [450, 300], end: [450, 100], thickness: 5 },
            { start: [750, 100], end: [900, 100], thickness: 5 },
            { start: [900, 100], end: [900, 250], thickness: 5 },
            { start: [900, 250], end: [750, 250], thickness: 5 },
            { start: [750, 250], end: [750, 100], thickness: 5 }
          ]
        },
        measurements: {
          doors: [],
          windows: []
        }
      };
      jobs.set(jobId, job);
    }
  }
*/

/**
 * @route   POST /api/floor-plans/:id/process
 * @desc    Process an uploaded floor plan
 * @access  Private
 */
router.post(
  '/:id/process',
  [
    param('id').isUUID().withMessage('Invalid floor plan ID'),
    body('enableOCR').optional().isBoolean(),
    body('enableObjectDetection').optional().isBoolean(),
    body('enableAI').optional().isBoolean(),
    body('enableGeometry').optional().isBoolean(),
    body('enable3D').optional().isBoolean(),
    body('outputFormats').optional().isArray(),
    body('outputFormats.*').optional().isIn(['json', 'gltf', 'obj', 'stl', 'ply', 'dae']),
    body('language').optional().isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh']),
    body('units').optional().isIn(['imperial', 'metric']),
    body('scale').optional().isFloat({ min: 0.1, max: 1000 }),
    body('confidence.min').optional().isFloat({ min: 0, max: 1 }),
    body('confidence.required').optional().isFloat({ min: 0, max: 1 })
  ],
  validateRequest,
  controller.processFloorPlan.bind(controller)
);

/**
 * @route   GET /api/floor-plans/:id/status/:jobId
 * @desc    Get processing status for a floor plan
 * @access  Private
 */
router.get(
  '/:id/status/:jobId',
  [
    param('id').isUUID().withMessage('Invalid floor plan ID'),
    param('jobId').isUUID().withMessage('Invalid job ID')
  ],
  validateRequest,
  controller.getProcessingStatus.bind(controller)
);

/**
 * @route   GET /api/floor-plans/:id/results
 * @desc    Get processing results for a floor plan
 * @access  Private
 */
router.get(
  '/:id/results',
  [
    param('id').isUUID().withMessage('Invalid floor plan ID'),
    query('format').optional().isIn(['json', 'gltf', 'obj', 'stl', 'ply', 'dae']),
    query('download').optional().isBoolean()
  ],
  validateRequest,
  controller.getProcessingResults.bind(controller)
);

/**
 * @route   GET /api/floor-plans
 * @desc    Get all floor plans with pagination
 * @access  Private
 */
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['uploaded', 'preprocessing', 'processing', 'completed', 'failed', 'cancelled']),
    query('sortBy').optional().isIn(['uploadedAt', 'processingStartedAt', 'processingCompletedAt', 'filename', 'size']),
    query('order').optional().isIn(['asc', 'desc'])
  ],
  validateRequest,
  controller.getAllFloorPlans.bind(controller)
);

/**
 * @route   DELETE /api/floor-plans/:id
 * @desc    Delete a floor plan
 * @access  Private
 */
router.delete(
  '/:id',
  [
    param('id').isUUID().withMessage('Invalid floor plan ID')
  ],
  validateRequest,
  controller.deleteFloorPlan.bind(controller)
);

/**
 * @route   POST /api/floor-plans/:id/retry/:jobId
 * @desc    Retry processing for a failed job
 * @access  Private
 */
router.post(
  '/:id/retry/:jobId',
  [
    param('id').isUUID().withMessage('Invalid floor plan ID'),
    param('jobId').isUUID().withMessage('Invalid job ID')
  ],
  validateRequest,
  controller.retryProcessing.bind(controller)
);

/**
 * @route   POST /api/floor-plans/:id/cancel/:jobId
 * @desc    Cancel a processing job
 * @access  Private
 */
router.post(
  '/:id/cancel/:jobId',
  [
    param('id').isUUID().withMessage('Invalid floor plan ID'),
    param('jobId').isUUID().withMessage('Invalid job ID')
  ],
  validateRequest,
  controller.cancelProcessing.bind(controller)
);

/**
 * @route   POST /api/floor-plans/real-detect
 * @desc    Detect floor plan elements using Real Detection (YOLO + Tesseract + Parallel Walls)
 * @access  Public
 */
router.post('/real-detect', upload.single('file'), async (req: any, res: any) => {
  try {
    console.log('📍 Real Detection endpoint called');
    
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        code: 'NO_FILE'
      });
    }

    // Save uploaded file temporarily
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const tempFilename = `real-detect-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const tempFilePath = path.join(uploadDir, tempFilename);
    
    // Write file to disk
    fs.writeFileSync(tempFilePath, req.file.buffer);
    console.log(`✅ File saved to: ${tempFilePath}`);

    // Initialize Real Detection Service
    const realDetectionService = new RealDetectionService();
    
    // Perform detection
    console.log('🔍 Starting Real Detection...');
    const result = await realDetectionService.detectFloorPlan(tempFilePath);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    console.log('🧹 Temp file cleaned up');

    // Return results
    res.json({
      success: true,
      message: 'Real detection completed successfully',
      data: result,
      stats: {
        walls: result.walls.length,
        doors: result.doors.length,
        windows: result.windows.length,
        rooms: result.rooms.length,
        text: result.text.length,
        fixtures: result.fixtures.length,
        hasInteriorWalls: result.walls.filter((w: any) => w.type === 'interior').length,
        hasExteriorWalls: result.walls.filter((w: any) => w.type === 'exterior').length,
        hasLoadBearingWalls: result.walls.filter((w: any) => w.type === 'load-bearing').length
      }
    });

  } catch (error: any) {
    console.error('❌ Real detection error:', error);
    res.status(500).json({
      error: 'Real detection failed',
      code: 'DETECTION_FAILED',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/floor-plans/:id/validate
 * @desc    Validate processing results
 * @access  Private
 */
router.get(
  '/:id/validate',
  [
    param('id').isUUID().withMessage('Invalid floor plan ID')
  ],
  validateRequest,
  controller.validateFloorPlan.bind(controller)
);

/**
 * Error handling middleware
 */
router.use((error: any, _req: any, res: any, _next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File size exceeds 50MB limit',
        code: 'FILE_TOO_LARGE'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files. Only one file allowed',
        code: 'TOO_MANY_FILES'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected field name. Expected "floorPlan"',
        code: 'INVALID_FIELD_NAME'
      });
    }
  }
  
  if (error.message && error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  console.error('Route error:', error);
  
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

/**
 * @route   POST /api/floor-plans/upload-cad
 * @desc    Upload and process CAD files (DWG, DXF, SKP) and PDF floor plans
 * @access  Private
 */
router.post('/upload-cad', upload.single('cadFile'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No CAD file provided',
        code: 'NO_FILE'
      });
    }

    const file = req.file;
    const fileName = file.originalname;
    const fileExtension = path.extname(fileName).toLowerCase();

    console.log(`🏗️ Processing CAD file: ${fileName}`);

    // Check if it's a CAD or PDF file
    const cadExtensions = ['.dwg', '.dxf', '.skp', '.pdf'];
    if (!cadExtensions.includes(fileExtension)) {
      return res.status(400).json({
        error: 'Not a CAD/PDF file. Supported formats: DWG, DXF, SKP, PDF',
        code: 'INVALID_CAD_FORMAT'
      });
    }

    // Save temporary file
    const tempId = require('uuid').v4();
    const tempPath = path.join(process.cwd(), 'uploads', `temp_${tempId}${fileExtension}`);
    
    // Ensure uploads directory exists
    const uploadsDir = path.dirname(tempPath);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(tempPath, file.buffer);

    let result: any;
    let floorPlanData: any = null;

    // Enhanced processing for DXF files with native parser
    if (fileExtension === '.dxf') {
      console.log('📐 Using native DXF parser for enhanced floor plan extraction');
      
      try {
        // Parse DXF file for detailed floor plan data
        floorPlanData = await autoCADParser.parseDXF(tempPath);
        
        console.log('✅ DXF parsing successful:', {
          walls: floorPlanData.walls.length,
          rooms: floorPlanData.rooms.length,
          doors: floorPlanData.doors.length,
          windows: floorPlanData.windows.length,
          textLabels: floorPlanData.textLabels.length
        });

        // Still use CAD processor for image generation
        const processingOptions = {
          outputFormat: 'png' as const,
          resolution: 300,
          scale: 1.0,
          includeMetadata: true
        };

        result = await cadProcessor.processCADFile(tempPath, processingOptions);
        
        // Enhance result with parsed data
        if (result.success) {
          result.floorPlanData = floorPlanData;
          result.enhancedParsing = true;
          result.parserUsed = 'native-dxf';
        }

      } catch (dxfError: any) {
        console.error('❌ DXF parsing failed, falling back to standard CAD processing:', dxfError.message);
        
        // Fallback to standard processing
        const processingOptions = {
          outputFormat: 'png' as const,
          resolution: 300,
          scale: 1.0,
          includeMetadata: true
        };

        result = await cadProcessor.processCADFile(tempPath, processingOptions);
        result.dxfParsingError = dxfError.message;
        result.parserUsed = 'imagemagick-fallback';
      }
    } else {
      // Standard CAD processing for other formats
      const processingOptions = {
        outputFormat: 'png' as const,
        resolution: 300,
        scale: 1.0,
        includeMetadata: true
      };

      result = await cadProcessor.processCADFile(tempPath, processingOptions);
      result.parserUsed = 'imagemagick-standard';
    }

    // Clean up temporary file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    if (result.success) {
      res.json({
        success: true,
        message: 'CAD file processed successfully',
        data: {
          originalFile: fileName,
          fileType: result.metadata.fileType,
          outputPath: result.outputPath,
          metadata: result.metadata,
          previewImage: result.previewImage,
          extractedLayers: result.extractedLayers,
          floorPlanData: result.floorPlanData || null,
          enhancedParsing: result.enhancedParsing || false,
          parserUsed: result.parserUsed || 'imagemagick-standard',
          cadToolsAvailable: await cadProcessor.checkCADToolsAvailability()
        }
      });
    } else {
      res.status(422).json({
        error: 'CAD processing failed',
        code: 'CAD_PROCESSING_FAILED',
        details: result.error,
        metadata: result.metadata
      });
    }

  } catch (error: any) {
    console.error('❌ CAD upload error:', error);
    res.status(500).json({
      error: 'CAD processing failed',
      code: 'CAD_ERROR',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/floor-plans/cad-tools-status
 * @desc    Check availability of CAD processing tools
 * @access  Public
 */
router.get('/cad-tools-status', async (_req: any, res: any) => {
  try {
    const toolsStatus = await cadProcessor.checkCADToolsAvailability();
    
    res.json({
      success: true,
      data: {
        tools: toolsStatus,
        summary: {
          anyToolsAvailable: Object.values(toolsStatus).some(available => available),
          recommendedInstalls: [
            !toolsStatus.librecad ? 'LibreCAD (sudo apt-get install librecad)' : null,
            !toolsStatus.imagemagick ? 'ImageMagick (sudo apt-get install imagemagick)' : null,
            !toolsStatus.dxf2img ? 'dxf2img (custom CAD converter)' : null
          ].filter(Boolean)
        }
      }
    });
  } catch (error: any) {
    console.error('❌ CAD tools check error:', error);
    res.status(500).json({
      error: 'Failed to check CAD tools',
      code: 'CAD_TOOLS_CHECK_FAILED',
      message: error.message
    });
  }
});

export default router;