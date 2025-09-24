import sharp from 'sharp';
import { createCanvas, Image, Canvas, CanvasRenderingContext2D } from '@napi-rs/canvas';

interface Point {
  x: number;
  y: number;
}

interface Contour {
  points: Point[];
  area: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: Point;
  isRoom: boolean;
}

interface Line {
  start: Point;
  end: Point;
  angle: number;
  length: number;
}

interface Room {
  contour: Contour;
  type?: string;
  label?: string;
  coordinates: number[][];
}

export class OpenCVBoundaryService {
  
  async detectPreciseBoundaries(imageBuffer: Buffer): Promise<{
    rooms: Room[];
    walls: Line[];
    imageSize: { width: number; height: number };
  }> {
    console.log('🔍 Starting OpenCV boundary detection...');
    
    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    // Step 1: Preprocess image for edge detection
    const processed = await this.preprocessImage(imageBuffer);
    
    // Step 2: Detect edges using multiple techniques
    const edges = await this.detectEdges(processed);
    
    // Step 3: Find contours (closed shapes that could be rooms)
    const contours = await this.findContours(edges, width, height);
    
    // Step 4: Filter contours to identify rooms
    const roomContours = this.filterRoomContours(contours, width, height);
    
    // Step 5: Detect walls (lines in the image)
    const walls = await this.detectWalls(edges, width, height);
    
    // Step 6: Convert to normalized coordinates
    const rooms = this.contoursToRooms(roomContours, width, height);
    const normalizedWalls = this.normalizeWalls(walls, width, height);
    
    console.log(`✅ OpenCV detected ${rooms.length} room boundaries and ${normalizedWalls.length} walls`);
    
    return {
      rooms,
      walls: normalizedWalls,
      imageSize: { width, height }
    };
  }
  
  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    // Convert to grayscale and apply adaptive threshold for better edge detection
    const processed = await sharp(imageBuffer)
      .grayscale()
      .normalize() // Enhance contrast
      .median(3) // Remove noise while preserving edges
      .toBuffer();
      
