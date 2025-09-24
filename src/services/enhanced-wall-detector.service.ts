/**
 * Enhanced Wall Detector Service
 * Implements Homestyler-like wall detection using:
 * - Canny Edge Detection
 * - Hough Transform Line Detection
 * - Advanced Image Preprocessing
 * - Geometric Constraint Solving
 */

import { createCanvas, loadImage, Canvas, ImageData } from 'canvas';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

// OpenCV detection using subprocess to avoid GStreamer symbol issues
console.log('🔧 Loading EnhancedWallDetectorService module (subprocess mode)...');

interface Point {
  x: number;
  y: number;
}

interface WallSegment {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  type: 'interior' | 'exterior' | 'load-bearing';
  confidence: number;
  angle: number;
  length: number;
  isParallel?: boolean;
  parallelGroup?: number;
}

interface EdgeDetectionParams {
  lowThreshold: number;
  highThreshold: number;
  apertureSize: number;
  L2gradient: boolean;
}

interface HoughLineParams {
  rho: number;
  theta: number;
  threshold: number;
  minLineLength: number;
  maxLineGap: number;
}

export class EnhancedWallDetectorService {
  private canvas: Canvas | null = null;
  private ctx: any = null;

  // Default parameters optimized for architectural drawings
  private readonly defaultEdgeParams: EdgeDetectionParams = {
    lowThreshold: 20,
    highThreshold: 60,
    apertureSize: 3,
    L2gradient: true
  };

  private readonly defaultHoughParams: HoughLineParams = {
    rho: 1,
    theta: Math.PI / 180,
    threshold: 40,
    minLineLength: 20,
    maxLineGap: 5
  };

  /**
   * Main wall detection method using advanced CV algorithms via subprocess
   */
  async detectWalls(imagePath: string): Promise<WallSegment[]> {
    try {
      console.log('🔍 Enhanced Wall Detection Starting (subprocess mode)...');
      console.log('📁 Processing image:', imagePath);
      
      // Resolve absolute path to the OpenCV script
      const scriptPath = path.resolve(__dirname, '../scripts/opencv-wall-detector.js');
      
      // Check if script exists
      if (!fs.existsSync(scriptPath)) {
        console.log('❌ OpenCV script not found at:', scriptPath);
        return [];
      }
      
      // Run OpenCV detection in subprocess
      const command = `node "${scriptPath}" "${imagePath}"`;
      console.log('🔄 Running OpenCV detection subprocess...');
      
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      const processingTime = Date.now() - startTime;
      
      // Parse results from subprocess output
      const resultStart = stdout.indexOf('__RESULT_START__');
      const resultEnd = stdout.indexOf('__RESULT_END__');
      
      if (resultStart === -1 || resultEnd === -1) {
        console.log('❌ Could not parse OpenCV subprocess results');
        console.log('stdout:', stdout);
        if (stderr) console.log('stderr:', stderr);
        return [];
      }
      
      const resultJson = stdout.substring(
        resultStart + '__RESULT_START__'.length,
        resultEnd
      ).trim();
      
      const result = JSON.parse(resultJson);
      
      if (!result.success) {
        console.log('❌ OpenCV subprocess failed:', result.error);
        return [];
      }
      
      console.log(`✅ Detected ${result.walls.length} walls using enhanced OpenCV algorithm (${processingTime}ms)`);
      return result.walls;
      
    } catch (error) {
      console.error('❌ Enhanced wall detection subprocess error:', error.message);
      return [];
    }
  }

