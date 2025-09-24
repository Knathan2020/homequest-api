/**
 * OpenCV Processor Service
 * Computer vision for precise coordinate extraction and geometry analysis
 */

// OpenCV.js integration
import sharp from 'sharp';

// Use opencv.js package for browser-compatible OpenCV
let cv: any;
try {
  // Try to load opencv.js
  cv = require('opencv.js');
} catch (error) {
  console.log('⚠️ OpenCV.js not fully loaded, using opencv-wasm as fallback');
  try {
    cv = require('opencv-wasm');
  } catch (e) {
    console.log('⚠️ OpenCV packages not available, using stub implementation');
    // Fallback stub for development
    cv = {
      imread: (buffer: Buffer) => ({ rows: 0, cols: 0, channels: () => 3, release: () => {} }),
      Mat: class { 
        constructor(...args: any[]) {} 
        rows = 0;
        cols = 0;
        release() {}
      },
      cvtColor: (...args: any[]) => {},
      COLOR_BGR2GRAY: 6,
      COLOR_RGBA2GRAY: 11,
      GaussianBlur: (...args: any[]) => {},
      Size: class { constructor(width: number, height: number) {} },
      Canny: (...args: any[]) => {},
      findContours: (...args: any[]) => {},
      RETR_EXTERNAL: 0,
      CHAIN_APPROX_SIMPLE: 2,
      HoughLinesP: (...args: any[]) => ({ rows: 0, release: () => {} }),
      morphologyEx: (...args: any[]) => {},
      MORPH_CLOSE: 3,
      getStructuringElement: (...args: any[]) => ({ release: () => {} }),
      MORPH_RECT: 0,
      connectedComponentsWithStats: (...args: any[]) => 0,
      contourArea: (contour: any) => 0,
      minAreaRect: (contour: any) => ({ size: { width: 0, height: 0 }, angle: 0 }),
      boundingRect: (contour: any) => ({ x: 0, y: 0, width: 0, height: 0 }),
      arcLength: (contour: any, closed: boolean) => 0,
      approxPolyDP: (contour: any, epsilon: number, closed: boolean) => ({ rows: 0, release: () => {} }),
      matFromImageData: (imageData: any) => new cv.Mat(),
      imshow: (canvasId: string, mat: any) => {},
      waitKey: (delay: number) => {},
      destroyAllWindows: () => {}
    } as any;
  }
}

export interface OpenCVResult {
  success: boolean;
  walls: WallSegment[];
  doors: DoorDetection[];
  windows: WindowDetection[];
  rooms: RoomBoundary[];
  edges: EdgePoint[];
  lines: LineSegment[];
  contours: Contour[];
  metadata: ProcessingMetadata;
}

interface WallSegment {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  type: 'exterior' | 'interior';
  confidence: number;
}

interface Point {
  x: number;
  y: number;
}

interface DoorDetection {
  id: string;
  position: Point;
  width: number;
  wallId?: string;
  type: 'entry' | 'interior' | 'garage';
}

interface WindowDetection {
  id: string;
  position: Point;
  width: number;
  height: number;
  wallId?: string;
}

interface RoomBoundary {
  id: string;
  vertices: Point[];
  area: number;
  perimeter: number;
  centroid: Point;
}

interface EdgePoint {
  x: number;
  y: number;
  strength: number;
}

interface LineSegment {
  start: Point;
  end: Point;
  angle: number;
  length: number;
}

interface Contour {
  points: Point[];
  area: number;
  perimeter: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ProcessingMetadata {
  imageWidth: number;
  imageHeight: number;
  processingTime: number;
  edgesDetected: number;
  linesDetected: number;
  contoursFound: number;
}

export class OpenCVProcessor {
  private initialized: boolean = false;
  
