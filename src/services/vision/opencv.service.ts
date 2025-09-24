/**
 * OpenCV Computer Vision Service
 * Edge detection, contour finding, and line detection
 * Uses Sharp for image processing with OpenCV-like algorithms
 */

import sharp from 'sharp';
import { Buffer } from 'buffer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Point coordinate
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Line segment
 */
export interface Line {
  start: Point;
  end: Point;
  angle: number;
  length: number;
  confidence: number;
}

/**
 * Contour (polygon)
 */
export interface Contour {
  points: Point[];
  area: number;
  perimeter: number;
  centroid: Point;
  boundingBox: BoundingBox;
  hierarchy: number;
  isConvex: boolean;
  confidence: number;
}

/**
 * Bounding box
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Edge detection result
 */
export interface EdgeDetectionResult {
  edges: Buffer;
  metadata: {
    width: number;
    height: number;
    edgePixels: number;
    edgePercentage: number;
  };
  processingTime: number;
}

/**
 * Line detection result
 */
export interface LineDetectionResult {
  lines: Line[];
  horizontalLines: Line[];
  verticalLines: Line[];
  metadata: {
    totalLines: number;
    avgLineLength: number;
    dominantAngle: number;
  };
  processingTime: number;
}

/**
 * Contour detection result
 */
export interface ContourDetectionResult {
  contours: Contour[];
  hierarchy: number[][];
  metadata: {
    totalContours: number;
    largestContour: Contour | null;
    avgContourArea: number;
  };
  processingTime: number;
}

/**
 * Corner detection result
 */
export interface CornerDetectionResult {
  corners: Point[];
  metadata: {
    totalCorners: number;
    cornerDensity: number;
  };
  processingTime: number;
}

/**
 * Detection parameters
 */
export interface DetectionParams {
  // Edge detection
  cannyLowThreshold?: number;
  cannyHighThreshold?: number;
  sobelKernelSize?: number;
  
  // Line detection
  houghThreshold?: number;
  minLineLength?: number;
  maxLineGap?: number;
  angleResolution?: number;
  
  // Contour detection
  minContourArea?: number;
  maxContourArea?: number;
  approximationEpsilon?: number;
  
  // Corner detection
  cornerQuality?: number;
  minCornerDistance?: number;
  maxCorners?: number;
}

/**
 * OpenCV Service using Sharp and custom algorithms
 */
export class OpenCVService {
  private defaultParams: DetectionParams;

  constructor() {
    this.defaultParams = {
      cannyLowThreshold: 50,
      cannyHighThreshold: 150,
      sobelKernelSize: 3,
      houghThreshold: 80,
      minLineLength: 50,
      maxLineGap: 10,
      angleResolution: 1,
      minContourArea: 100,
      maxContourArea: 1000000,
      approximationEpsilon: 0.02,
      cornerQuality: 0.01,
      minCornerDistance: 10,
      maxCorners: 1000
    };
  }