    return processed;
  }
  
  private async detectEdges(imageBuffer: Buffer): Promise<Buffer> {
    // Apply Canny edge detection (simulated with sharp operations)
    // In production, you'd use actual OpenCV bindings here
    const edges = await sharp(imageBuffer)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Edge detection kernel
      })
      .threshold(50) // Binary threshold
      .toBuffer();
      
    return edges;
  }
  
  private async findContours(edgeBuffer: Buffer, width: number, height: number): Promise<Contour[]> {
    const contours: Contour[] = [];
    
    // Create canvas for processing
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Load edge image
    const img = new Image();
    img.src = edgeBuffer;
    ctx.drawImage(img, 0, 0, width, height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Find connected components (simplified contour detection)
    const visited = new Array(width * height).fill(false);
    
    for (let y = 0; y < height; y += 5) {
      for (let x = 0; x < width; x += 5) {
        const idx = y * width + x;
        if (!visited[idx] && this.isEdgePixel(data, x, y, width)) {
          const contour = this.traceContour(data, x, y, width, height, visited);
          if (contour.points.length > 20) { // Minimum points for valid contour
            contours.push(this.analyzeContour(contour));
          }
        }
      }
    }
    
    return contours;
  }
  
  private isEdgePixel(data: Uint8ClampedArray, x: number, y: number, width: number): boolean {
    const idx = (y * width + x) * 4;
    return data[idx] > 200; // White pixels are edges
  }
  
  private traceContour(
    data: Uint8ClampedArray,
    startX: number,
    startY: number,
    width: number,
    height: number,
    visited: boolean[]
  ): { points: Point[] } {
    const points: Point[] = [];
    const queue: Point[] = [{ x: startX, y: startY }];
    
    // Flood fill to find connected edge pixels
    while (queue.length > 0) {
      const point = queue.shift()!;
      const idx = point.y * width + point.x;
      
      if (visited[idx]) continue;
      visited[idx] = true;
      
      if (this.isEdgePixel(data, point.x, point.y, width)) {
        points.push(point);
        
        // Check 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = point.x + dx;
            const ny = point.y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              queue.push({ x: nx, y: ny });
            }
          }
        }
      }
    }
    
    return { points };
  }
  
  private analyzeContour(contour: { points: Point[] }): Contour {
    const points = contour.points;
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    
    return {
      points,
      area,
      boundingBox: { x: minX, y: minY, width, height },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      isRoom: false // Will be determined by filtering
    };
  }
  
  private filterRoomContours(contours: Contour[], imageWidth: number, imageHeight: number): Contour[] {
    const minArea = (imageWidth * imageHeight) * 0.005; // Min 0.5% of image
    const maxArea = (imageWidth * imageHeight) * 0.3;   // Max 30% of image
    
    return contours
      .filter(c => c.area > minArea && c.area < maxArea)
      .filter(c => {
        // Filter based on aspect ratio (rooms are usually somewhat rectangular)
        const aspectRatio = c.boundingBox.width / c.boundingBox.height;
        return aspectRatio > 0.3 && aspectRatio < 3;
      })
      .map(c => ({ ...c, isRoom: true }));
  }
  
  private async detectWalls(edgeBuffer: Buffer, width: number, height: number): Promise<Line[]> {
    const lines: Line[] = [];
    
    // Create canvas for processing
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Load edge image
    const img = new Image();
    img.src = edgeBuffer;
    ctx.drawImage(img, 0, 0, width, height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Detect horizontal lines
    for (let y = 0; y < height; y += 10) {
      let lineStart = -1;
      let consecutivePixels = 0;
      
      for (let x = 0; x < width; x++) {
        if (this.isEdgePixel(data, x, y, width)) {
          if (lineStart === -1) lineStart = x;
          consecutivePixels++;
        } else {
          if (consecutivePixels > 30) {
            lines.push({
              start: { x: lineStart, y },
              end: { x: x - 1, y },
              angle: 0,
              length: x - 1 - lineStart
            });
          }
          lineStart = -1;
          consecutivePixels = 0;
        }
      }
    }
    
    // Detect vertical lines
    for (let x = 0; x < width; x += 10) {
      let lineStart = -1;
      let consecutivePixels = 0;
      
      for (let y = 0; y < height; y++) {
        if (this.isEdgePixel(data, x, y, width)) {
          if (lineStart === -1) lineStart = y;
          consecutivePixels++;
        } else {
          if (consecutivePixels > 30) {
            lines.push({
              start: { x, y: lineStart },
              end: { x, y: y - 1 },
              angle: 90,
              length: y - 1 - lineStart
            });
          }
          lineStart = -1;
          consecutivePixels = 0;
        }
      }
    }
    
    return this.mergeNearbyLines(lines);
  }
  
  private mergeNearbyLines(lines: Line[]): Line[] {
    const merged: Line[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      
      let current = lines[i];
      used.add(i);
      
      // Try to merge with nearby parallel lines
      for (let j = i + 1; j < lines.length; j++) {
        if (used.has(j)) continue;
        
        const other = lines[j];
        
        // Check if lines are parallel and close
        if (Math.abs(current.angle - other.angle) < 5) {
          const distance = this.lineDistance(current, other);
          if (distance < 10) {
            // Merge lines
            current = this.mergeLines(current, other);
            used.add(j);
          }
        }
      }
      
      merged.push(current);
    }
    
    return merged;
  }
  
  private lineDistance(line1: Line, line2: Line): number {
    // Simplified distance calculation
    const dx = line1.start.x - line2.start.x;
    const dy = line1.start.y - line2.start.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  private mergeLines(line1: Line, line2: Line): Line {
    // Merge two lines into one longer line
    const points = [line1.start, line1.end, line2.start, line2.end];
    
    // Find extreme points
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    
    return {
      start: { x: minX, y: minY },
      end: { x: maxX, y: maxY },
      angle: line1.angle,
      length: Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2)
    };
  }
  
  private contoursToRooms(contours: Contour[], width: number, height: number): Room[] {
    return contours.map((contour, idx) => {
      // Convert contour points to normalized polygon coordinates
      const coordinates = this.simplifyContour(contour.points, width, height);
      
      return {
        contour,
        coordinates,
        type: undefined, // Will be filled by Gemini
        label: undefined  // Will be filled by Gemini
      };
    });
  }
  
  private simplifyContour(points: Point[], width: number, height: number): number[][] {
    // Douglas-Peucker simplification (simplified version)
    // Reduce points while maintaining shape
    const simplified: Point[] = [];
    const epsilon = 5; // Simplification threshold
    
    // Take every Nth point based on contour size
    const step = Math.max(1, Math.floor(points.length / 50));
    
    for (let i = 0; i < points.length; i += step) {
      simplified.push(points[i]);
    }
    
    // Ensure polygon is closed
    if (simplified.length > 0) {
      const first = simplified[0];
      const last = simplified[simplified.length - 1];
      if (first.x !== last.x || first.y !== last.y) {
        simplified.push(first);
      }
    }
    
    // Convert to normalized coordinates (0-1 range)
    // Direct normalization without flipping
    return simplified.map(p => [
      p.x / width,  // Direct normalization, no flip
      p.y / height
    ]);
  }
  
  private normalizeWalls(walls: Line[], width: number, height: number): Line[] {
    return walls.map(wall => ({
      start: {
        x: wall.start.x / width,  // Direct normalization, no flip
        y: wall.start.y / height
      },
      end: {
        x: wall.end.x / width,  // Direct normalization, no flip
        y: wall.end.y / height
      },
      angle: wall.angle,
      length: wall.length
    }));
  }
}