  /**
   * Initialize OpenCV
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // OpenCV initialization for Node.js
      console.log('🔬 Initializing OpenCV...');
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize OpenCV:', error);
      throw error;
    }
  }
  
  /**
   * Process blueprint image with OpenCV for precise geometry extraction
   */
  async processBlueprint(imageBuffer: Buffer): Promise<OpenCVResult> {
    const startTime = Date.now();
    
    try {
      await this.initialize();
      
      // Convert buffer to OpenCV Mat
      const mat = await this.bufferToMat(imageBuffer);
      
      // Preprocessing
      const processed = await this.preprocessImage(mat);
      
      // Extract features
      const edges = await this.detectEdges(processed);
      const lines = await this.detectLines(edges);
      const contours = await this.findContours(edges);
      
      // Analyze structures
      const walls = await this.detectWalls(lines, edges);
      const doors = await this.detectDoors(walls, contours);
      const windows = await this.detectWindows(walls, contours);
      const rooms = await this.detectRooms(walls, contours);
      
      // Get metadata
      const metadata: ProcessingMetadata = {
        imageWidth: mat.cols,
        imageHeight: mat.rows,
        processingTime: Date.now() - startTime,
        edgesDetected: this.countEdgePoints(edges),
        linesDetected: lines.length,
        contoursFound: contours.length,
      };
      
      // Cleanup
      mat.delete();
      processed.delete();
      edges.delete();
      
      return {
        success: true,
        walls,
        doors,
        windows,
        rooms,
        edges: [],
        lines,
        contours,
        metadata,
      };
      
    } catch (error) {
      console.error('OpenCV processing error:', error);
      
      return {
        success: false,
        walls: [],
        doors: [],
        windows: [],
        rooms: [],
        edges: [],
        lines: [],
        contours: [],
        metadata: {
          imageWidth: 0,
          imageHeight: 0,
          processingTime: Date.now() - startTime,
          edgesDetected: 0,
          linesDetected: 0,
          contoursFound: 0,
        },
      };
    }
  }
  
  /**
   * Convert buffer to OpenCV Mat
   */
  private async bufferToMat(buffer: Buffer): Promise<any> {
    // Convert buffer to sharp for easier manipulation
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Create Mat from buffer
    const mat = new cv.Mat(info.height, info.width, cv.CV_8UC3);
    
    // Copy data to Mat
    for (let i = 0; i < data.length; i++) {
      mat.data[i] = data[i];
    }
    
    return mat;
  }
  
  /**
   * Preprocess image for better feature detection
   */
  private async preprocessImage(mat: any): Promise<any> {
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const enhanced = new cv.Mat();
    
    // Convert to grayscale
    cv.cvtColor(mat, gray, cv.COLOR_BGR2GRAY);
    
    // Apply Gaussian blur to reduce noise
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(gray, blurred, ksize, 1);
    
    // Enhance contrast using CLAHE
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(blurred, enhanced);
    
    gray.delete();
    blurred.delete();
    clahe.delete();
    
    return enhanced;
  }
  
  /**
   * Detect edges using Canny edge detector
   */
  private async detectEdges(mat: any): Promise<any> {
    const edges = new cv.Mat();
    
    // Apply Canny edge detection
    const threshold1 = 50;
    const threshold2 = 150;
    cv.Canny(mat, edges, threshold1, threshold2);
    
    // Apply morphological operations to connect nearby edges
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    kernel.delete();
    
    return edges;
  }
  
  /**
   * Detect lines using Hough transform
   */
  private async detectLines(edges: any): Promise<LineSegment[]> {
    const lines = new cv.Mat();
    const lineSegments: LineSegment[] = [];
    
    // Detect lines using probabilistic Hough transform
    cv.HoughLinesP(
      edges,
      lines,
      1, // rho
      Math.PI / 180, // theta
      50, // threshold
      50, // minLineLength
      10  // maxLineGap
    );
    
    // Convert to LineSegment format
    for (let i = 0; i < lines.rows; i++) {
      const [x1, y1, x2, y2] = lines.data32S.slice(i * 4, i * 4 + 4);
      
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      
      lineSegments.push({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        angle: angle,
        length: length,
      });
    }
    
    lines.delete();
    
    // Merge collinear lines
    return this.mergeCollinearLines(lineSegments);
  }
  
  /**
   * Find contours in the edge image
   */
  private async findContours(edges: any): Promise<Contour[]> {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    
    // Find contours
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_TREE,
      cv.CHAIN_APPROX_SIMPLE
    );
    
    const contourList: Contour[] = [];
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // Filter small contours
      if (area < 100) {
        contour.delete();
        continue;
      }
      
      const perimeter = cv.arcLength(contour, true);
      const rect = cv.boundingRect(contour);
      
      // Extract points
      const points: Point[] = [];
      for (let j = 0; j < contour.rows; j++) {
        points.push({
          x: contour.data32S[j * 2],
          y: contour.data32S[j * 2 + 1],
        });
      }
      
      contourList.push({
        points: points,
        area: area,
        perimeter: perimeter,
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      });
      
      contour.delete();
    }
    
