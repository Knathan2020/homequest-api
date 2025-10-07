import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AutodeskForgeService from '../services/autodesk-forge.service';
import CADProcessorService from '../services/cad/cad-processor.service';
import { AutoCADParserService } from '../services/cad/autocad-parser.service';
import { RealDetectionService } from '../services/real-detection.service';
import CloudConvertService from '../services/cloudconvert.service';
import DesignAutomationService from '../services/design-automation.service';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10
  },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = [
      '.jpg', '.jpeg', '.png', '.webp', '.tiff',
      '.pdf', '.dwg', '.dxf', '.skp', '.rvt',
      '.ifc', '.nwd', '.3dm', '.obj', '.fbx'
    ];

    const fileExtension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];

    if (fileExtension && allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Supported: ${allowedExtensions.join(', ')}`));
    }
  }
});

// Initialize services
const autodeskService = AutodeskForgeService; // Already instantiated
const cadProcessor = new CADProcessorService();
const autoCADParser = new AutoCADParserService();
const detectionService = new RealDetectionService();

/**
 * @route   POST /api/cad/upload
 * @desc    Upload and process CAD files with 2D/3D support
 * @access  Public
 */
router.post('/upload', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const useAutodesk = req.body.use3D !== 'false'; // Default to true

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    console.log(`\n📤 Processing ${files.length} file(s) [Autodesk 3D: ${useAutodesk}]`);

    const results = [];

    for (const file of files) {
      console.log(`\n🔄 Processing: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      const fileExtension = path.extname(file.originalname).toLowerCase();
      let result: any;

      try {
        // Determine processing method
        if (useAutodesk && ['.dwg', '.rvt', '.skp', '.ifc', '.nwd'].includes(fileExtension)) {
          // Use Autodesk for 3D CAD files
          console.log('🌐 Using Autodesk 3D processing...');

          // For DWG files, convert 2D to 3D first using Design Automation
          let processedBuffer = file.buffer;
          if (fileExtension === '.dwg') {
            console.log('🏗️ Converting 2D DWG to 3D using AutoCAD Design Automation...');
            try {
              processedBuffer = await DesignAutomationService.convert2DTo3D(file.buffer, file.originalname);
              console.log('✅ 2D to 3D conversion complete, now processing with Forge...');
            } catch (error: any) {
              console.warn('⚠️ Design Automation failed, continuing with original file:', error.message);
            }
          }

          const autodeskResult = await autodeskService.processCADFile(processedBuffer, file.originalname);

          result = {
            fileName: file.originalname,
            fileType: fileExtension.substring(1),
            fileSize: file.size,
            success: autodeskResult.success,
            processingMethod: 'autodesk-3d',
            urn: autodeskResult.urn, // Add URN at top level for frontend
            viewerUrl: autodeskResult.viewerUrl,
            data: {
              urn: autodeskResult.urn,
              viewerUrl: autodeskResult.viewerUrl,
              walls: autodeskResult.floorplanData?.walls || [],
              doors: autodeskResult.floorplanData?.doors || [],
              windows: autodeskResult.floorplanData?.windows || [],
              stairs: autodeskResult.floorplanData?.stairs || [],
              rooms: autodeskResult.floorplanData?.rooms || [],
              textLabels: autodeskResult.floorplanData?.textLabels || [],
              measurements: autodeskResult.floorplanData?.measurements || {},
              metadata: autodeskResult.metadata,
              supports3D: true
            },
            error: autodeskResult.error
          };

        } else if (fileExtension === '.dxf') {
          // Use local DXF parser for 2D
          console.log('📐 Using local DXF parser...');

          const tempDir = path.join(process.cwd(), 'temp-cad-files');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const tempFilePath = path.join(tempDir, `${Date.now()}_${file.originalname}`);
          fs.writeFileSync(tempFilePath, file.buffer);

          const dxfData = await autoCADParser.parseDXF(tempFilePath);

          // Clean up temp file
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }

          result = {
            fileName: file.originalname,
            fileType: 'dxf',
            fileSize: file.size,
            success: true,
            processingMethod: 'local-dxf-parser',
            data: {
              walls: dxfData.walls,
              doors: dxfData.doors,
              windows: dxfData.windows,
              stairs: dxfData.stairs,
              rooms: dxfData.rooms.map(room => ({
                ...room,
                measurements: {
                  area: room.area,
                  perimeter: calculatePerimeter(room.boundary),
                  dimensions: calculateRoomDimensions(room.boundary)
                }
              })),
              dimensions: dxfData.dimensions,
              textLabels: dxfData.textLabels,
              metadata: dxfData.metadata,
              supports3D: false
            }
          };

        } else if (fileExtension === '.pdf') {
          // PDF processing - Convert to DWG first, then process with Autodesk
          console.log('📄 Processing PDF: Converting to DWG for data extraction...');

          try {
            // Step 1: Convert PDF to DWG
            const dwgBuffer = await CloudConvertService.convertPdfToDwg(file.buffer, file.originalname);
            const dwgFileName = file.originalname.replace('.pdf', '.dwg');

            // Step 2: Process DWG with Autodesk to extract CAD data
            console.log('🔧 Processing converted DWG with Autodesk...');
            const autodeskResult = await autodeskService.processCADFile(dwgBuffer, dwgFileName);

            result = {
              fileName: file.originalname,
              fileType: 'pdf',
              fileSize: file.size,
              success: autodeskResult.success,
              processingMethod: 'cloudconvert-dwg-autodesk',
              urn: autodeskResult.urn,
              viewerUrl: autodeskResult.viewerUrl,
              data: {
                walls: autodeskResult.floorplanData?.walls || [],
                doors: autodeskResult.floorplanData?.doors || [],
                windows: autodeskResult.floorplanData?.windows || [],
                stairs: autodeskResult.floorplanData?.stairs || [],
                rooms: autodeskResult.floorplanData?.rooms || [],
                textLabels: autodeskResult.floorplanData?.textLabels || [],
                metadata: autodeskResult.metadata || {},
                supports3D: true
              },
              translationStatus: autodeskResult.status,
              error: autodeskResult.error
            };

          } catch (error: any) {
            console.error('❌ PDF to DWG conversion failed:', error.message);
            result = {
              fileName: file.originalname,
              fileType: 'pdf',
              fileSize: file.size,
              success: false,
              processingMethod: 'cloudconvert-dwg-autodesk',
              urn: '',
              data: {
                walls: [],
                doors: [],
                windows: [],
                stairs: [],
                rooms: [],
                metadata: {},
                supports3D: false
              },
              translationStatus: 'failed',
              error: `PDF conversion failed: ${error.message}`
            };
          }

        } else if (['.jpg', '.jpeg', '.png', '.webp', '.tiff'].includes(fileExtension)) {
          // Image processing - AI detection
          console.log('🖼️ Processing image file...');

          const tempDir = path.join(process.cwd(), 'temp-cad-files');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const tempFilePath = path.join(tempDir, `${Date.now()}_${file.originalname}`);
          fs.writeFileSync(tempFilePath, file.buffer);

          const detectionResult = await detectionService.detectFloorPlan(tempFilePath);

          // Clean up temp file
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }

          result = {
            fileName: file.originalname,
            fileType: 'image',
            fileSize: file.size,
            success: true,
            processingMethod: 'ai-detection',
            data: {
              walls: detectionResult.walls || [],
              doors: detectionResult.doors || [],
              windows: detectionResult.windows || [],
              rooms: detectionResult.rooms || [],
              measurements: detectionResult.measurements || {},
              dimensions: detectionResult.measurements?.dimensions || {},
              supports3D: false
            }
          };

        } else {
          // Unsupported file type
          result = {
            fileName: file.originalname,
            fileType: fileExtension.substring(1),
            fileSize: file.size,
            success: false,
            processingMethod: 'none',
            error: 'File type not supported. Supported: .dxf, .dwg, .rvt, .skp, .pdf, .jpg, .png'
          };
        }

        results.push(result);

      } catch (fileError: any) {
        console.error(`❌ Error processing ${file.originalname}:`, fileError);
        results.push({
          fileName: file.originalname,
          fileType: fileExtension.substring(1),
          fileSize: file.size,
          success: false,
          error: fileError.message || 'Processing failed'
        });
      }
    }

    console.log(`\n✅ Completed processing ${results.length} file(s)\n`);

    return res.status(200).json({
      success: true,
      message: `Processed ${results.length} file(s)`,
      results,
      summary: {
        total: results.length,
        successful: results.filter((r: any) => r.success).length,
        failed: results.filter((r: any) => !r.success).length
      }
    });

  } catch (error: any) {
    console.error('❌ Upload processing error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error processing files'
    });
  }
});

