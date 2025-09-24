/**
 * Intelligent Floor Plan Analysis Routes
 * Combines YOLO + Tesseract + RAG for comprehensive floor plan understanding
 */

import { Router, Request, Response } from 'express';
import intelligentService from '../services/intelligent-floor-plan.service';
import { RealDetectionService } from '../services/real-detection.service';
import { RealMLTrainingService } from '../services/real-ml-training.service';
import multer from 'multer';
import path from 'path';

const router = Router();
const realDetectionService = new RealDetectionService();
const mlTrainingService = new RealMLTrainingService();

// Configure multer for floor plan uploads
const storage = multer.diskStorage({
  destination: './uploads/floor-plans/',
  filename: (req, file, cb) => {
    const uniqueName = `intelligent-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) and PDFs are allowed'));
    }
  }
});

/**
 * Intelligent Floor Plan Analysis
 * POST /api/intelligent/analyze
 * 
 * Combines YOLO object detection + Tesseract OCR + RAG knowledge
 */
router.post('/analyze', upload.single('floorPlan'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Floor plan image is required'
      });
    }

    const { projectId, options = {} } = req.body;
    const imagePath = req.file.path;

    console.log('🧠 Starting intelligent analysis for:', req.file.originalname);

    // Perform comprehensive analysis
    const analysis = await intelligentService.analyzeFloorPlan(
      imagePath,
      projectId,
      {
        detectWalls: options.detectWalls !== false,
        extractText: options.extractText !== false,
        analyzeCompliance: options.analyzeCompliance !== false,
        generateInsights: options.generateInsights !== false
      }
    );

    res.json({
      success: true,
      data: {
        summary: {
          totalArea: analysis.analysis.totalArea,
          roomCount: analysis.analysis.roomCount,
          wallCount: analysis.walls.length,
          doorsWindows: analysis.objects.filter(o => o.type === 'door' || o.type === 'window').length
        },
        detection: {
          walls: analysis.walls.map(w => ({
            type: w.type,
            color: w.color,
            thickness: w.thickness,
            length: w.length
          })),
          rooms: analysis.rooms.map(r => ({
            id: r.id,
            label: r.label,
            area: r.area,
            hasDoor: r.doors.length > 0,
            hasWindow: r.windows.length > 0
          })),
          objects: analysis.objects.length
        },
        text: {
          roomLabels: Object.values(analysis.roomLabels),
          dimensions: Object.values(analysis.dimensions),
          specifications: analysis.specifications.slice(0, 5) // Limit to 5
        },
        intelligence: {
          compliance: analysis.analysis.compliance,
          suggestions: analysis.analysis.suggestions.slice(0, 5),
          materials: analysis.analysis.materials.slice(0, 10),
          knowledge: analysis.knowledge
        },
        metadata: {
          processedAt: new Date().toISOString(),
          projectId,
          fileName: req.file.originalname
        }
      }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Analysis failed. Please try again.'
    });
  }
});

/**
 * Ask Questions About Floor Plan
 * POST /api/intelligent/ask
 * 
 * Natural language Q&A about analyzed floor plans
 */
router.post('/ask', async (req: Request, res: Response) => {
  try {
    const { floorPlanId, question, projectId } = req.body;

    if (!floorPlanId || !question) {
      return res.status(400).json({
        success: false,
        error: 'Floor plan ID and question are required'
      });
    }

    console.log(`❓ Question about floor plan ${floorPlanId}: ${question}`);

    const answer = await intelligentService.askAboutFloorPlan(
      floorPlanId,
      question,
      projectId
    );

    res.json({
      success: true,
      data: {
        question,
        answer: answer.answer,
        confidence: answer.confidence,
        sources: answer.sources,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Q&A error:', error);
    res.status(500).json({
      success: false,
      error: 'Could not process question'
    });
  }
});

/**
 * Real-time Wall Detection
 * POST /api/intelligent/detect-walls
 * 
 * Specific endpoint for wall detection with color classification
 */
router.post('/detect-walls', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    // Use the enhanced OpenCV wall detection with complete floor plan analysis
    try {
      const { EnhancedWallDetectorService } = await import('../services/enhanced-wall-detector.service');
      const enhancedDetector = new EnhancedWallDetectorService();
      const analysisResult = await enhancedDetector.detectFloorPlanComplete(req.file.path);
      
      if (analysisResult.success && analysisResult.walls && analysisResult.walls.length > 0) {
        console.log(`✅ Enhanced detection found ${analysisResult.walls.length} walls`);
        var detection = {
          walls: analysisResult.walls,
          rooms: [], // Will be enhanced later
          doors: [],
          windows: [],
          totalArea: analysisResult.totalArea,
          dimensions: analysisResult.dimensions,
          mlEnhanced: true
        };
      } else {
        console.log('⚠️ Enhanced detection found no walls, using fallback');
        var detection = await realDetectionService.detectFloorPlan(req.file.path);
      }
    } catch (enhancedError) {
      console.log('❌ Enhanced detection failed, using fallback:', enhancedError.message);
      var detection = await realDetectionService.detectFloorPlan(req.file.path);
    }
    
    // Apply ML enhancements if models are trained
    try {
      detection = await mlTrainingService.enhanceWithML(detection);
      console.log('✨ Applied ML enhancements to detection');
    } catch (mlError) {
      console.log('📊 ML models not yet trained, using base detection');
    }
    
    // Convert to expected format for backwards compatibility
    const analysis = {
      walls: detection.walls || [],
      rooms: detection.rooms || [],
      doors: detection.doors || [],
      windows: detection.windows || [],
      mlEnhanced: detection.mlEnhanced || false
    };

    // Group walls by type and color
    const wallStats = {
      byType: {
        interior: analysis.walls.filter(w => w.type === 'interior').length,
        exterior: analysis.walls.filter(w => w.type === 'exterior').length,
        loadBearing: analysis.walls.filter(w => w.type === 'load-bearing').length
      },
      byColor: {
        black: analysis.walls.filter(w => w.color === 'black').length,
        grey: analysis.walls.filter(w => w.color === 'grey').length,
        pattern: analysis.walls.filter(w => w.color === 'pattern').length
      },
      total: analysis.walls.length,
      totalLength: analysis.walls.reduce((sum, w) => sum + w.length, 0)
    };

    // DEBUG: Log first few walls to see coordinates
    console.log('📊 API sending walls sample:', analysis.walls.slice(0, 3).map(w => ({
      id: w.id,
      start: w.start,
      end: w.end
    })));
    
    console.log('📊 Image dimensions from detection:', detection.dimensions);

    res.json({
      success: true,
      data: {
        walls: analysis.walls,
        rooms: analysis.rooms,
        doors: analysis.doors,
        windows: analysis.windows,
        mlEnhanced: analysis.mlEnhanced,
        statistics: wallStats,
        floorPlan: {
          totalArea: detection.totalArea || 0,
          dimensions: detection.dimensions || { width: 0, height: 0 },
          units: 'square feet'
        },
        scaling: detection.scaling || {
          pixelsPerFoot: 10,
          method: 'default',
          confidence: 0.1,
          name: 'Default scaling'
        },
        timestamp: new Date().toISOString(),
        detectionMethod: analysis.mlEnhanced ? 'ML-Enhanced Detection (Homestyler Algorithm)' : 'Base Detection'
      }
    });

  } catch (error) {
    console.error('Wall detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Wall detection failed'
    });
  }
});

/**
 * Extract Text from Floor Plan
 * POST /api/intelligent/extract-text
 * 
 * OCR endpoint for extracting labels, dimensions, and notes
 */
router.post('/extract-text', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    const analysis = await intelligentService.analyzeFloorPlan(
      req.file.path,
      undefined,
      { 
        detectWalls: false,
        extractText: true,
        analyzeCompliance: false,
        generateInsights: false 
      }
    );

    res.json({
      success: true,
      data: {
        roomLabels: analysis.roomLabels,
        dimensions: analysis.dimensions,
        specifications: analysis.specifications,
        allText: analysis.extractedTexts.map(t => ({
          text: t.text,
          type: t.type,
          confidence: t.confidence
        })),
        statistics: {
          totalTexts: analysis.extractedTexts.length,
          roomsIdentified: Object.keys(analysis.roomLabels).length,
          dimensionsFound: Object.keys(analysis.dimensions).length
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Text extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Text extraction failed'
    });
  }
});

/**
 * Get Compliance Report
 * POST /api/intelligent/compliance
 * 
 * Check floor plan against building codes and regulations
 */
router.post('/compliance', async (req: Request, res: Response) => {
  try {
    const { floorPlanId, projectId, checkTypes = ['ada', 'fire', 'building'] } = req.body;

    if (!floorPlanId) {
      return res.status(400).json({
        success: false,
        error: 'Floor plan ID is required'
      });
    }

    // Generate compliance questions for RAG
    const questions = checkTypes.map(type => {
      switch(type) {
        case 'ada':
          return 'Check this floor plan for ADA compliance including doorway widths, bathroom accessibility, and turning radius requirements.';
        case 'fire':
          return 'Verify fire code compliance including egress routes, fire-rated walls, and emergency exits.';
        case 'building':
          return 'Check building code compliance for room sizes, ceiling heights, and structural requirements.';
        default:
          return `Check ${type} compliance.`;
      }
    });

    const results = await Promise.all(
      questions.map(q => 
        intelligentService.askAboutFloorPlan(floorPlanId, q, projectId)
      )
    );

    const compliance = {
      ada: checkTypes.includes('ada') ? {
        compliant: results[0]?.answer.includes('compliant'),
        issues: results[0]?.answer.match(/issue[s]?:([^.]+)/gi) || [],
        recommendations: results[0]?.answer.match(/recommend[s]?:([^.]+)/gi) || []
      } : null,
      fire: checkTypes.includes('fire') ? {
        compliant: results[1]?.answer.includes('compliant'),
        issues: results[1]?.answer.match(/issue[s]?:([^.]+)/gi) || [],
        recommendations: results[1]?.answer.match(/recommend[s]?:([^.]+)/gi) || []
      } : null,
      building: checkTypes.includes('building') ? {
        compliant: results[2]?.answer.includes('compliant'),
        issues: results[2]?.answer.match(/issue[s]?:([^.]+)/gi) || [],
        recommendations: results[2]?.answer.match(/recommend[s]?:([^.]+)/gi) || []
      } : null
    };

    res.json({
      success: true,
      data: {
        floorPlanId,
        compliance,
        overallCompliant: Object.values(compliance).every(c => c === null || c.compliant),
        reportGeneratedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Compliance check error:', error);
    res.status(500).json({
      success: false,
      error: 'Compliance check failed'
    });
  }
});

/**
 * Get Material Estimates
 * POST /api/intelligent/estimate-materials
 * 
 * Estimate construction materials based on floor plan
 */
router.post('/estimate-materials', async (req: Request, res: Response) => {
  try {
    const { floorPlanId, projectId, materialTypes = ['drywall', 'flooring', 'paint'] } = req.body;

    if (!floorPlanId) {
      return res.status(400).json({
        success: false,
        error: 'Floor plan ID is required'
      });
    }

    const question = `Based on this floor plan, estimate the following materials needed for construction: ${materialTypes.join(', ')}. 
    Provide specific quantities with units.`;

    const result = await intelligentService.askAboutFloorPlan(
      floorPlanId,
      question,
      projectId
    );

    // Parse material estimates from response
    const materials: any[] = [];
    const lines = result.answer.split('\n');
    
    materialTypes.forEach(type => {
      const line = lines.find(l => l.toLowerCase().includes(type.toLowerCase()));
      if (line) {
        const match = line.match(/(\d+(?:\.\d+)?)\s*([\w\s]+)/);
        if (match) {
          materials.push({
            type,
            quantity: parseFloat(match[1]),
            unit: match[2].trim(),
            description: line
          });
        }
      }
    });

    res.json({
      success: true,
      data: {
        floorPlanId,
        estimates: materials,
        totalItems: materials.length,
        confidence: result.confidence,
        disclaimer: 'These are estimates only. Consult with contractors for accurate quantities.',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Material estimation error:', error);
    res.status(500).json({
      success: false,
      error: 'Material estimation failed'
    });
  }
});

/**
 * Batch Analysis
 * POST /api/intelligent/batch-analyze
 * 
 * Analyze multiple floor plans at once
 */
router.post('/batch-analyze', upload.array('floorPlans', 10), async (req: Request, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one floor plan image is required'
      });
    }

    const { projectId } = req.body;
    const results = [];

    for (const file of req.files) {
      try {
        const analysis = await intelligentService.analyzeFloorPlan(
          file.path,
          projectId,
          { 
            detectWalls: true,
            extractText: true,
            analyzeCompliance: false,
            generateInsights: false
          }
        );

        results.push({
          fileName: file.originalname,
          success: true,
          summary: {
            roomCount: analysis.analysis.roomCount,
            totalArea: analysis.analysis.totalArea,
            wallCount: analysis.walls.length
          }
        });
      } catch (error) {
        results.push({
          fileName: file.originalname,
          success: false,
          error: 'Analysis failed'
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalProcessed: req.files.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Batch analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Batch analysis failed'
    });
  }
});

export default router;