    contours.delete();
    hierarchy.delete();
    
    return contourList;
  }
  
  /**
   * Detect walls from lines
   */
  private async detectWalls(lines: LineSegment[], edges: any): Promise<WallSegment[]> {
    const walls: WallSegment[] = [];
    
    // Group parallel lines that might be walls
    const parallelGroups = this.groupParallelLines(lines);
    
    for (const group of parallelGroups) {
      if (group.length >= 2) {
        // Check if lines form a wall (parallel and close)
        const wall = this.createWallFromLines(group);
        if (wall) {
          walls.push(wall);
        }
      }
    }
    
    // Classify walls as exterior or interior
    this.classifyWalls(walls);
    
    return walls;
  }
  
  /**
   * Detect doors in walls
   */
  private async detectDoors(walls: WallSegment[], contours: Contour[]): Promise<DoorDetection[]> {
    const doors: DoorDetection[] = [];
    
    // Look for gaps in walls that could be doors
    for (const wall of walls) {
      const gaps = this.findWallGaps([wall]);
      
      for (const gap of gaps) {
        // Standard door widths: 24", 30", 32", 36"
        const standardWidths = [24, 30, 32, 36];
        const isStandardWidth = standardWidths.some(
          w => Math.abs(gap.width - w) < 3
        );
        
        if (isStandardWidth || (gap.width >= 20 && gap.width <= 60)) {
          doors.push({
            id: `door_${doors.length + 1}`,
            position: gap.position,
            width: gap.width,
            wallId: wall.id,
            type: gap.width >= 60 ? 'garage' : gap.width >= 34 ? 'entry' : 'interior',
          });
        }
      }
    }
    
    return doors;
  }
  
  /**
   * Detect windows in walls
   */
  private async detectWindows(walls: WallSegment[], contours: Contour[]): Promise<WindowDetection[]> {
    const windows: WindowDetection[] = [];
    
    // Look for rectangular contours along walls
    for (const wall of walls) {
      for (const contour of contours) {
        if (this.isRectangular(contour) && this.isOnWall(contour, wall)) {
          const width = contour.boundingBox.width;
          const height = contour.boundingBox.height;
          
          // Standard window sizes
          if (width >= 24 && width <= 96 && height >= 24 && height <= 72) {
            windows.push({
              id: `window_${windows.length + 1}`,
              position: {
                x: contour.boundingBox.x + contour.boundingBox.width / 2,
                y: contour.boundingBox.y + contour.boundingBox.height / 2,
              },
              width: width,
              height: height,
              wallId: wall.id,
            });
          }
        }
      }
    }
    
    return windows;
  }
  
  /**
   * Detect rooms from walls and contours
   */
  private async detectRooms(walls: WallSegment[], contours: Contour[]): Promise<RoomBoundary[]> {
    const rooms: RoomBoundary[] = [];
    
    console.log(`🏠 Detecting rooms from ${walls.length} walls and ${contours.length} contours`);
    
    // Use contours to find room boundaries
    const roomContours = this.findRoomContours(contours);
    console.log(`📦 Found ${roomContours.length} potential room contours`);
    
    // Process each contour as a potential room
    for (const contour of roomContours) {
      const area = this.calculatePolygonArea(contour.points);
      const perimeter = this.calculatePolygonPerimeter(contour.points);
      const centroid = this.calculateCentroid(contour.points);
      
      // Filter by area - typical rooms are between 100-500 sq ft (14,400-72,000 pixels² at typical resolution)
      const minArea = 10000; // ~70 sq ft
      const maxArea = 200000; // ~1400 sq ft
      
      console.log(`   Contour area: ${area} pixels² (${(area / 144).toFixed(1)} sq ft)`);
      
      if (area > minArea && area < maxArea) {
        // Check if this contour is rectangular enough to be a room
        const isRectangular = this.isRectangularContour(contour.points);
        
        if (isRectangular) {
          rooms.push({
            id: `room_${rooms.length + 1}`,
            vertices: contour.points,
            area: area,
            perimeter: perimeter,
            centroid: centroid,
          });
          console.log(`   ✅ Room added: room_${rooms.length}, area: ${(area / 144).toFixed(1)} sq ft`);
        } else {
          console.log(`   ⚠️ Contour not rectangular enough`);
        }
      } else if (area < minArea) {
        console.log(`   ❌ Area too small for a room`);
      } else {
        console.log(`   ❌ Area too large for a single room`);
      }
    }
    
    // If no rooms found from contours, try wall-based detection
    if (rooms.length === 0) {
      console.log('⚠️ No rooms from contours, trying wall-based detection');
      const closedRegions = this.findClosedRegions(walls);
      console.log(`📦 Found ${closedRegions.length} closed regions from walls`);
      
      for (const region of closedRegions) {
        const area = this.calculatePolygonArea(region);
        if (area > 10000 && area < 200000) {
          rooms.push({
            id: `room_${rooms.length + 1}`,
            vertices: region,
            area: area,
            perimeter: this.calculatePolygonPerimeter(region),
            centroid: this.calculateCentroid(region),
          });
        }
      }
    }
    
    console.log(`✅ Total rooms detected: ${rooms.length}`);
    return rooms;
  }
  
  // Helper methods
  
  private countEdgePoints(edges: any): number {
    let count = 0;
    for (let i = 0; i < edges.data.length; i++) {
      if (edges.data[i] > 0) count++;
    }
    return count;
  }
  
  private mergeCollinearLines(lines: LineSegment[]): LineSegment[] {
    const merged: LineSegment[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      
      let currentLine = lines[i];
      used.add(i);
      
      for (let j = i + 1; j < lines.length; j++) {
        if (used.has(j)) continue;
        
        if (this.areCollinear(currentLine, lines[j]) && 
            this.areClose(currentLine, lines[j])) {
          currentLine = this.mergeTwoLines(currentLine, lines[j]);
          used.add(j);
        }
      }
      
      merged.push(currentLine);
    }
    
    return merged;
  }
  
  private areCollinear(line1: LineSegment, line2: LineSegment): boolean {
    const angleDiff = Math.abs(line1.angle - line2.angle);
    return angleDiff < 0.1 || Math.abs(angleDiff - Math.PI) < 0.1;
  }
  
  private areClose(line1: LineSegment, line2: LineSegment): boolean {
    const dist = Math.min(
      this.pointDistance(line1.start, line2.start),
      this.pointDistance(line1.start, line2.end),
      this.pointDistance(line1.end, line2.start),
      this.pointDistance(line1.end, line2.end)
    );
    return dist < 20;
  }
  
  private pointDistance(p1: Point, p2: Point): number {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }
  
  private mergeTwoLines(line1: LineSegment, line2: LineSegment): LineSegment {
    const points = [line1.start, line1.end, line2.start, line2.end];
    let maxDist = 0;
    let extremes = [points[0], points[1]];
    
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dist = this.pointDistance(points[i], points[j]);
        if (dist > maxDist) {
          maxDist = dist;
          extremes = [points[i], points[j]];
        }
      }
    }
    
    return {
      start: extremes[0],
      end: extremes[1],
      angle: Math.atan2(extremes[1].y - extremes[0].y, extremes[1].x - extremes[0].x),
      length: maxDist,
    };
  }
  
  private groupParallelLines(lines: LineSegment[]): LineSegment[][] {
    const groups: LineSegment[][] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      
      const group = [lines[i]];
      used.add(i);
      
      for (let j = i + 1; j < lines.length; j++) {
        if (used.has(j)) continue;
        
        if (this.areParallel(lines[i], lines[j])) {
          group.push(lines[j]);
          used.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }
  
  private areParallel(line1: LineSegment, line2: LineSegment): boolean {
    const angleDiff = Math.abs(line1.angle - line2.angle);
    return angleDiff < 0.1 || Math.abs(angleDiff - Math.PI) < 0.1;
  }
  
  private createWallFromLines(lines: LineSegment[]): WallSegment | null {
    if (lines.length < 1) return null;
    
    // Find the main wall line (longest)
    const mainLine = lines.reduce((prev, curr) => 
      curr.length > prev.length ? curr : prev
    );
    
    // Calculate wall thickness from parallel lines
    let thickness = 6; // Default 6 inches
    if (lines.length >= 2) {
      const distances = lines
        .filter(l => l !== mainLine)
        .map(l => this.lineToLineDistance(mainLine, l));
      thickness = Math.min(...distances);
    }
    
    return {
      id: `wall_${Math.random().toString(36).substr(2, 9)}`,
      start: mainLine.start,
      end: mainLine.end,
      thickness: thickness,
      type: 'interior', // Will be classified later
      confidence: 0.85,
    };
  }
  
  private lineToLineDistance(line1: LineSegment, line2: LineSegment): number {
    // Calculate perpendicular distance between parallel lines
    const A = line1.end.y - line1.start.y;
    const B = line1.start.x - line1.end.x;
    const C = line1.end.x * line1.start.y - line1.start.x * line1.end.y;
    
    const dist = Math.abs(A * line2.start.x + B * line2.start.y + C) / 
                 Math.sqrt(A * A + B * B);
    
    return dist;
  }
  
  private classifyWalls(walls: WallSegment[]): void {
    // Classify walls based on thickness and position
    const avgThickness = walls.reduce((sum, w) => sum + w.thickness, 0) / walls.length;
    
    for (const wall of walls) {
      if (wall.thickness > avgThickness * 1.3) {
        wall.type = 'exterior';
      } else {
        wall.type = 'interior';
      }
    }
  }
  
  private findWallGaps(wall: WallSegment[]): any[] {
    // Simplified gap detection
    return [];
  }
  
  private isRectangular(contour: Contour): boolean {
    // Check if contour is approximately rectangular
    if (contour.points.length !== 4) return false;
    
    // Check angles between consecutive edges
    for (let i = 0; i < 4; i++) {
      const p1 = contour.points[i];
      const p2 = contour.points[(i + 1) % 4];
      const p3 = contour.points[(i + 2) % 4];
      
      const angle = this.angleBetweenPoints(p1, p2, p3);
      if (Math.abs(angle - Math.PI / 2) > 0.2) {
        return false;
      }
    }
    
    return true;
  }
  
  private angleBetweenPoints(p1: Point, p2: Point, p3: Point): number {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const det = v1.x * v2.y - v1.y * v2.x;
    
    return Math.atan2(det, dot);
  }
  
  private isOnWall(contour: Contour, wall: WallSegment): boolean {
    // Check if contour center is close to wall line
    const center = {
      x: contour.boundingBox.x + contour.boundingBox.width / 2,
      y: contour.boundingBox.y + contour.boundingBox.height / 2,
    };
    
    const dist = this.pointToLineDistance(center, wall.start, wall.end);
    return dist < wall.thickness * 2;
  }
  
  private pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const A = lineEnd.y - lineStart.y;
    const B = lineStart.x - lineEnd.x;
    const C = lineEnd.x * lineStart.y - lineStart.x * lineEnd.y;
    
    return Math.abs(A * point.x + B * point.y + C) / Math.sqrt(A * A + B * B);
  }
  
  private findRoomContours(contours: Contour[]): Contour[] {
    // Filter contours that could be rooms
    return contours.filter(contour => {
      // Check if contour is closed
      if (contour.points.length < 4) return false;
      
      // Check if area is reasonable for a room
      const area = this.calculatePolygonArea(contour.points);
      if (area < 5000 || area > 500000) return false; // Too small or too large
      
      // Check if contour is relatively rectangular
      const boundingBox = this.getBoundingBox(contour.points);
      const boxArea = (boundingBox.maxX - boundingBox.minX) * (boundingBox.maxY - boundingBox.minY);
      const fillRatio = area / boxArea;
      
      // Rooms typically fill 60-95% of their bounding box
      return fillRatio > 0.6 && fillRatio < 0.95;
    });
  }
  
  private isRectangularContour(points: Point[]): boolean {
    if (points.length < 4) return false;
    
    // Calculate angles between consecutive edges
    const angles: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];
      
      const angle = this.calculateAngle(p1, p2, p3);
      angles.push(angle);
    }
    
    // Check if most angles are close to 90 degrees
    const rightAngles = angles.filter(a => Math.abs(a - 90) < 15 || Math.abs(a - 270) < 15);
    return rightAngles.length >= points.length * 0.6;
  }
  
  private getBoundingBox(points: Point[]): { minX: number, maxX: number, minY: number, maxY: number } {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }
  
  private calculateAngle(p1: Point, p2: Point, p3: Point): number {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    
    const angle1 = Math.atan2(v1.y, v1.x);
    const angle2 = Math.atan2(v2.y, v2.x);
    
    let angle = (angle2 - angle1) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    
    return angle;
  }
  
  private findClosedRegions(walls: WallSegment[]): Point[][] {
    const regions: Point[][] = [];
    
    if (walls.length < 3) return regions;
    
    // Create a graph of wall connections
    const graph = new Map<string, Set<string>>();
    const points = new Map<string, Point>();
    
    // Build graph from wall segments
    walls.forEach(wall => {
      const startKey = `${Math.round(wall.start.x)},${Math.round(wall.start.y)}`;
      const endKey = `${Math.round(wall.end.x)},${Math.round(wall.end.y)}`;
      
      points.set(startKey, wall.start);
      points.set(endKey, wall.end);
      
      if (!graph.has(startKey)) graph.set(startKey, new Set());
      if (!graph.has(endKey)) graph.set(endKey, new Set());
      
      graph.get(startKey)!.add(endKey);
      graph.get(endKey)!.add(startKey);
    });
    
    // Find closed cycles using DFS
    const visited = new Set<string>();
    const threshold = 50; // Pixel threshold for closing gaps
    
    // Try to find rectangular regions based on wall intersections
    for (const wall of walls) {
      // Look for perpendicular walls that might form rooms
      const perpWalls = walls.filter(w => {
        if (w === wall) return false;
        
        // Check if walls are roughly perpendicular
        const angle1 = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
        const angle2 = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
        const angleDiff = Math.abs(angle1 - angle2);
        
        return Math.abs(angleDiff - Math.PI/2) < 0.3 || Math.abs(angleDiff - 3*Math.PI/2) < 0.3;
      });
      
      // Try to form rectangles from perpendicular walls
      for (const perpWall of perpWalls) {
        const rect = this.tryFormRectangle(wall, perpWall, walls, threshold);
        if (rect && rect.length >= 4) {
          // Check if this region is already added
          const isDuplicate = regions.some(r => this.areRegionsSimilar(r, rect));
          if (!isDuplicate) {
            regions.push(rect);
          }
        }
      }
    }
    
    // Don't create a fallback bounding box - return empty if no rooms detected
    // This prevents the entire floor plan from being treated as one giant room
    
    return regions;
  }
  
  private tryFormRectangle(wall1: WallSegment, wall2: WallSegment, allWalls: WallSegment[], threshold: number): Point[] | null {
    // Try to form a rectangle from two perpendicular walls
    const corners: Point[] = [];
    
    // Find intersection or closest points
    const intersections = [
      { p: wall1.start, candidates: [wall2.start, wall2.end] },
      { p: wall1.end, candidates: [wall2.start, wall2.end] }
    ];
    
    for (const { p, candidates } of intersections) {
      for (const c of candidates) {
        const dist = Math.sqrt(Math.pow(p.x - c.x, 2) + Math.pow(p.y - c.y, 2));
        if (dist < threshold * 2) {
          corners.push({ x: (p.x + c.x) / 2, y: (p.y + c.y) / 2 });
        }
      }
    }
    
    if (corners.length >= 2) {
      // Try to complete the rectangle
      const width = Math.abs(wall1.end.x - wall1.start.x) || Math.abs(wall1.end.y - wall1.start.y);
      const height = Math.abs(wall2.end.x - wall2.start.x) || Math.abs(wall2.end.y - wall2.start.y);
      
      if (width > 100 && height > 100) {
        // Create a rectangle based on the walls
        const centerX = (wall1.start.x + wall1.end.x + wall2.start.x + wall2.end.x) / 4;
        const centerY = (wall1.start.y + wall1.end.y + wall2.start.y + wall2.end.y) / 4;
        
        return [
          { x: centerX - width/2, y: centerY - height/2 },
          { x: centerX + width/2, y: centerY - height/2 },
          { x: centerX + width/2, y: centerY + height/2 },
          { x: centerX - width/2, y: centerY + height/2 }
        ];
      }
    }
    
    return null;
  }
  
  private areRegionsSimilar(r1: Point[], r2: Point[]): boolean {
    if (r1.length !== r2.length) return false;
    
    const c1 = this.calculateCentroid(r1);
    const c2 = this.calculateCentroid(r2);
    
    const dist = Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
    return dist < 100; // Consider regions similar if centroids are close
  }
  
  private calculatePolygonArea(points: Point[]): number {
    let area = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    return Math.abs(area / 2);
  }
  
  private calculatePolygonPerimeter(points: Point[]): number {
    let perimeter = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      perimeter += this.pointDistance(points[i], points[j]);
    }
    
    return perimeter;
  }
  
  private calculateCentroid(points: Point[]): Point {
    let cx = 0;
    let cy = 0;
    
    for (const point of points) {
      cx += point.x;
      cy += point.y;
    }
    
    return {
      x: cx / points.length,
      y: cy / points.length,
    };
  }
}

// Export singleton instance
export const openCVProcessor = new OpenCVProcessor();