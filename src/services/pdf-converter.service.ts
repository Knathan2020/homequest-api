/**
 * PDF to Image Conversion Service
 * Converts PDF floor plans to images for processing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fromPath } from 'pdf2pic';
import pdfParse from 'pdf-parse';

export class PDFConverterService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(__dirname, '../../uploads', 'floor-plans');
  }

  /**
   * Convert PDF to PNG images
   * @param pdfPath Path to the PDF file
   * @param outputPath Optional output directory
   * @returns Array of image paths
   */
  async convertToImages(pdfPath: string, outputPath?: string): Promise<string[]> {
    try {
      console.log('🔄 Converting PDF to images:', pdfPath);
      
      // Ensure the PDF file exists
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }

      // Get PDF info first
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfInfo = await pdfParse(pdfBuffer);
      console.log(`📄 PDF has ${pdfInfo.numpages} pages`);

      // Set up output directory
      const outputDir = outputPath || path.dirname(pdfPath);
      const baseFileName = path.basename(pdfPath, '.pdf');
      
      // Configure pdf2pic options
      const options = {
        density: 200,           // DPI for better quality
        saveFilename: baseFileName,
        savePath: outputDir,
        format: 'png',
        width: 2048,           // Max width for good quality
        height: 2048,          // Max height for good quality
        preserveAspectRatio: true,
        page: -1               // Convert all pages
      };

      // Create converter instance
      const converter = fromPath(pdfPath, options);
      
      // Convert pages
      const imagePaths: string[] = [];
      
      // Convert all pages
      for (let i = 1; i <= pdfInfo.numpages; i++) {
        try {
          console.log(`📄 Converting page ${i}/${pdfInfo.numpages}...`);
          const result = await converter(i, { responseType: 'image' });
          
          if (result.path) {
            imagePaths.push(result.path);
            console.log(`✅ Page ${i} converted: ${result.path}`);
          }
        } catch (pageError) {
          console.error(`❌ Error converting page ${i}:`, pageError);
          // Continue with other pages even if one fails
        }
      }

      if (imagePaths.length === 0) {
        throw new Error('No pages could be converted from PDF');
      }

      console.log(`✅ PDF conversion complete. Generated ${imagePaths.length} images`);
      return imagePaths;
      
    } catch (error) {
      console.error('❌ PDF conversion error:', error);
      throw new Error(`Failed to convert PDF: ${error.message}`);
    }
  }

  /**
   * Convert PDF and return the first page as the primary floor plan
   * @param pdfPath Path to the PDF file
   * @returns Path to the converted image
   */
  async convertFirstPage(pdfPath: string): Promise<string> {
    try {
      console.log('🔄 Converting first page of PDF:', pdfPath);
      
      // Ensure the PDF file exists
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }

      // Set up output directory
      const outputDir = path.dirname(pdfPath);
      const baseFileName = path.basename(pdfPath, '.pdf');
      
      // Configure pdf2pic options for single page
      const options = {
        density: 200,           // DPI for better quality
        saveFilename: `${baseFileName}_converted`,
        savePath: outputDir,
        format: 'png',
        width: 2048,           // Max width for good quality
        height: 2048,          // Max height for good quality
        preserveAspectRatio: true
      };

      // Create converter instance
      const converter = fromPath(pdfPath, options);
      
      // Convert first page only
      const result = await converter(1, { responseType: 'image' });
      
      if (!result.path) {
        throw new Error('Failed to convert PDF page to image');
      }

      console.log(`✅ PDF converted to image: ${result.path}`);
      return result.path;
      
    } catch (error) {
      console.error('❌ PDF conversion error:', error);
      throw new Error(`Failed to convert PDF: ${error.message}`);
    }
  }

  /**
   * Check if a file is a PDF
   * @param filePath Path to the file
   * @returns True if the file is a PDF
   */
  isPDF(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.pdf';
  }

  /**
   * Get PDF metadata
   * @param pdfPath Path to the PDF file
   * @returns PDF metadata
   */
  async getMetadata(pdfPath: string): Promise<any> {
    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(pdfBuffer);
      
      return {
        pages: data.numpages,
        info: data.info,
        metadata: data.metadata,
        text: data.text.substring(0, 500) // First 500 chars of text
      };
    } catch (error) {
      console.error('Error reading PDF metadata:', error);
      return null;
    }
  }
}

// Export singleton instance getter
export const getPdfConverterService = () => {
  return new PDFConverterService();
};