  /**
   * Get complete floor plan analysis including walls, area, and dimensions
   */
  async detectFloorPlanComplete(imagePath: string): Promise<any> {
    try {
      console.log('🔍 Enhanced Floor Plan Analysis Starting...');
      console.log('📁 Processing image:', imagePath);
      
      // Resolve absolute path to the OpenCV script
      const scriptPath = path.resolve(__dirname, '../scripts/opencv-wall-detector.js');
      
      // Check if script exists
      if (!fs.existsSync(scriptPath)) {
        console.log('❌ OpenCV script not found at:', scriptPath);
        return { walls: [], totalArea: 0, dimensions: { width: 0, height: 0 } };
      }
      
      // Run OpenCV detection in subprocess
      const command = `node "${scriptPath}" "${imagePath}"`;
      console.log('🔄 Running complete OpenCV analysis...');
      
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      const processingTime = Date.now() - startTime;
      
      // Parse results from subprocess output
      const resultStart = stdout.indexOf('__RESULT_START__');
      const resultEnd = stdout.indexOf('__RESULT_END__');
      
      if (resultStart === -1 || resultEnd === -1) {
        console.log('❌ Could not parse OpenCV subprocess results');
        return { walls: [], totalArea: 0, dimensions: { width: 0, height: 0 } };
      }
      
      const resultJson = stdout.substring(
        resultStart + '__RESULT_START__'.length,
        resultEnd
      ).trim();
      
      const result = JSON.parse(resultJson);
      
      if (!result.success) {
        console.log('❌ OpenCV subprocess failed:', result.error);
        return { walls: [], totalArea: 0, dimensions: { width: 0, height: 0 } };
      }
      
      console.log(`✅ Complete analysis: ${result.walls.length} walls, ${result.totalArea} sq ft (${processingTime}ms)`);
      return result;
      
    } catch (error) {
      console.error('❌ Enhanced floor plan analysis error:', error.message);
      return { walls: [], totalArea: 0, dimensions: { width: 0, height: 0 } };
    }
  }

  /**
   * Advanced image preprocessing pipeline optimized for floor plans
   */
  private preprocessImage(mat: any): any {
    console.log('🔧 Preprocessing architectural drawing...');
    
    // Convert to grayscale
    let processed = mat.bgrToGray();
    
    // Apply light Gaussian blur to reduce noise but preserve sharp lines
    processed = processed.gaussianBlur(new cv.Size(3, 3), 0);
    
    // Apply adaptive histogram equalization for better contrast
    processed = processed.equalizeHist();
    
    // Apply threshold to create binary image (better for line detection)
    processed = processed.threshold(0, 255, (cv as any).THRESH_BINARY + (cv as any).THRESH_OTSU).mat;
    
    // Apply morphological opening to remove small noise
    const kernel = (cv as any).getStructuringElement((cv as any).MORPH_RECT, new (cv as any).Size(2, 2));
    processed = processed.morphologyEx((cv as any).MORPH_OPEN, kernel);
    
    return processed;
  }

  /**
   * Apply Canny edge detection with optimized parameters
   */
  private applyCannyEdgeDetection(mat: any, params?: EdgeDetectionParams): any {
    console.log('⚡ Applying Canny edge detection...');
    
    const edgeParams = params || this.defaultEdgeParams;
    
    const edges = mat.canny(
      edgeParams.lowThreshold,
      edgeParams.highThreshold,
      edgeParams.apertureSize,
      edgeParams.L2gradient
    );
    
    return edges;
  }

  /**
   * Detect lines using Hough Transform
   */
  private detectLinesWithHough(edges: any, params?: HoughLineParams): any[] {
    console.log('📏 Detecting lines with Hough Transform...');
    
    const houghParams = params || this.defaultHoughParams;
    
    // Use HoughLinesP for better line segment detection
    const lines = edges.houghLinesP(
      houghParams.rho,
      houghParams.theta,
      houghParams.threshold,
      houghParams.minLineLength,
      houghParams.maxLineGap
    );
    
    console.log(`  Found ${lines.length} line segments`);
    return lines;
  }

  /**
   * Convert detected lines directly to wall segments
   * In architectural drawings, walls are typically single lines, not parallel pairs
   */
  private groupLinesIntoWalls(lines: any[], imageHeight: number, imageWidth: number): WallSegment[] {
    console.log('🔗 Converting lines to walls...');
    
    const walls: WallSegment[] = [];
    const minWallLength = 15; // Minimum length for a wall
    
    // Convert each significant line to a wall segment
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const length = this.calculateLineLength(line);
      
      // Skip very short lines that are likely noise
      if (length < minWallLength) continue;
      
      // Create wall segment from line
      const wall = this.createWallFromLine(line, i);
      if (wall) {
        walls.push(wall);
      }
    }
    
