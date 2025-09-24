/**
 * Enhanced Wall Detection Routes
 * Direct endpoint for Homestyler-like wall detection using OpenCV
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: './uploads/enhanced/',
  filename: (req, file, cb) => {
    const uniqueName = `enhanced-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) are allowed'));
    }
  }
});

/**
 * Enhanced Wall Detection Endpoint
 * POST /api/enhanced/detect-walls
 * 
 * Uses Homestyler-like Canny Edge Detection + Hough Transform
 */
router.post('/detect-walls', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    console.log('🚀 Enhanced Wall Detection Started');
    console.log('📁 Processing image:', req.file.originalname);
    
    // Dynamically import enhanced detector to avoid compilation issues
    const { EnhancedWallDetectorService } = await import('../services/enhanced-wall-detector.service');
    const enhancedDetector = new EnhancedWallDetectorService();
    
    console.log('✅ Enhanced detector loaded successfully');
    
    // Perform complete enhanced detection with area calculation
    const startTime = Date.now();
    const analysisResult = await enhancedDetector.detectFloorPlanComplete(req.file.path);
    const processingTime = Date.now() - startTime;
    
    const walls = analysisResult.walls || [];
    console.log(`✅ Enhanced detection complete: Found ${walls.length} walls, ${analysisResult.totalArea} sq ft in ${processingTime}ms`);

    // Group walls by type for statistics
    const wallStats = {
      byType: {
        interior: walls.filter(w => w.type === 'interior').length,
        exterior: walls.filter(w => w.type === 'exterior').length,
        loadBearing: walls.filter(w => w.type === 'load-bearing').length
      },
      total: walls.length,
      totalLength: walls.reduce((sum, w) => sum + w.length, 0),
      averageConfidence: walls.length > 0 ? walls.reduce((sum, w) => sum + w.confidence, 0) / walls.length : 0
    };

    res.json({
      success: true,
      data: {
        walls: walls.map(w => ({
          id: w.id,
          start: w.start,
          end: w.end,
          thickness: w.thickness,
          type: w.type,
          confidence: w.confidence,
          angle: w.angle,
          length: w.length
        })),
        statistics: wallStats,
        floorPlan: {
          totalArea: analysisResult.totalArea || 0,
          dimensions: analysisResult.dimensions || { width: 0, height: 0 },
          units: 'square feet'
        },
        processing: {
          method: 'Enhanced Detection (Canny + Hough)',
          processingTime: processingTime,
          algorithm: 'Homestyler-like OpenCV',
          opencvVersion: '4.6.0'
        },
        metadata: {
          processedAt: new Date().toISOString(),
          fileName: req.file.originalname,
          enhanced: true
        }
      }
    });

  } catch (error) {
    console.error('❌ Enhanced detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Enhanced wall detection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;