  /**
   * Detect edges using Canny-like algorithm
   */
  async detectEdges(
    input: Buffer | string,
    params?: Partial<DetectionParams>
  ): Promise<EdgeDetectionResult> {
    const startTime = Date.now();
    const mergedParams = { ...this.defaultParams, ...params };

    try {
      // Convert to grayscale
      let pipeline = sharp(input).grayscale();

      // Apply Gaussian blur to reduce noise
      pipeline = pipeline.blur(1);

      // Apply edge detection using convolution (Sobel operator)
      const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

      // Apply Sobel X
      const edgeX = await pipeline.clone()
        .convolve({
          width: 3,
          height: 3,
          kernel: sobelX
        })
        .toBuffer();

      // Apply Sobel Y
      const edgeY = await pipeline.clone()
        .convolve({
          width: 3,
          height: 3,
          kernel: sobelY
        })
        .toBuffer();

      // Combine edges (magnitude)
      const edges = await this.combineEdges(edgeX, edgeY);

      // Apply threshold
      const thresholded = await sharp(edges)
        .threshold(mergedParams.cannyLowThreshold)
        .toBuffer();

      // Get metadata
      const metadata = await sharp(thresholded).metadata();
      const stats = await sharp(thresholded).stats();

      const processingTime = Date.now() - startTime;

      return {
        edges: thresholded,
        metadata: {
          width: metadata.width!,
          height: metadata.height!,
          edgePixels: Math.round(stats.channels[0].mean * metadata.width! * metadata.height! / 255),
          edgePercentage: stats.channels[0].mean / 255 * 100
        },
        processingTime
      };

    } catch (error) {
      console.error('Edge detection error:', error);
      throw new Error(`Edge detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect lines using Hough transform-like algorithm
   */
  async detectLines(
    input: Buffer | string,
    params?: Partial<DetectionParams>
  ): Promise<LineDetectionResult> {
    const startTime = Date.now();
    const mergedParams = { ...this.defaultParams, ...params };

    try {
      // First detect edges
      const edgeResult = await this.detectEdges(input, params);
      
      // Extract lines from edge image
      const lines = await this.extractLinesFromEdges(
        edgeResult.edges,
        edgeResult.metadata.width,
        edgeResult.metadata.height,
        mergedParams
      );

      // Classify lines as horizontal or vertical
      const horizontalLines = lines.filter(line => 
        Math.abs(line.angle) < 15 || Math.abs(line.angle - 180) < 15
      );
      
      const verticalLines = lines.filter(line => 
        Math.abs(line.angle - 90) < 15 || Math.abs(line.angle - 270) < 15
      );

      // Calculate metadata
      const avgLineLength = lines.length > 0 
        ? lines.reduce((sum, line) => sum + line.length, 0) / lines.length 
        : 0;

      const dominantAngle = this.calculateDominantAngle(lines);

      const processingTime = Date.now() - startTime;

      return {
        lines,
        horizontalLines,
        verticalLines,
        metadata: {
          totalLines: lines.length,
          avgLineLength,
          dominantAngle
        },
        processingTime
      };

    } catch (error) {
      console.error('Line detection error:', error);
      throw new Error(`Line detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect contours (polygons)
   */
  async detectContours(
    input: Buffer | string,
    params?: Partial<DetectionParams>
  ): Promise<ContourDetectionResult> {
    const startTime = Date.now();
    const mergedParams = { ...this.defaultParams, ...params };

    try {
      // Preprocess image
      const preprocessed = await sharp(input)
        .grayscale()
        .threshold(128)
        .toBuffer();

      // Get image metadata
      const metadata = await sharp(preprocessed).metadata();
      const width = metadata.width!;
      const height = metadata.height!;

      // Extract contours from binary image
      const contours = await this.extractContours(
        preprocessed,
        width,
        height,
        mergedParams
      );

      // Build hierarchy
      const hierarchy = this.buildContourHierarchy(contours);

      // Filter by area
      const filteredContours = contours.filter(contour => 
        contour.area >= mergedParams.minContourArea! &&
        contour.area <= mergedParams.maxContourArea!
      );

      // Find largest contour
      const largestContour = filteredContours.length > 0
        ? filteredContours.reduce((max, contour) => 
            contour.area > max.area ? contour : max
          )
        : null;

      // Calculate average area
      const avgContourArea = filteredContours.length > 0
        ? filteredContours.reduce((sum, c) => sum + c.area, 0) / filteredContours.length
        : 0;

      const processingTime = Date.now() - startTime;

      return {
        contours: filteredContours,
        hierarchy,
        metadata: {
          totalContours: filteredContours.length,
          largestContour,
          avgContourArea
        },
        processingTime
      };

    } catch (error) {
      console.error('Contour detection error:', error);
      throw new Error(`Contour detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect corners using Harris corner detection-like algorithm
   */
  async detectCorners(
    input: Buffer | string,
    params?: Partial<DetectionParams>
  ): Promise<CornerDetectionResult> {
    const startTime = Date.now();
    const mergedParams = { ...this.defaultParams, ...params };

    try {
      // Convert to grayscale
      const grayscale = await sharp(input)
        .grayscale()
        .toBuffer();

      const metadata = await sharp(grayscale).metadata();
      const width = metadata.width!;
      const height = metadata.height!;

      // Detect corners using gradient analysis
      const corners = await this.extractCorners(
        grayscale,
        width,
        height,
        mergedParams
      );

      // Filter corners by minimum distance
      const filteredCorners = this.filterCornersByDistance(
        corners,
        mergedParams.minCornerDistance!
      );

      // Limit number of corners
      const finalCorners = filteredCorners.slice(0, mergedParams.maxCorners!);

      // Calculate corner density
      const cornerDensity = finalCorners.length / (width * height) * 10000;

      const processingTime = Date.now() - startTime;

      return {
        corners: finalCorners,
        metadata: {
          totalCorners: finalCorners.length,
          cornerDensity
        },
        processingTime
      };

    } catch (error) {
      console.error('Corner detection error:', error);
      throw new Error(`Corner detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Apply morphological operations
   */
  async morphology(
    input: Buffer | string,
    operation: 'erode' | 'dilate' | 'open' | 'close',
    kernelSize: number = 3
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(input).grayscale();

      switch (operation) {
        case 'erode':
          // Erosion - local minimum
          pipeline = pipeline.median(kernelSize);
          break;
          
        case 'dilate':
          // Dilation - local maximum
          pipeline = pipeline.blur(kernelSize / 2);
          break;
          
        case 'open':
          // Opening - erosion followed by dilation
          const eroded = await pipeline.median(kernelSize).toBuffer();
          pipeline = sharp(eroded).blur(kernelSize / 2);
          break;
          
        case 'close':
          // Closing - dilation followed by erosion
          const dilated = await pipeline.blur(kernelSize / 2).toBuffer();
          pipeline = sharp(dilated).median(kernelSize);
          break;
      }

      return await pipeline.toBuffer();

    } catch (error) {
      console.error('Morphology error:', error);
      throw new Error(`Morphological operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find connected components
   */
  async findConnectedComponents(
    input: Buffer | string,
    connectivity: 4 | 8 = 8
  ): Promise<{
    labels: number[][];
    numComponents: number;
    components: Array<{
      id: number;
      pixels: Point[];
      boundingBox: BoundingBox;
      area: number;
    }>;
  }> {
    try {
      // Convert to binary image
      const binary = await sharp(input)
        .grayscale()
        .threshold(128)
        .raw()
        .toBuffer();

      const metadata = await sharp(input).metadata();
      const width = metadata.width!;
      const height = metadata.height!;

      // Perform connected component labeling
      const result = this.connectedComponentLabeling(
        binary,
        width,
        height,
        connectivity
      );

      return result;

    } catch (error) {
      console.error('Connected components error:', error);
      throw new Error(`Connected component analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate image moments
   */
  async calculateMoments(
    input: Buffer | string,
    contour?: Point[]
  ): Promise<{
    m00: number;  // Area
    m10: number;  // First moment x
    m01: number;  // First moment y
    m20: number;  // Second moment x
    m02: number;  // Second moment y
    m11: number;  // Second cross moment
    centroid: Point;
    area: number;
  }> {
    try {
      if (contour) {
        // Calculate moments from contour
        return this.calculateContourMoments(contour);
      } else {
        // Calculate image moments
        const grayscale = await sharp(input)
          .grayscale()
          .raw()
          .toBuffer();

        const metadata = await sharp(input).metadata();
        const width = metadata.width!;
        const height = metadata.height!;

        return this.calculateImageMoments(grayscale, width, height);
      }

    } catch (error) {
      console.error('Moment calculation error:', error);
      throw new Error(`Moment calculation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ============================
  // Private Methods
  // ============================

  /**
   * Combine edge gradients
   */
  private async combineEdges(edgeX: Buffer, edgeY: Buffer): Promise<Buffer> {
    const length = Math.min(edgeX.length, edgeY.length);
    const result = Buffer.alloc(length);

    for (let i = 0; i < length; i++) {
      const magnitude = Math.sqrt(edgeX[i] * edgeX[i] + edgeY[i] * edgeY[i]);
      result[i] = Math.min(255, magnitude);
    }

    return result;
  }

  /**
   * Extract lines from edge image
   */
  private async extractLinesFromEdges(
    edges: Buffer,
    width: number,
    height: number,
    params: DetectionParams
  ): Promise<Line[]> {
    const lines: Line[] = [];
    
    // Simplified Hough transform
    // In production, would implement full Hough transform
    
    // Scan for horizontal lines
    for (let y = 0; y < height; y += 5) {
      let lineStart: Point | null = null;
      let lineLength = 0;

      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pixel = edges[idx];

        if (pixel > 128) {
          if (!lineStart) {
            lineStart = { x, y };
          }
          lineLength++;
        } else {
          if (lineStart && lineLength >= params.minLineLength!) {
            lines.push({
              start: lineStart,
              end: { x: lineStart.x + lineLength, y },
              angle: 0,
              length: lineLength,
              confidence: 0.8
            });
          }
          lineStart = null;
          lineLength = 0;
        }
      }
    }

    // Scan for vertical lines
    for (let x = 0; x < width; x += 5) {
      let lineStart: Point | null = null;
      let lineLength = 0;

      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        const pixel = edges[idx];

        if (pixel > 128) {
          if (!lineStart) {
            lineStart = { x, y };
          }
          lineLength++;
        } else {
          if (lineStart && lineLength >= params.minLineLength!) {
            lines.push({
              start: lineStart,
              end: { x, y: lineStart.y + lineLength },
              angle: 90,
              length: lineLength,
              confidence: 0.8
            });
          }
          lineStart = null;
          lineLength = 0;
        }
      }
    }

    // Merge nearby parallel lines
    return this.mergeNearbyLines(lines, params.maxLineGap!);
  }

  /**
   * Merge nearby parallel lines
   */
  private mergeNearbyLines(lines: Line[], maxGap: number): Line[] {
    const merged: Line[] = [];
    const used = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;

      const line1 = lines[i];
      let mergedLine = { ...line1 };

      for (let j = i + 1; j < lines.length; j++) {
        if (used.has(j)) continue;

        const line2 = lines[j];

        // Check if lines are parallel and close
        if (Math.abs(line1.angle - line2.angle) < 5) {
          const distance = this.lineDistance(line1, line2);
          
          if (distance < maxGap) {
            // Merge lines
            mergedLine = this.mergeTwoLines(mergedLine, line2);
            used.add(j);
          }
        }
      }

      merged.push(mergedLine);
      used.add(i);
    }

    return merged;
  }

  /**
   * Calculate distance between lines
   */
  private lineDistance(line1: Line, line2: Line): number {
    // Simplified distance calculation
    const dx = Math.abs(line1.start.x - line2.start.x);
    const dy = Math.abs(line1.start.y - line2.start.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Merge two lines
   */
  private mergeTwoLines(line1: Line, line2: Line): Line {
    // Find extreme points
    const points = [line1.start, line1.end, line2.start, line2.end];
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const start = { x: minX, y: minY };
    const end = { x: maxX, y: maxY };
    const length = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
    const angle = Math.atan2(maxY - minY, maxX - minX) * 180 / Math.PI;

    return {
      start,
      end,
      angle,
      length,
      confidence: (line1.confidence + line2.confidence) / 2
    };
  }

  /**
   * Calculate dominant angle
   */
  private calculateDominantAngle(lines: Line[]): number {
    if (lines.length === 0) return 0;

    // Group lines by angle bins (0, 45, 90, 135 degrees)
    const angleBins = [0, 0, 0, 0];
    
    for (const line of lines) {
      const normalizedAngle = ((line.angle % 180) + 180) % 180;
      
      if (normalizedAngle < 22.5 || normalizedAngle >= 157.5) {
        angleBins[0] += line.length;
      } else if (normalizedAngle < 67.5) {
        angleBins[1] += line.length;
      } else if (normalizedAngle < 112.5) {
        angleBins[2] += line.length;
      } else {
        angleBins[3] += line.length;
      }
    }

    // Find dominant bin
    const maxBin = angleBins.indexOf(Math.max(...angleBins));
    return maxBin * 45;
  }

  /**
   * Extract contours from binary image
   */
  private async extractContours(
    image: Buffer,
    width: number,
    height: number,
    params: DetectionParams
  ): Promise<Contour[]> {
    const contours: Contour[] = [];
    
    // Connected component labeling
    const components = this.connectedComponentLabeling(
      image,
      width,
      height,
      8
    );

    // Convert components to contours
    for (const component of components.components) {
      if (component.area < params.minContourArea!) continue;

      // Extract boundary points
      const boundary = this.extractBoundary(component.pixels);
      
      // Simplify contour
      const simplified = this.simplifyContour(
        boundary,
        params.approximationEpsilon!
      );

      // Calculate properties
      const area = this.calculatePolygonArea(simplified);
      const perimeter = this.calculatePolygonPerimeter(simplified);
      const centroid = this.calculateCentroid(simplified);
      const boundingBox = this.calculateBoundingBox(simplified);
      const isConvex = this.isConvexPolygon(simplified);

      contours.push({
        points: simplified,
        area,
        perimeter,
        centroid,
        boundingBox,
        hierarchy: 0,
        isConvex,
        confidence: 0.85
      });
    }

    return contours;
  }

  /**
   * Connected component labeling
   */
  private connectedComponentLabeling(
    image: Buffer,
    width: number,
    height: number,
    connectivity: 4 | 8
  ): {
    labels: number[][];
    numComponents: number;
    components: Array<{
      id: number;
      pixels: Point[];
      boundingBox: BoundingBox;
      area: number;
    }>;
  } {
    const labels: number[][] = Array(height).fill(null).map(() => Array(width).fill(0));
    let currentLabel = 0;
    const components: Array<{
      id: number;
      pixels: Point[];
      boundingBox: BoundingBox;
      area: number;
    }> = [];

    // Two-pass algorithm
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        if (image[idx] > 128 && labels[y][x] === 0) {
          currentLabel++;
          const component = this.floodFill(
            image,
            labels,
            x,
            y,
            width,
            height,
            currentLabel,
            connectivity
          );
          
          components.push({
            id: currentLabel,
            pixels: component.pixels,
            boundingBox: this.calculateBoundingBox(component.pixels),
            area: component.pixels.length
          });
        }
      }
    }

    return {
      labels,
      numComponents: currentLabel,
      components
    };
  }

  /**
   * Flood fill algorithm
   */
  private floodFill(
    image: Buffer,
    labels: number[][],
    startX: number,
    startY: number,
    width: number,
    height: number,
    label: number,
    connectivity: 4 | 8
  ): { pixels: Point[] } {
    const pixels: Point[] = [];
    const stack: Point[] = [{ x: startX, y: startY }];
    
    const neighbors = connectivity === 4
      ? [[0, 1], [1, 0], [0, -1], [-1, 0]]
      : [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]];

    while (stack.length > 0) {
      const point = stack.pop()!;
      const { x, y } = point;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (labels[y][x] !== 0) continue;

      const idx = y * width + x;
      if (image[idx] <= 128) continue;

      labels[y][x] = label;
      pixels.push(point);

      for (const [dx, dy] of neighbors) {
        stack.push({ x: x + dx, y: y + dy });
      }
    }

    return { pixels };
  }

  /**
   * Extract boundary from pixel set
   */
  private extractBoundary(pixels: Point[]): Point[] {
    const boundary: Point[] = [];
    const pixelSet = new Set(pixels.map(p => `${p.x},${p.y}`));

    for (const pixel of pixels) {
      // Check if pixel is on boundary (has at least one non-pixel neighbor)
      const neighbors = [
        { x: pixel.x + 1, y: pixel.y },
        { x: pixel.x - 1, y: pixel.y },
        { x: pixel.x, y: pixel.y + 1 },
        { x: pixel.x, y: pixel.y - 1 }
      ];

      const isBoundary = neighbors.some(n => !pixelSet.has(`${n.x},${n.y}`));
      
      if (isBoundary) {
        boundary.push(pixel);
      }
    }

    // Sort boundary points for proper polygon
    return this.sortBoundaryPoints(boundary);
  }

  /**
   * Sort boundary points to form proper polygon
   */
  private sortBoundaryPoints(points: Point[]): Point[] {
    if (points.length === 0) return points;

    // Find centroid
    const centroid = this.calculateCentroid(points);

    // Sort by angle from centroid
    return points.sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });
  }

  /**
   * Simplify contour using Douglas-Peucker algorithm
   */
  private simplifyContour(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    // Find point with maximum distance
    let maxDist = 0;
    let maxIndex = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.pointToLineDistance(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxDist > epsilon) {
      const left = this.simplifyContour(points.slice(0, maxIndex + 1), epsilon);
      const right = this.simplifyContour(points.slice(maxIndex), epsilon);
      
      return [...left.slice(0, -1), ...right];
    } else {
      return [start, end];
    }
  }

  /**
   * Calculate point to line distance
   */
  private pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate polygon area
   */
  private calculatePolygonArea(points: Point[]): number {
    if (points.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    return Math.abs(area / 2);
  }

  /**
   * Calculate polygon perimeter
   */
  private calculatePolygonPerimeter(points: Point[]): number {
    if (points.length < 2) return 0;

    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    return perimeter;
  }

  /**
   * Calculate centroid
   */
  private calculateCentroid(points: Point[]): Point {
    if (points.length === 0) return { x: 0, y: 0 };

    let sumX = 0, sumY = 0;
    for (const point of points) {
      sumX += point.x;
      sumY += point.y;
    }

    return {
      x: sumX / points.length,
      y: sumY / points.length
    };
  }

  /**
   * Calculate bounding box
   */
  private calculateBoundingBox(points: Point[]): BoundingBox {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Check if polygon is convex
   */
  private isConvexPolygon(points: Point[]): boolean {
    if (points.length < 3) return false;

    let sign: number | null = null;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];

      const crossProduct = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);

      if (sign === null) {
        sign = Math.sign(crossProduct);
      } else if (Math.sign(crossProduct) !== sign && crossProduct !== 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Build contour hierarchy
   */
  private buildContourHierarchy(contours: Contour[]): number[][] {
    const hierarchy: number[][] = [];

    // Simplified hierarchy - check containment
    for (let i = 0; i < contours.length; i++) {
      const hierarchyEntry = [-1, -1, -1, -1]; // [next, prev, child, parent]
      
      for (let j = 0; j < contours.length; j++) {
        if (i === j) continue;

        // Check if contour i is inside contour j
        if (this.isContourInside(contours[i], contours[j])) {
          hierarchyEntry[3] = j; // Set parent
          break;
        }
      }

      hierarchy.push(hierarchyEntry);
    }

    return hierarchy;
  }

  /**
   * Check if one contour is inside another
   */
  private isContourInside(inner: Contour, outer: Contour): boolean {
    // Check if inner's centroid is inside outer
    return this.isPointInPolygon(inner.centroid, outer.points);
  }

  /**
   * Check if point is inside polygon
   */
  private isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Extract corners from image
   */
  private async extractCorners(
    image: Buffer,
    width: number,
    height: number,
    params: DetectionParams
  ): Promise<Point[]> {
    const corners: Point[] = [];

    // Harris corner detection (simplified)
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const cornerScore = this.calculateCornerScore(image, x, y, width);
        
        if (cornerScore > params.cornerQuality!) {
          corners.push({ x, y });
        }
      }
    }

    // Sort corners by score (simplified - using position)
    return corners.sort((a, b) => (b.x + b.y) - (a.x + a.y));
  }

  /**
   * Calculate corner score
   */
  private calculateCornerScore(
    image: Buffer,
    x: number,
    y: number,
    width: number
  ): number {
    // Simplified corner detection
    let score = 0;

    // Check gradients in neighborhood
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const idx1 = (y + dy) * width + (x + dx);
        const idx2 = y * width + x;

        const diff = Math.abs(image[idx1] - image[idx2]);
        score += diff;
      }
    }

    return score / 255;
  }

  /**
   * Filter corners by minimum distance
   */
  private filterCornersByDistance(corners: Point[], minDistance: number): Point[] {
    const filtered: Point[] = [];
    
    for (const corner of corners) {
      let tooClose = false;
      
      for (const existing of filtered) {
        const dx = corner.x - existing.x;
        const dy = corner.y - existing.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        filtered.push(corner);
      }
    }

    return filtered;
  }

  /**
   * Calculate contour moments
   */
  private calculateContourMoments(contour: Point[]): {
    m00: number;
    m10: number;
    m01: number;
    m20: number;
    m02: number;
    m11: number;
    centroid: Point;
    area: number;
  } {
    let m00 = 0, m10 = 0, m01 = 0;
    let m20 = 0, m02 = 0, m11 = 0;

    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      const xi = contour[i].x;
      const yi = contour[i].y;
      const xj = contour[j].x;
      const yj = contour[j].y;

      const a = xi * yj - xj * yi;
      m00 += a;
      m10 += (xi + xj) * a;
      m01 += (yi + yj) * a;
      m20 += (xi * xi + xi * xj + xj * xj) * a;
      m02 += (yi * yi + yi * yj + yj * yj) * a;
      m11 += (xi * yj + 2 * xi * yi + 2 * xj * yj + xj * yi) * a;
    }

    m00 /= 2;
    m10 /= 6;
    m01 /= 6;
    m20 /= 12;
    m02 /= 12;
    m11 /= 24;

    const area = Math.abs(m00);
    const centroid = {
      x: m10 / m00,
      y: m01 / m00
    };

    return {
      m00: Math.abs(m00),
      m10,
      m01,
      m20,
      m02,
      m11,
      centroid,
      area
    };
  }

  /**
   * Calculate image moments
   */
  private calculateImageMoments(
    image: Buffer,
    width: number,
    height: number
  ): {
    m00: number;
    m10: number;
    m01: number;
    m20: number;
    m02: number;
    m11: number;
    centroid: Point;
    area: number;
  } {
    let m00 = 0, m10 = 0, m01 = 0;
    let m20 = 0, m02 = 0, m11 = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pixel = image[idx] / 255;

        m00 += pixel;
        m10 += x * pixel;
        m01 += y * pixel;
        m20 += x * x * pixel;
        m02 += y * y * pixel;
        m11 += x * y * pixel;
      }
    }

    const area = m00;
    const centroid = m00 > 0 ? {
      x: m10 / m00,
      y: m01 / m00
    } : { x: width / 2, y: height / 2 };

    return {
      m00,
      m10,
      m01,
      m20,
      m02,
      m11,
      centroid,
      area
    };
  }
}

// Export singleton instance
export default new OpenCVService();