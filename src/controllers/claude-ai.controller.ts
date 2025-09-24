import { Request, Response, NextFunction } from 'express';
import { GPTVisionService } from '../services/ai/gpt-vision.service';
import { EnhancedOCRService } from '../services/enhanced-ocr.service';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/ai-processing/',
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|tiff|bmp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (ext && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  },
});

export class ClaudeAIController {
  private ragService: GPTVisionService;
  private ocrService: EnhancedOCRService;

  constructor() {
    this.ragService = new GPTVisionService();
    this.ocrService = new EnhancedOCRService();
  }

  // Query Claude with RAG context
  async query(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        query,
        useRAG = true,
        sessionId = uuidv4(),
        projectId,
        includeConstructionKnowledge = false,
      } = req.body;

      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }

      // Build context from various sources
      let enhancedQuery = query;
      
      if (includeConstructionKnowledge) {
        // const codes = await this.ragService.searchBuildingCodes(query);
        const codes = [];
        if (codes.length > 0) {
          enhancedQuery += '\n\nRelevant Building Codes:\n' + 
            codes.map(c => c.content).join('\n');
        }
      }

      // Execute query with context
      const response = await this.ragService.queryWithContext(enhancedQuery, {
        useRAG,
        sessionId,
      });

      res.json({
        success: true,
        response,
        sessionId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  // Analyze construction image with YOLO + OCR
  async analyzeImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Image file is required' });
        return;
      }

      const imagePath = req.file.path;
      const { query = 'Analyze this construction image', sessionId } = req.body;

      // Run YOLO detection
      const yoloAnalysis = await this.ragService.analyzeConstructionImage(imagePath);

      // Run OCR extraction
      const ocrResult = await this.ocrService.extractBlueprintText(imagePath);

      // Combine results for Claude
      const combinedContext = `
        Objects detected: ${yoloAnalysis.detections.map(d => d.class).join(', ')}
        
        Text extracted:
        - Title: ${ocrResult.title || 'Not found'}
        - Scale: ${ocrResult.scale || 'Not found'}
        - Rooms: ${ocrResult.rooms.join(', ')}
        - Measurements: ${ocrResult.measurements.join(', ')}
        
        YOLO Interpretation: ${yoloAnalysis.interpretation}
      `;

      // Get Claude's analysis
      const claudeResponse = await this.ragService.queryWithContext(
        `${query}\n\nImage Analysis Results:\n${combinedContext}`,
        { sessionId, useRAG: true }
      );

      res.json({
        success: true,
        analysis: {
          claude: claudeResponse,
          yolo: yoloAnalysis,
          ocr: ocrResult,
        },
        imagePath,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  // Process blueprint/floor plan with full pipeline
  async processBlueprint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Blueprint file is required' });
        return;
      }

      const filePath = req.file.path;
      const { projectId, extractMeasurements = true } = req.body;

      // Extract text from blueprint
      const blueprintText = await this.ocrService.extractBlueprintText(filePath);

      // Run YOLO for object detection
      const objectDetection = await this.ragService.analyzeConstructionImage(filePath);

      // Generate comprehensive analysis
      const analysisQuery = `
        Analyze this blueprint and provide:
        1. Summary of the floor plan layout
        2. Total square footage estimation based on measurements
        3. Room count and types
        4. Potential building code considerations
        5. Construction cost estimation range
        
        Blueprint data:
        ${JSON.stringify(blueprintText, null, 2)}
        
        Detected objects:
        ${objectDetection.detections.map(d => `${d.class} (${d.confidence})`).join(', ')}
      `;

      const analysis = await this.ragService.queryWithContext(analysisQuery, {
        useRAG: true,
        imagePath: filePath,
      });

      res.json({
        success: true,
        blueprint: {
          ...blueprintText,
          objectDetection: objectDetection.detections,
        },
        analysis,
        filePath,
        projectId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  // Add knowledge to RAG system
  async addKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, content, type, category, metadata } = req.body;

      if (!title || !content || !type) {
        res.status(400).json({ 
          error: 'Title, content, and type are required' 
        });
        return;
      }

      await this.ragService.storeDocument({
        title,
        content,
        type,
        metadata: {
          ...metadata,
          category,
          addedAt: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        message: 'Knowledge added successfully',
        document: { title, type, category },
      });
    } catch (error) {
      next(error);
    }
  }

  // Add construction-specific knowledge
  async addConstructionKnowledge(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { category, title, content, metadata } = req.body;

      if (!category || !title || !content) {
        res.status(400).json({
          error: 'Category, title, and content are required',
        });
        return;
      }

      await this.ragService.addConstructionKnowledge(
        category,
        title,
        content,
        metadata
      );

      res.json({
        success: true,
        message: 'Construction knowledge added successfully',
        knowledge: { category, title },
      });
    } catch (error) {
      next(error);
    }
  }

  // Search knowledge base
  async searchKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, limit = 5 } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const results = await this.ragService.retrieveRelevantDocuments(
        query as string,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        results,
        count: results.length,
      });
    } catch (error) {
      next(error);
    }
  }

  // Extract text from document
  async extractText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Document file is required' });
        return;
      }

      const filePath = req.file.path;
      const { enhanceQuality = false, detectLayout = false } = req.body;

      const result = await this.ocrService.extractText(filePath, {
        preprocessImage: true,
        enhanceQuality,
        detectLayout,
      });

      res.json({
        success: true,
        text: result.fullText,
        confidence: result.confidence,
        regions: result.regions,
        metadata: result.metadata,
      });
    } catch (error) {
      next(error);
    }
  }

  // Batch process multiple documents
  async batchProcess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'At least one file is required' });
        return;
      }

      const { processType = 'full' } = req.body;
      const results = [];

      for (const file of files) {
        let result: any = {
          filename: file.originalname,
          path: file.path,
        };

        try {
          if (processType === 'ocr' || processType === 'full') {
            result.ocr = await this.ocrService.extractBlueprintText(file.path);
          }

          if (processType === 'yolo' || processType === 'full') {
            result.yolo = await this.ragService.analyzeConstructionImage(file.path);
          }

          if (processType === 'full') {
            const query = `Analyze this document: ${result.ocr?.title || file.originalname}`;
            result.analysis = await this.ragService.queryWithContext(query, {
              imagePath: file.path,
              useRAG: true,
            });
          }

          result.success = true;
        } catch (error) {
          result.success = false;
          result.error = error instanceof Error ? error.message : 'Processing failed';
        }

        results.push(result);
      }

      res.json({
        success: true,
        processed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get upload middleware
  getUploadMiddleware() {
    return upload;
  }

  // Get batch upload middleware
  getBatchUploadMiddleware() {
    return upload.array('files', 10); // Max 10 files
  }
}

export default new ClaudeAIController();