    // Remove duplicate/overlapping walls
    const cleanedWalls = this.removeDuplicateWalls(walls);
    
    console.log(`  Converted ${lines.length} lines to ${cleanedWalls.length} walls`);
    return cleanedWalls;
  }

  /**
   * Apply geometric constraints to improve wall detection accuracy
   */
  private applyGeometricConstraints(walls: WallSegment[]): WallSegment[] {
    console.log('📐 Applying geometric constraints...');
    
    // Filter walls based on length and confidence
    const minWallLength = 25;
    const minConfidence = 0.4;
    
    let constrainedWalls = walls.filter(wall => {
      return wall.length >= minWallLength && wall.confidence >= minConfidence;
    });
    
    // Sort by confidence and keep only the best walls
    constrainedWalls.sort((a, b) => b.confidence - a.confidence);
    
    // Limit to top walls to avoid clutter (architectural drawings shouldn't have too many walls)
    const maxWalls = Math.min(50, Math.floor(constrainedWalls.length * 0.8));
    constrainedWalls = constrainedWalls.slice(0, maxWalls);
    
    // Group walls by orientation (horizontal vs vertical vs diagonal)
    constrainedWalls = this.balanceWallOrientations(constrainedWalls);
    
    console.log(`  Filtered to ${constrainedWalls.length} high-confidence walls`);
    return constrainedWalls;
  }

  /**
   * Classify walls based on position and characteristics
   */
  private classifyWalls(walls: WallSegment[], mat: any): WallSegment[] {
    console.log('🏷️ Classifying wall types...');
    
    const imageWidth = mat.cols;
    const imageHeight = mat.rows;
    const borderThreshold = 50; // pixels from edge
    
    return walls.map(wall => {
      const midX = (wall.start.x + wall.end.x) / 2;
      const midY = (wall.start.y + wall.end.y) / 2;
      
      // Classify based on position
      if (midX < borderThreshold || midX > imageWidth - borderThreshold ||
          midY < borderThreshold || midY > imageHeight - borderThreshold) {
        wall.type = 'exterior';
        wall.confidence = Math.min(wall.confidence + 0.1, 1.0);
      } else {
        wall.type = 'interior';
      }
      
      // Classify load-bearing walls (typically thicker exterior walls)
      if (wall.type === 'exterior' && wall.thickness > 15) {
        wall.type = 'load-bearing';
        wall.confidence = Math.min(wall.confidence + 0.15, 1.0);
      }
      
      return wall;
    });
  }

  // Helper methods
  private calculateLineAngle(line: any): number {
    return Math.atan2(line.w - line.y, line.z - line.x);
  }

  private calculateLineLength(line: any): number {
    const dx = line.z - line.x;
    const dy = line.w - line.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateLineDistance(line1: any, line2: any): number {
    // Calculate perpendicular distance between parallel lines
    const x1 = line1.x, y1 = line1.y, x2 = line1.z, y2 = line1.w;
    const x3 = line2.x, y3 = line2.y;
    
    const A = y2 - y1;
    const B = x1 - x2;
    const C = x2 * y1 - x1 * y2;
    
    return Math.abs(A * x3 + B * y3 + C) / Math.sqrt(A * A + B * B);
  }

  private createWallFromLine(line: any, index: number): WallSegment | null {
    const length = this.calculateLineLength(line);
    const angle = this.calculateLineAngle(line);
    
    // Calculate confidence based on line length and straightness
    let confidence = Math.min(0.5 + (length / 100), 0.95);
    
    // Boost confidence for horizontal and vertical lines (common in floor plans)
    const normalizedAngle = Math.abs(angle) % (Math.PI / 2);
    if (normalizedAngle < (5 * Math.PI / 180) || normalizedAngle > (85 * Math.PI / 180)) {
      confidence = Math.min(confidence + 0.2, 0.95);
    }
    
    return {
      id: `wall_${Date.now()}_${index}`,
      start: { x: Math.round(line.x), y: Math.round(line.y) },
      end: { x: Math.round(line.z), y: Math.round(line.w) },
      thickness: 6, // Standard wall thickness for floor plans
      type: 'interior',
      confidence: confidence,
      angle: angle,
      length: length,
      isParallel: false
    };
  }

  private removeDuplicateWalls(walls: WallSegment[]): WallSegment[] {
    const uniqueWalls: WallSegment[] = [];
    const tolerance = 5; // pixels
    
    for (const wall of walls) {
      let isDuplicate = false;
      
      for (const existing of uniqueWalls) {
        // Check if walls are similar (close start/end points)
        const startDist = Math.sqrt(
          Math.pow(wall.start.x - existing.start.x, 2) + 
          Math.pow(wall.start.y - existing.start.y, 2)
        );
        const endDist = Math.sqrt(
          Math.pow(wall.end.x - existing.end.x, 2) + 
          Math.pow(wall.end.y - existing.end.y, 2)
        );
        
        // Also check reversed direction
        const startEndDist = Math.sqrt(
          Math.pow(wall.start.x - existing.end.x, 2) + 
          Math.pow(wall.start.y - existing.end.y, 2)
        );
        const endStartDist = Math.sqrt(
          Math.pow(wall.end.x - existing.start.x, 2) + 
          Math.pow(wall.end.y - existing.start.y, 2)
        );
        
        if ((startDist < tolerance && endDist < tolerance) ||
            (startEndDist < tolerance && endStartDist < tolerance)) {
          isDuplicate = true;
          // Keep the wall with higher confidence
          if (wall.confidence > existing.confidence) {
            const index = uniqueWalls.indexOf(existing);
            uniqueWalls[index] = wall;
          }
          break;
        }
      }
      
      if (!isDuplicate) {
        uniqueWalls.push(wall);
      }
    }
    
    return uniqueWalls;
  }

  private mergeConnectedWalls(walls: WallSegment[]): WallSegment[] {
    // Implementation for merging walls that connect end-to-end
    return walls; // Simplified for now
  }

  private enforceCornerConstraints(walls: WallSegment[]): WallSegment[] {
    // Implementation for ensuring proper wall intersections
    return walls; // Simplified for now
  }

  private balanceWallOrientations(walls: WallSegment[]): WallSegment[] {
    // Categorize walls by orientation
    const horizontal: WallSegment[] = [];
    const vertical: WallSegment[] = [];
    const diagonal: WallSegment[] = [];
    
    const angleThreshold = 15 * (Math.PI / 180); // 15 degrees
    
    for (const wall of walls) {
      const absAngle = Math.abs(wall.angle);
      const normalizedAngle = absAngle % (Math.PI / 2);
      
      if (normalizedAngle < angleThreshold || normalizedAngle > (Math.PI / 2 - angleThreshold)) {
        if (absAngle < Math.PI / 4) {
          horizontal.push(wall);
        } else {
          vertical.push(wall);
        }
      } else {
        diagonal.push(wall);
      }
    }
    
    // Balance the selection - architectural drawings typically have more horizontal/vertical walls
    const maxHorizontal = Math.max(15, Math.floor(horizontal.length * 0.9));
    const maxVertical = Math.max(15, Math.floor(vertical.length * 0.9));
    const maxDiagonal = Math.max(5, Math.floor(diagonal.length * 0.6));
    
    const balancedWalls = [
      ...horizontal.slice(0, maxHorizontal),
      ...vertical.slice(0, maxVertical),
      ...diagonal.slice(0, maxDiagonal)
    ];
    
    return balancedWalls;
  }

  /**
   * Auto-detect optimal parameters for different image types (simplified for subprocess mode)
   */
  async autoDetectParameters(imagePath: string): Promise<{edge: EdgeDetectionParams, hough: HoughLineParams}> {
    // For subprocess mode, return sensible defaults based on file analysis
    console.log('📊 Using default parameters for subprocess mode');
    
    // Could analyze file size, type, etc. here for basic parameter tuning
    const edgeParams = { ...this.defaultEdgeParams };
    const houghParams = { ...this.defaultHoughParams };
    
    // For now, just return defaults since we're using subprocess mode
    // Future enhancement: Could run a quick subprocess to analyze image characteristics
    
    return { edge: edgeParams, hough: houghParams };
  }
}