/**
 * @route   POST /api/cad/upload-3d
 * @desc    Upload CAD file and get 3D viewer URL (Autodesk only)
 * @access  Public
 */
router.post('/upload-3d', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    console.log(`\n🌐 3D Upload: ${file.originalname}`);

    const result = await autodeskService.processCADFile(file.buffer, file.originalname);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Processing failed'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        fileName: file.originalname,
        urn: result.urn,
        viewerUrl: result.viewerUrl,
        floorplanData: result.floorplanData,
        metadata: result.metadata
      }
    });

  } catch (error: any) {
    console.error('❌ 3D upload error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process 3D file'
    });
  }
});

/**
 * @route   POST /api/cad/parse-dxf
 * @desc    Parse DXF file locally and extract all floorplan data
 * @access  Public
 */
router.post('/parse-dxf', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const tempDir = path.join(process.cwd(), 'temp-cad-files');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `${Date.now()}_${file.originalname}`);
    fs.writeFileSync(tempFilePath, file.buffer);

    try {
      const dxfData = await autoCADParser.parseDXF(tempFilePath);

      const roomsWithMeasurements = dxfData.rooms.map(room => ({
        ...room,
        measurements: {
          area: room.area || 0,
          perimeter: calculatePerimeter(room.boundary),
          dimensions: calculateRoomDimensions(room.boundary)
        }
      }));

      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      return res.status(200).json({
        success: true,
        data: {
          fileName: file.originalname,
          walls: dxfData.walls,
          doors: dxfData.doors,
          windows: dxfData.windows,
          stairs: dxfData.stairs,
          rooms: roomsWithMeasurements,
          dimensions: dxfData.dimensions,
          textLabels: dxfData.textLabels,
          metadata: dxfData.metadata,
          summary: {
            totalWalls: dxfData.walls.length,
            totalDoors: dxfData.doors.length,
            totalWindows: dxfData.windows.length,
            totalStairs: dxfData.stairs.length,
            totalRooms: dxfData.rooms.length,
            layers: dxfData.metadata.layers,
            units: dxfData.metadata.units,
            bounds: dxfData.metadata.bounds
          }
        }
      });

    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }

  } catch (error: any) {
    console.error('❌ DXF parsing error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse DXF file'
    });
  }
});

