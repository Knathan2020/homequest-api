// ========================================
// TESSERACT OCR SERVICE - tesseract.service.ts
// Primary OCR engine for extracting text from floor plans
// ========================================

import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { PreprocessingService } from './preprocessing.service';
import { TextParserService } from './text-parser.service';
import path from 'path';

interface OCROptions {
  language?: string;
  oem?: number; // OCR Engine Mode
  psm?: number; // Page Segmentation Mode
  preserve_interword_spaces?: string;
  tessedit_char_whitelist?: string;
  tessjs_create_pdf?: string;
}

interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
  lines: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
  blocks: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
  metadata: {
    processingTime: number;
    imageSize: { width: number; height: number };
    language: string;
  };
}

export class TesseractService {
  private preprocessingService: PreprocessingService;
  private textParserService: TextParserService;
  private scheduler: Tesseract.Scheduler;
  private workerPool: Tesseract.Worker[] = [];
  private maxWorkers: number = 4;
  private isInitialized: boolean = false;

  constructor() {
    this.preprocessingService = new PreprocessingService();
    this.textParserService = new TextParserService();
    this.scheduler = Tesseract.createScheduler();
  }

  /**
   * Initialize OCR worker pool for better performance
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🚀 Initializing Tesseract OCR workers...');
    
    try {
      // Create worker pool for parallel processing
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = await Tesseract.createWorker('eng', 1, {
          cacheMethod: 'readOnly',
          gzip: true,
          workerPath: path.join(process.cwd(), 'node_modules/tesseract.js/dist/worker.min.js'),
          langPath: path.join(process.cwd(), 'tessdata'),
          corePath: path.join(process.cwd(), 'node_modules/tesseract.js-core/tesseract-core.wasm.js')
        });

        // Load languages (English + support for technical drawings)
        await (worker as any).loadLanguage('eng');
        await (worker as any).initialize('eng');
        
        // Configure for architectural drawings
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,\'-"°×÷±²³√()[]{}/<>:;',
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD as any
        });

        this.scheduler.addWorker(worker);
        this.workerPool.push(worker);
      }

      this.isInitialized = true;
      console.log(`✅ Tesseract initialized with ${this.maxWorkers} workers`);
    } catch (error) {
      console.error('❌ Failed to initialize Tesseract:', error);
      throw error;
    }
  }

  /**
   * Process a single image with OCR
   */
  async processImage(
    imageBuffer: Buffer,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      // Ensure service is initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Preprocess the image for better OCR accuracy
      console.log('🔧 Preprocessing image...');
      const preprocessedBuffer = await this.preprocessingService.preprocessForOCR(imageBuffer);

      // Get image metadata
      const metadata = await sharp(preprocessedBuffer).metadata();

      // Perform OCR
      console.log('📖 Running OCR...');
      const result = await this.scheduler.addJob('recognize', preprocessedBuffer, {
        ...options,
        rectangle: options.psm ? undefined : { left: 0, top: 0, width: metadata.width!, height: metadata.height! }
      });

      // Process OCR results
      const ocrResult = this.processOCRData(result.data, {
        processingTime: Date.now() - startTime,
        imageSize: { width: metadata.width || 0, height: metadata.height || 0 },
        language: options.language || 'eng'
      });

      console.log(`✅ OCR completed in ${ocrResult.metadata.processingTime}ms`);
      
      return ocrResult;
    } catch (error) {
      console.error('❌ OCR processing failed:', error);
      throw error;
    }
  }

  /**
   * Process multiple regions of an image (for targeted OCR)
   */
  async processImageRegions(
    imageBuffer: Buffer,
    regions: Array<{ x: number; y: number; width: number; height: number; label?: string }>
  ): Promise<Array<{ region: any; result: OCRResult }>> {
    const results = [];

    for (const region of regions) {
      console.log(`🔍 Processing region: ${region.label || 'unnamed'}`);
      
      // Extract region from image
      const regionBuffer = await sharp(imageBuffer)
        .extract({
          left: region.x,
          top: region.y,
          width: region.width,
          height: region.height
        })
        .toBuffer();

      // Process region
      const result = await this.processImage(regionBuffer);
      
      results.push({
        region: { ...region },
        result
      });
    }

    return results;
  }

  /**
   * Process floor plan specific OCR (optimized for architectural drawings)
   */
  async processFloorPlan(imageBuffer: Buffer): Promise<{
    rawText: string;
    structuredData: any;
    regions: any[];
  }> {
    console.log('🏗️ Processing floor plan with optimized settings...');

    // Step 1: Preprocess specifically for floor plans
    const preprocessedBuffer = await this.preprocessingService.preprocessFloorPlan(imageBuffer);

    // Step 2: Detect text regions
    const regions = await this.detectTextRegions(preprocessedBuffer);

    // Step 3: Process each region
    const regionResults = await this.processImageRegions(preprocessedBuffer, regions);

    // Step 4: Run full page OCR
    const fullPageResult = await this.processImage(preprocessedBuffer, {
      psm: 11, // Sparse text mode for floor plans
      preserve_interword_spaces: '1'
    });

    // Step 5: Parse and structure the extracted text
    const structuredData = await this.textParserService.parseFloorPlanText(
      fullPageResult.text,
      regionResults
    );

    return {
      rawText: fullPageResult.text,
      structuredData,
      regions: regionResults
    };
  }

  /**
   * Process OCR data into structured format
   */
  private processOCRData(data: any, metadata: any): OCRResult {
    const words = data.words.map((word: any) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: {
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1
      }
    }));

    const lines = data.lines.map((line: any) => ({
      text: line.text,
      confidence: line.confidence,
      bbox: {
        x0: line.bbox.x0,
        y0: line.bbox.y0,
        x1: line.bbox.x1,
        y1: line.bbox.y1
      }
    }));

    const blocks = data.blocks ? data.blocks.map((block: any) => ({
      text: block.text,
      confidence: block.confidence,
      bbox: {
        x0: block.bbox.x0,
        y0: block.bbox.y0,
        x1: block.bbox.x1,
        y1: block.bbox.y1
      }
    })) : [];

    return {
      text: data.text,
      confidence: data.confidence,
      words,
      lines,
      blocks,
      metadata
    };
  }

  /**
   * Detect text regions in floor plan images
   */
  private async detectTextRegions(imageBuffer: Buffer): Promise<Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  }>> {
    // This would use computer vision to detect text regions
    // For now, returning common floor plan text regions
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    return [
      // Title block (usually bottom right)
      {
        x: Math.floor(width * 0.6),
        y: Math.floor(height * 0.7),
        width: Math.floor(width * 0.35),
        height: Math.floor(height * 0.25),
        label: 'title_block'
      },
      // Legend (usually left side)
      {
        x: 10,
        y: Math.floor(height * 0.1),
        width: Math.floor(width * 0.2),
        height: Math.floor(height * 0.3),
        label: 'legend'
      },
      // Scale indicator
      {
        x: Math.floor(width * 0.4),
        y: Math.floor(height * 0.85),
        width: Math.floor(width * 0.2),
        height: 50,
        label: 'scale'
      },
      // Room labels (center area)
      {
        x: Math.floor(width * 0.2),
        y: Math.floor(height * 0.2),
        width: Math.floor(width * 0.6),
        height: Math.floor(height * 0.5),
        label: 'rooms'
      }
    ];
  }

  /**
   * Extract text from PDF pages
   */
  async processPDF(_pdfBuffer: Buffer): Promise<Array<{
    page: number;
    text: string;
    structuredData: any;
  }>> {
    // Convert PDF to images using pdf2pic or similar
    // Then process each page with OCR
    // This is a placeholder - implement with pdf2pic
    
    console.log('📄 Processing PDF document...');
    const results: Array<{page: number; text: string; structuredData: any}> = [];
    
    // Implementation would go here
    // For now, returning empty array
    
    return results;
  }

  /**
   * Batch process multiple images
   */
  async batchProcess(
    imageBuffers: Buffer[],
    options: OCROptions = {}
  ): Promise<OCRResult[]> {
    console.log(`📚 Batch processing ${imageBuffers.length} images...`);
    
    const results: OCRResult[] = await Promise.all(
      imageBuffers.map(buffer => this.processImage(buffer, options))
    );
    
    return results;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Tesseract workers...');
    
    for (const worker of this.workerPool) {
      await worker.terminate();
    }
    
    this.workerPool = [];
    this.isInitialized = false;
    
    console.log('✅ Cleanup complete');
  }

  /**
   * Get OCR statistics and health
   */
  getStats(): {
    initialized: boolean;
    workers: number;
    scheduler: boolean;
  } {
    return {
      initialized: this.isInitialized,
      workers: this.workerPool.length,
      scheduler: !!this.scheduler
    };
  }
}

// Export singleton instance
export const tesseractService = new TesseractService();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
// In your floor plan processing route:

import { tesseractService } from './services/tesseract.service';

// Initialize once at startup
await tesseractService.initialize();

// Process a floor plan image
const floorPlanData = await tesseractService.processFloorPlan(imageBuffer);

// Access structured data
console.log('Rooms:', floorPlanData.structuredData.rooms);
console.log('Dimensions:', floorPlanData.structuredData.dimensions);
console.log('Title:', floorPlanData.structuredData.title);

// Cleanup when shutting down
process.on('SIGINT', async () => {
  await tesseractService.cleanup();
  process.exit(0);
});
*/