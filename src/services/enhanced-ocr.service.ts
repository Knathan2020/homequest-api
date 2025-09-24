import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import * as cv from '@techstark/opencv-js';
import path from 'path';
import fs from 'fs/promises';

interface OCROptions {
  language?: string;
  preprocessImage?: boolean;
  detectLayout?: boolean;
  enhanceQuality?: boolean;
}

interface TextRegion {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  type?: 'title' | 'paragraph' | 'label' | 'measurement' | 'annotation';
}

interface OCRResult {
  fullText: string;
  regions: TextRegion[];
  confidence: number;
  metadata: {
    processingTime: number;
    language: string;
    imageSize: { width: number; height: number };
  };
}

export class EnhancedOCRService {
  private worker: Tesseract.Worker | null = null;
  private scheduler: Tesseract.Scheduler;
  private initialized: boolean = false;

  constructor() {
    this.scheduler = Tesseract.createScheduler();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const workerGen = async () => {
      const worker = await Tesseract.createWorker('eng');
      await worker.reinitialize('eng');
      return worker;
    };

    // Create multiple workers for parallel processing
    const workerPool = await Promise.all([
      workerGen(),
      workerGen(),
      workerGen(),
    ]);

    workerPool.forEach(worker => this.scheduler.addWorker(worker));
    this.worker = workerPool[0];
    this.initialized = true;
  }

  async extractText(
    imagePath: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    await this.initialize();
    const startTime = Date.now();

    let processedImagePath = imagePath;

    // Preprocess image if needed
    if (options.preprocessImage || options.enhanceQuality) {
      processedImagePath = await this.preprocessImage(imagePath, options);
    }

    // Detect layout if needed
    const layoutRegions = options.detectLayout 
      ? await this.detectTextLayout(processedImagePath)
      : null;

    // Perform OCR
    const result = await this.scheduler.addJob('recognize', processedImagePath, {
      lang: options.language || 'eng',
      tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD,
    });

    // Process regions
    const regions = await this.processTextRegions(result, layoutRegions);

    // Classify text types
    const classifiedRegions = this.classifyTextRegions(regions);

    const processingTime = Date.now() - startTime;

    // Get image metadata
    const imageMetadata = await sharp(processedImagePath).metadata();

    return {
      fullText: result.data.text,
      regions: classifiedRegions,
      confidence: result.data.confidence,
      metadata: {
        processingTime,
        language: options.language || 'eng',
        imageSize: {
          width: imageMetadata.width || 0,
          height: imageMetadata.height || 0,
        },
      },
    };
  }

  private async preprocessImage(
    imagePath: string,
    options: OCROptions
  ): Promise<string> {
    const outputPath = path.join(
      path.dirname(imagePath),
      `preprocessed_${path.basename(imagePath)}`
    );

    // Load and process image with sharp
    let pipeline = sharp(imagePath);

    if (options.enhanceQuality) {
      pipeline = pipeline
        .grayscale()
        .normalize()
        .sharpen()
        .threshold(128)
        .median(3);
    } else {
      pipeline = pipeline.grayscale();
    }

    await pipeline.toFile(outputPath);

    // Additional OpenCV processing for better OCR
    if (options.enhanceQuality) {
      await this.enhanceWithOpenCV(outputPath);
    }

    return outputPath;
  }