/**
 * @route   GET /api/cad/status/:urn
 * @desc    Check Autodesk translation status
 * @access  Public
 */
router.get('/status/:urn', async (req: Request, res: Response) => {
  try {
    const { urn } = req.params;

    const status = await autodeskService.getTranslationStatus(urn);

    return res.status(200).json({
      success: true,
      data: status
    });

  } catch (error: any) {
    console.error('❌ Status check error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check status'
    });
  }
});

/**
 * @route   GET /api/cad/supported-formats
 * @desc    Get list of all supported file formats
 * @access  Public
 */
router.get('/supported-formats', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    formats: {
      '3d-cad': {
        extensions: ['.dwg', '.rvt', '.skp', '.ifc', '.nwd'],
        description: 'Full 3D CAD & BIM files (via Autodesk)',
        features: ['3D Viewer', 'Walls', 'Doors', 'Windows', 'Stairs', 'Rooms', 'Measurements', 'BIM Properties']
      },
      '2d-cad': {
        extensions: ['.dxf'],
        description: '2D CAD files (local parsing)',
        features: ['Walls', 'Doors', 'Windows', 'Stairs', 'Rooms', 'Dimensions', 'Measurements', 'Layers', 'Text Labels']
      },
      'documents': {
        extensions: ['.pdf'],
        description: 'PDF architectural drawings',
        features: ['Conversion', 'Multi-page support']
      },
      'images': {
        extensions: ['.jpg', '.png', '.webp', '.tiff'],
        description: 'Floorplan images',
        features: ['AI Detection (future)']
      }
    },
    limits: {
      maxFileSize: '100MB',
      maxFiles: 10,
      supportedTotal: 14
    },
    endpoints: {
      upload: 'POST /api/cad/upload - Upload multiple files (auto-detect format)',
      upload3d: 'POST /api/cad/upload-3d - Upload single file for 3D viewing',
      parseDxf: 'POST /api/cad/parse-dxf - Parse DXF locally',
      status: 'GET /api/cad/status/:urn - Check Autodesk translation status',
      formats: 'GET /api/cad/supported-formats - This endpoint'
    }
  });
});

/**
 * @route   GET /api/cad/health
 * @desc    Health check for CAD API
 * @access  Public
 */
router.get('/health', (_req: Request, res: Response) => {
  const hasAutodeskCreds = !!(process.env.AUTODESK_CLIENT_ID && process.env.AUTODESK_CLIENT_SECRET);

  return res.status(200).json({
    success: true,
    status: 'operational',
    services: {
      autodesk3D: hasAutodeskCreds ? 'configured' : 'not-configured',
      localDxfParser: 'available',
      cadProcessor: 'available'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/cad/get-token
 * @desc    Get Autodesk viewer token for frontend
 * @access  Public
 */
router.get('/get-token', async (_req: Request, res: Response) => {
  try {
    // Use the private method to get token (TypeScript workaround)
    const token = await (autodeskService as any).getAccessToken();

    return res.status(200).json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600
    });
  } catch (error: any) {
    console.error('❌ Failed to get token:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get access token'
    });
  }
});

/**
 * @route   GET /api/cad/viewables/:urn
 * @desc    Get all available layouts/sheets from a DWG file
 * @access  Public
 */
router.get('/viewables/:urn', async (req: Request, res: Response) => {
  try {
    const { urn } = req.params;

    if (!urn) {
      return res.status(400).json({
        success: false,
        error: 'URN is required'
      });
    }

    console.log(`📋 Getting viewables for URN: ${urn}`);

    const viewables = await (autodeskService as any).getModelViewables(urn);

    return res.status(200).json({
      success: true,
      viewables,
      count: viewables.length
    });

  } catch (error: any) {
    console.error('❌ Failed to get viewables:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get viewables'
    });
  }
});

// Helper functions
function calculatePerimeter(boundary: Array<{ x: number; y: number }>): number {
  let perimeter = 0;
  for (let i = 0; i < boundary.length; i++) {
    const current = boundary[i];
    const next = boundary[(i + 1) % boundary.length];
    perimeter += Math.sqrt(
      Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)
    );
  }
  return perimeter;
}

function calculateRoomDimensions(boundary: Array<{ x: number; y: number }>): { width: number; height: number } {
  const xs = boundary.map(p => p.x);
  const ys = boundary.map(p => p.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

export default router;
