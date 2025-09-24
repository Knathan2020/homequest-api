/**
 * Node.js Compatible Tesseract Service
 * Uses tesseract.js in a Node.js environment without browser dependencies
 */

import * as Tesseract from 'tesseract.js';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

export interface OCRResult {
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
  parsedData?: {
    rooms: Array<{
      text: string;
      bbox?: any;
    }>;
    dimensions: Array<{
      value: number;
      unit: string;
      x?: number;
      y?: number;
    }>;
  };
}

export class NodeTesseractService {
  private isInitialized: boolean = false;

  constructor() {
    console.log('📝 Node Tesseract Service initialized');
  }

  /**
   * Process image with OCR
   */
  async processImage(imageBuffer: Buffer): Promise<OCRResult> {
    try {
      console.log('🔍 Starting OCR processing...');
      
      // Save buffer to temp file (Tesseract works better with files)
      const tempPath = `/tmp/ocr_${Date.now()}.png`;
      
      // Preprocess image for better OCR
      const processedBuffer = await this.preprocessImage(imageBuffer);
      fs.writeFileSync(tempPath, processedBuffer);
      
      // Run Tesseract
      const result = await Tesseract.recognize(
        tempPath,
        'eng'
        // Removed logger to avoid serialization issues
      );
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }
      
      // Parse results
      const ocrResult = this.parseResults(result.data);
      
      console.log(`✅ OCR complete: ${ocrResult.words.length} words found`);
      
      return ocrResult;
    } catch (error) {
      console.error('❌ OCR processing error:', error);
      return {
        text: '',
        confidence: 0,
        words: [],
        parsedData: {
          rooms: [],
          dimensions: []
        }
      };
    }
  }

  /**
   * Preprocess image for better OCR
   */
  private async preprocessImage(buffer: Buffer): Promise<Buffer> {
    try {
      // Enhance image for OCR
      const processed = await sharp(buffer)
        .grayscale() // Convert to grayscale
        .normalize() // Enhance contrast
        .sharpen() // Sharpen text
        .threshold(128) // Binary threshold for cleaner text
        .toBuffer();
      
      return processed;
    } catch (error) {
      console.error('Image preprocessing error:', error);
      return buffer;
    }
  }

  /**
   * Parse Tesseract results
   */
  private parseResults(data: any): OCRResult {
    const words: Array<any> = [];
    const rooms: Array<any> = [];
    const dimensions: Array<any> = [];
    
    // Extract words with bounding boxes
    if (data.words) {
      data.words.forEach((word: any) => {
        if (word.text && word.confidence > 30) { // Filter low confidence
          words.push({
            text: word.text,
            confidence: word.confidence,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1
            }
          });
          
          // Detect room labels
          if (this.isRoomLabel(word.text)) {
            rooms.push({
              text: word.text,
              bbox: word.bbox
            });
          }
          
          // Detect dimensions
          const dimension = this.extractDimension(word.text);
          if (dimension) {
            dimensions.push({
              ...dimension,
              x: word.bbox.x0,
              y: word.bbox.y0
            });
          }
        }
      });
    }
    
    return {
      text: data.text || '',
      confidence: data.confidence || 0,
      words,
      parsedData: {
        rooms,
        dimensions
      }
    };
  }

  /**
   * Check if text is a room label
   */
  private isRoomLabel(text: string): boolean {
    const roomKeywords = [
      'bedroom', 'bed', 'br', 'bdrm', 'master',
      'bathroom', 'bath', 'ba', 'wc', 'toilet',
      'kitchen', 'kit', 'kitch',
      'living', 'lounge', 'family', 'great',
      'dining', 'din', 'dinning', 'breakfast',
      'office', 'study', 'den', 'library',
      'garage', 'gar', 'parking', 'carport',
      'closet', 'storage', 'stor', 'wic', 'pantry',
      'hallway', 'hall', 'corridor', 'passage',
      'foyer', 'entry', 'entrance', 'vestibule',
      'laundry', 'utility', 'mud', 'mudroom',
      'porch', 'deck', 'patio', 'balcony',
      'basement', 'attic', 'loft',
      'gym', 'exercise', 'workout',
      'media', 'theater', 'game'
    ];
    
    const lower = text.toLowerCase().trim();
    // Also check for common abbreviations and room numbers
    if (/^(br|ba|lr|dr|fr|mr|gr)\d?$/i.test(lower)) return true;
    if (/room|rm|space|area/i.test(lower)) return true;
    
    return roomKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * Extract dimension from text
   */
  private extractDimension(text: string): { value: number; unit: string } | null {
    // Match patterns like "12'6"", "3.5m", "150 sq ft"
    const patterns = [
      /(\d+)'(\d+)"?/,  // Feet and inches
      /(\d+\.?\d*)\s*(ft|feet|m|meter|cm|mm|in|inch)/i,
      /(\d+\.?\d*)\s*(sq\.?\s*ft|square\s*feet)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let value = 0;
        let unit = 'ft';
        
        if (match[0].includes("'")) {
          // Feet and inches
          value = parseFloat(match[1]) + (parseFloat(match[2] || '0') / 12);
          unit = 'ft';
        } else {
          value = parseFloat(match[1]);
          unit = match[2]?.toLowerCase() || 'ft';
        }
        
        if (!isNaN(value)) {
          return { value, unit };
        }
      }
    }
    
    return null;
  }
}

// Export for use in real-detection service
export default NodeTesseractService;