  private async enhanceWithOpenCV(imagePath: string): Promise<void> {
    // Read image
    const imageBuffer = await fs.readFile(imagePath);
    const mat = cv.imdecode(new Uint8Array(imageBuffer));

    // Apply image enhancement
    const enhanced = new cv.Mat();
    
    // Denoise
    cv.fastNlMeansDenoising(mat, enhanced, 30, 7, 21);
    
    // Adaptive threshold for better text extraction
    const binary = new cv.Mat();
    cv.adaptiveThreshold(
      enhanced,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      11,
      2
    );

    // Morphological operations to clean up text
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 1));
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

    // Save enhanced image
    const buffer = cv.imencode('.png', binary);
    await fs.writeFile(imagePath, buffer);

    // Cleanup
    mat.delete();
    enhanced.delete();
    binary.delete();
    kernel.delete();
  }

  private async detectTextLayout(imagePath: string): Promise<any[]> {
    // Use OpenCV to detect text regions
    const imageBuffer = await fs.readFile(imagePath);
    const mat = cv.imdecode(new Uint8Array(imageBuffer));

    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

    // Detect edges
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const regions = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const rect = cv.boundingRect(contour);
      
      // Filter out very small regions
      if (rect.width > 20 && rect.height > 10) {
        regions.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    // Cleanup
    mat.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return regions;
  }

  private async processTextRegions(
    ocrResult: any,
    layoutRegions: any[] | null
  ): Promise<TextRegion[]> {
    const regions: TextRegion[] = [];

    // Process words from OCR
    for (const word of ocrResult.data.words) {
      regions.push({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        },
      });
    }

    // Merge adjacent words into lines
    const lines = this.mergeWordsIntoLines(regions);

    return lines;
  }

  private mergeWordsIntoLines(words: TextRegion[]): TextRegion[] {
    const lines: TextRegion[] = [];
    const sorted = [...words].sort((a, b) => {
      // Sort by y position, then x
      const yDiff = a.bbox.y0 - b.bbox.y0;
      if (Math.abs(yDiff) > 10) return yDiff;
      return a.bbox.x0 - b.bbox.x0;
    });

    let currentLine: TextRegion | null = null;
    const lineHeight = 20; // Threshold for same line

    for (const word of sorted) {
      if (!currentLine || 
          Math.abs(word.bbox.y0 - currentLine.bbox.y0) > lineHeight) {
        // Start new line
        if (currentLine) lines.push(currentLine);
        currentLine = { ...word };
      } else {
        // Merge with current line
        currentLine.text += ' ' + word.text;
        currentLine.bbox.x1 = Math.max(currentLine.bbox.x1, word.bbox.x1);
        currentLine.bbox.y1 = Math.max(currentLine.bbox.y1, word.bbox.y1);
        currentLine.confidence = (currentLine.confidence + word.confidence) / 2;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private classifyTextRegions(regions: TextRegion[]): TextRegion[] {
    return regions.map(region => {
      const classified = { ...region };
      const text = region.text.toLowerCase();

      // Classify based on content patterns
      if (/^\d+['"]?\s*x\s*\d+['"]?/.test(text)) {
        classified.type = 'measurement';
      } else if (/^(bedroom|bathroom|kitchen|living|garage|closet)/i.test(text)) {
        classified.type = 'label';
      } else if (region.bbox.y1 - region.bbox.y0 > 30) {
        classified.type = 'title';
      } else if (text.length > 50) {
        classified.type = 'paragraph';
      } else {
        classified.type = 'annotation';
      }

      return classified;
    });
  }

  async extractMeasurements(imagePath: string): Promise<string[]> {
    const result = await this.extractText(imagePath, {
      preprocessImage: true,
      detectLayout: true,
    });

    const measurements = result.regions
      .filter(r => r.type === 'measurement')
      .map(r => r.text);

    // Also search for measurements in full text
    const measurementPattern = /\d+['"]?\s*x\s*\d+['"]?|\d+\s*(ft|feet|m|meters?|cm|mm)/gi;
    const additionalMeasurements = result.fullText.match(measurementPattern) || [];

    return [...new Set([...measurements, ...additionalMeasurements])];
  }

  async extractRoomLabels(imagePath: string): Promise<string[]> {
    const result = await this.extractText(imagePath, {
      preprocessImage: true,
      detectLayout: true,
    });

    const roomKeywords = [
      'bedroom', 'bathroom', 'kitchen', 'living', 'dining',
      'garage', 'closet', 'office', 'laundry', 'pantry',
      'master', 'guest', 'den', 'foyer', 'hallway', 'porch',
      'deck', 'patio', 'basement', 'attic', 'utility'
    ];

    const rooms = result.regions
      .filter(r => {
        const text = r.text.toLowerCase();
        return roomKeywords.some(keyword => text.includes(keyword));
      })
      .map(r => r.text);

    return [...new Set(rooms)];
  }

  async extractBlueprintText(imagePath: string): Promise<{
    title?: string;
    scale?: string;
    measurements: string[];
    rooms: string[];
    annotations: string[];
  }> {
    const result = await this.extractText(imagePath, {
      preprocessImage: true,
      detectLayout: true,
      enhanceQuality: true,
    });

    // Find title (usually largest text at top)
    const title = result.regions
      .filter(r => r.type === 'title')
      .sort((a, b) => b.bbox.y1 - b.bbox.y0 - (a.bbox.y1 - a.bbox.y0))[0]?.text;

    // Find scale notation
    const scalePattern = /scale[:\s]+1[:\s]+\d+|1['"]?\s*=\s*\d+['"]?/i;
    const scaleMatch = result.fullText.match(scalePattern);
    const scale = scaleMatch ? scaleMatch[0] : undefined;

    // Extract measurements
    const measurements = await this.extractMeasurements(imagePath);

    // Extract rooms
    const rooms = await this.extractRoomLabels(imagePath);

    // Get annotations (other labeled text)
    const annotations = result.regions
      .filter(r => r.type === 'annotation')
      .map(r => r.text);

    return {
      title,
      scale,
      measurements,
      rooms,
      annotations,
    };
  }

  async cleanup(): Promise<void> {
    if (this.scheduler) {
      await this.scheduler.terminate();
    }
  }
}