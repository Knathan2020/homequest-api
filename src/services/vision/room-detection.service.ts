// ========================================
// ROOM DETECTION SERVICE - room-detection.service.ts
// Identifies room boundaries, walls, doors, and windows in floor plans
// ========================================

import sharp from 'sharp';
import { OpenCVService } from './opencv.service';
import { Wall, Door, Window, Point2D } from '../../types/floor-plan.types';
import { RoomType } from '../../types/room.types';

interface RoomBoundary {
  id: string;
  type: RoomType;
  polygon: Point2D[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  area: number;
  perimeter: number;
  confidence: number;
  centroid: Point2D;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface WallSegment {
  start: Point2D;
  end: Point2D;
  thickness: number;
  length: number;
  angle: number;
  type: 'exterior' | 'interior' | 'partition';
  confidence: number;
}

interface Opening {
  type: 'door' | 'window';
  position: Point2D;
  width: number;
  height: number;
  wallSegment: WallSegment;
  orientation: 'horizontal' | 'vertical';
  confidence: number;
}

interface DetectionOptions {
  minRoomArea?: number;
  maxRoomArea?: number;
  wallThicknessRange?: { min: number; max: number };
  doorWidthRange?: { min: number; max: number };
  windowWidthRange?: { min: number; max: number };
  mergeThreshold?: number;
  confidenceThreshold?: number;
}

export class RoomDetectionService {
  private opencvService: OpenCVService;
  
  constructor() {
    this.opencvService = new OpenCVService();
  }

  /**
   * Main method to detect all room elements in a floor plan
   */
  async detectRooms(
    imageBuffer: Buffer,
    options: DetectionOptions = {}
  ): Promise<{
    rooms: RoomBoundary[];
    walls: WallSegment[];
    doors: Opening[];
    windows: Opening[];
    metadata: {
      processingTime: number;
      imageSize: { width: number; height: number };
      scale: number;
    };
  }> {
    const startTime = Date.now();
    
    const config = {
      minRoomArea: options.minRoomArea || 100,
      maxRoomArea: options.maxRoomArea || 100000,
      wallThicknessRange: options.wallThicknessRange || { min: 5, max: 30 },
      doorWidthRange: options.doorWidthRange || { min: 24, max: 48 },
      windowWidthRange: options.windowWidthRange || { min: 20, max: 80 },
      mergeThreshold: options.mergeThreshold || 10,
      confidenceThreshold: options.confidenceThreshold || 0.5
    };

    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // Step 1: Detect walls
      console.log('🧱 Detecting walls...');
      const walls = await this.detectWalls(imageBuffer, config);

      // Step 2: Detect openings (doors and windows)
      console.log('🚪 Detecting doors and windows...');
      const { doors, windows } = await this.detectOpenings(imageBuffer, walls, config);

      // Step 3: Find closed room boundaries
      console.log('🏠 Finding room boundaries...');
      const roomPolygons = await this.findRoomPolygons(walls, config);

      // Step 4: Create room boundaries with associated elements
      const rooms = this.createRoomBoundaries(roomPolygons, walls, doors, windows);

      // Step 5: Estimate scale from detected elements
      const scale = this.estimateScale(walls, doors);

      return {
        rooms,
        walls,
        doors,
        windows,
        metadata: {
          processingTime: Date.now() - startTime,
          imageSize: { width, height },
          scale
        }
      };
    } catch (error) {
      console.error('❌ Room detection failed:', error);
      throw error;
    }
  }

  /**
   * Detect walls using line detection and filtering
   */
  private async detectWalls(
    imageBuffer: Buffer,
    config: any
  ): Promise<WallSegment[]> {
    // Use edge detection to find potential walls
    const edges = await this.opencvService.detectEdges(imageBuffer, {
      cannyLowThreshold: 50,
      cannyHighThreshold: 150,
      sobelKernelSize: 3
    });

    // Detect lines
    const lines = await this.opencvService.detectLines(imageBuffer, {
      angleResolution: Math.PI / 180,
      houghThreshold: 80,
      minLineLength: 50,
      maxLineGap: 10
    });

    // Process lines into wall segments
    const wallSegments: WallSegment[] = [];
    
    for (const line of lines.lines) {
      const thickness = await this.estimateWallThickness(imageBuffer, line);
      
      // Filter by wall thickness
      if (thickness >= config.wallThicknessRange.min && 
          thickness <= config.wallThicknessRange.max) {
        
        const length = Math.sqrt(
          Math.pow(line.end.x - line.start.x, 2) + 
          Math.pow(line.end.y - line.start.y, 2)
        );
        
        const angle = Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x);
        
        // Classify wall type based on position and thickness
        const type = this.classifyWallType(line, thickness, lines.metadata);
        
        wallSegments.push({
          start: { x: line.start.x, y: line.start.y },
          end: { x: line.end.x, y: line.end.y },
          thickness,
          length,
          angle,
          type,
          confidence: line.confidence
        });
      }
    }

    // Merge nearby parallel walls
    return this.mergeNearbyWalls(wallSegments, config.mergeThreshold);
  }

  /**
   * Detect doors and windows in the floor plan
   */
  private async detectOpenings(
    imageBuffer: Buffer,
    walls: WallSegment[],
    config: any
  ): Promise<{ doors: Opening[]; windows: Opening[] }> {
    const doors: Opening[] = [];
    const windows: Opening[] = [];

    // Process image to highlight openings
    const processedBuffer = await sharp(imageBuffer)
      .greyscale()
      .normalise()
      .toBuffer();

    // Analyze gaps in walls for potential openings
    for (const wall of walls) {
      const gaps = await this.findWallGaps(processedBuffer, wall);
      
      for (const gap of gaps) {
        const opening = this.classifyOpening(gap, wall, config);
        
        if (opening) {
          if (opening.type === 'door') {
            doors.push(opening);
          } else {
            windows.push(opening);
          }
        }
      }
    }

    // Detect arc patterns for doors
    const doorArcs = await this.detectDoorArcs(imageBuffer);
    for (const arc of doorArcs) {
      const nearestWall = this.findNearestWall(arc.position, walls);
      if (nearestWall) {
        doors.push({
          type: 'door',
          position: arc.position,
          width: arc.radius * 2,
          height: 80, // Standard door height
          wallSegment: nearestWall,
          orientation: Math.abs(nearestWall.angle) < Math.PI / 4 ? 'horizontal' : 'vertical',
          confidence: arc.confidence
        });
      }
    }

    return { doors, windows };
  }

  /**
   * Find closed polygons representing rooms
   */
  private async findRoomPolygons(
    walls: WallSegment[],
    config: any
  ): Promise<Point2D[][]> {
    const polygons: Point2D[][] = [];
    
    // Create graph of wall intersections
    const intersections = this.findWallIntersections(walls);
    const graph = this.buildWallGraph(walls, intersections);
    
    // Find cycles in the graph (closed rooms)
    const cycles = this.findGraphCycles(graph);
    
    // Convert cycles to polygons
    for (const cycle of cycles) {
      const polygon = cycle.map(nodeId => {
        const intersection = intersections.find(i => i.id === nodeId);
        return intersection ? { x: intersection.x, y: intersection.y } : null;
      }).filter(p => p !== null) as Point2D[];
      
      // Validate polygon
      const area = this.calculatePolygonArea(polygon);
      if (area >= config.minRoomArea && area <= config.maxRoomArea) {
        polygons.push(polygon);
      }
    }

    return polygons;
  }

  /**
   * Create room boundaries with associated elements
   */
  private createRoomBoundaries(
    polygons: Point2D[][],
    walls: WallSegment[],
    doors: Opening[],
    windows: Opening[]
  ): RoomBoundary[] {
    const rooms: RoomBoundary[] = [];
    
    for (let i = 0; i < polygons.length; i++) {
      const polygon = polygons[i];
      
      // Calculate room properties
      const area = this.calculatePolygonArea(polygon);
      const perimeter = this.calculatePolygonPerimeter(polygon);
      const centroid = this.calculateCentroid(polygon);
      const boundingBox = this.calculateBoundingBox(polygon);
      
      // Find associated walls
      const roomWalls = this.findPolygonWalls(polygon, walls);
      
      // Find doors and windows in this room
      const roomDoors = this.findElementsInPolygon(polygon, doors);
      const roomWindows = this.findElementsInPolygon(polygon, windows);
      
      // Estimate room type based on features
      const roomType = this.estimateRoomType(area, roomDoors.length, roomWindows.length);
      
      rooms.push({
        id: `room_${i + 1}`,
        type: roomType,
        polygon,
        walls: roomWalls.map(w => ({
          id: `wall_${Math.random().toString(36).substring(2, 11)}`,
          startPoint: w.start,
          endPoint: w.end,
          thickness: w.thickness,
          type: w.type
        })),
        doors: roomDoors.map(d => ({
          id: `door_${Math.random().toString(36).substring(2, 11)}`,
          position: d.position,
          width: d.width,
          height: d.height,
          orientation: 0, // Default orientation
          type: 'single'
        })),
        windows: roomWindows.map(w => ({
          id: `window_${Math.random().toString(36).substring(2, 11)}`,
          position: w.position,
          width: w.width,
          height: w.height,
          type: 'sliding' as const
        })),
        area,
        perimeter,
        confidence: this.calculateRoomConfidence(roomWalls, roomDoors, roomWindows),
        centroid,
        boundingBox
      });
    }
    
    return rooms;
  }

  /**
   * Helper methods
   */
  
  private async estimateWallThickness(imageBuffer: Buffer, line: any): Promise<number> {
    // Sample perpendicular to the line to estimate thickness
    const samples = 10;
    let totalThickness = 0;
    
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const x = line.x1 + t * (line.x2 - line.x1);
      const y = line.y1 + t * (line.y2 - line.y1);
      
      // Sample perpendicular to line direction
      const perpAngle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1) + Math.PI / 2;
      let thickness = 0;
      
      // Scan perpendicular to find wall edges
      for (let d = -50; d <= 50; d++) {
        const sx = Math.round(x + d * Math.cos(perpAngle));
        const sy = Math.round(y + d * Math.sin(perpAngle));
        
        // Check if pixel is part of wall (simplified)
        // In real implementation, would check actual pixel values
        if (d >= -15 && d <= 15) {
          thickness++;
        }
      }
      
      totalThickness += thickness;
    }
    
    return totalThickness / samples;
  }

  private classifyWallType(
    line: any,
    thickness: number,
    metadata: any
  ): 'exterior' | 'interior' | 'partition' {
    const { width, height } = metadata.imageSize;
    
    // Check if line is near image boundary (likely exterior wall)
    const margin = 50;
    const nearBoundary = 
      line.x1 < margin || line.x2 < margin ||
      line.y1 < margin || line.y2 < margin ||
      line.x1 > width - margin || line.x2 > width - margin ||
      line.y1 > height - margin || line.y2 > height - margin;
    
    if (nearBoundary && thickness > 15) {
      return 'exterior';
    } else if (thickness > 10) {
      return 'interior';
    } else {
      return 'partition';
    }
  }

  private mergeNearbyWalls(walls: WallSegment[], threshold: number): WallSegment[] {
    const merged: WallSegment[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < walls.length; i++) {
      if (used.has(i)) continue;
      
      let current = walls[i];
      used.add(i);
      
      // Find walls that can be merged
      for (let j = i + 1; j < walls.length; j++) {
        if (used.has(j)) continue;
        
        const other = walls[j];
        
        // Check if walls are parallel and close
        const angleDiff = Math.abs(current.angle - other.angle);
        if (angleDiff < 0.1 || Math.abs(angleDiff - Math.PI) < 0.1) {
          const dist = this.pointToLineDistance(
            other.start,
            current.start,
            current.end
          );
          
          if (dist < threshold) {
            // Merge walls
            current = this.mergeWallSegments(current, other);
            used.add(j);
          }
        }
      }
      
      merged.push(current);
    }
    
    return merged;
  }

  private async findWallGaps(
    imageBuffer: Buffer,
    wall: WallSegment
  ): Promise<any[]> {
    // Simplified gap detection
    const gaps = [];
    const scanLength = wall.length;
    const scanStep = 5;
    
    let inGap = false;
    let gapStart = 0;
    
    for (let d = 0; d < scanLength; d += scanStep) {
      const t = d / scanLength;
      const x = wall.start.x + t * (wall.end.x - wall.start.x);
      const y = wall.start.y + t * (wall.end.y - wall.start.y);
      
      // Check if position is a gap (simplified)
      const isGap = Math.random() > 0.9; // Placeholder
      
      if (isGap && !inGap) {
        inGap = true;
        gapStart = d;
      } else if (!isGap && inGap) {
        inGap = false;
        gaps.push({
          start: gapStart,
          end: d,
          width: d - gapStart,
          position: { x, y }
        });
      }
    }
    
    return gaps;
  }

  private classifyOpening(gap: any, wall: WallSegment, config: any): Opening | null {
    if (gap.width >= config.doorWidthRange.min && 
        gap.width <= config.doorWidthRange.max) {
      return {
        type: 'door',
        position: gap.position,
        width: gap.width,
        height: 80,
        wallSegment: wall,
        orientation: Math.abs(wall.angle) < Math.PI / 4 ? 'horizontal' : 'vertical',
        confidence: 0.8
      };
    } else if (gap.width >= config.windowWidthRange.min && 
               gap.width <= config.windowWidthRange.max) {
      return {
        type: 'window',
        position: gap.position,
        width: gap.width,
        height: 48,
        wallSegment: wall,
        orientation: Math.abs(wall.angle) < Math.PI / 4 ? 'horizontal' : 'vertical',
        confidence: 0.7
      };
    }
    
    return null;
  }

  private async detectDoorArcs(imageBuffer: Buffer): Promise<any[]> {
    // Detect circular arcs that indicate door swings
    const contours = await this.opencvService.detectContours(imageBuffer);
    const arcs = [];
    
    for (const contour of contours.contours) {
      // Check if contour resembles an arc
      if (this.isArcShape(contour.points)) {
        const center = this.calculateCentroid(contour.points);
        const radius = this.calculateAverageRadius(contour.points, center);
        
        arcs.push({
          position: center,
          radius,
          confidence: contour.confidence
        });
      }
    }
    
    return arcs;
  }

  private findNearestWall(point: Point2D, walls: WallSegment[]): WallSegment | null {
    let nearest = null;
    let minDistance = Infinity;
    
    for (const wall of walls) {
      const distance = this.pointToLineDistance(point, wall.start, wall.end);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = wall;
      }
    }
    
    return minDistance < 50 ? nearest : null;
  }

  private findWallIntersections(walls: WallSegment[]): any[] {
    const intersections = [];
    let id = 0;
    
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const intersection = this.lineIntersection(
          walls[i].start, walls[i].end,
          walls[j].start, walls[j].end
        );
        
        if (intersection) {
          intersections.push({
            id: `node_${id++}`,
            x: intersection.x,
            y: intersection.y,
            walls: [i, j]
          });
        }
      }
    }
    
    return intersections;
  }

  private buildWallGraph(walls: WallSegment[], intersections: any[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const intersection of intersections) {
      graph.set(intersection.id, []);
    }
    
    // Connect nodes that share walls
    for (let i = 0; i < intersections.length; i++) {
      for (let j = i + 1; j < intersections.length; j++) {
        const shared = intersections[i].walls.filter((w: any) => 
          intersections[j].walls.includes(w)
        );
        
        if (shared.length > 0) {
          graph.get(intersections[i].id)?.push(intersections[j].id);
          graph.get(intersections[j].id)?.push(intersections[i].id);
        }
      }
    }
    
    return graph;
  }

  private findGraphCycles(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    
    const dfs = (node: string, path: string[], parent: string | null): void => {
      visited.add(node);
      path.push(node);
      
      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path], node);
        } else if (neighbor !== parent && path.length > 2) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart));
          }
        }
      }
    };
    
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, [], null);
      }
    }
    
    // Remove duplicate cycles
    const uniqueCycles = [];
    const seen = new Set<string>();
    
    for (const cycle of cycles) {
      const key = [...cycle].sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCycles.push(cycle);
      }
    }
    
    return uniqueCycles;
  }

  private calculatePolygonArea(points: Point2D[]): number {
    let area = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    return Math.abs(area / 2);
  }

  private calculatePolygonPerimeter(points: Point2D[]): number {
    let perimeter = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    
    return perimeter;
  }

  private calculateCentroid(points: Point2D[]): Point2D {
    let cx = 0, cy = 0;
    const n = points.length;
    
    for (const point of points) {
      cx += point.x;
      cy += point.y;
    }
    
    return { x: cx / n, y: cy / n };
  }

  private calculateBoundingBox(points: Point2D[]): any {
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

  private findPolygonWalls(polygon: Point2D[], walls: WallSegment[]): WallSegment[] {
    const polygonWalls = [];
    
    for (const wall of walls) {
      // Check if wall is part of polygon boundary
      let onBoundary = false;
      
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        
        if (this.linesOverlap(
          wall.start, wall.end,
          polygon[i], polygon[j]
        )) {
          onBoundary = true;
          break;
        }
      }
      
      if (onBoundary) {
        polygonWalls.push(wall);
      }
    }
    
    return polygonWalls;
  }

  private findElementsInPolygon(polygon: Point2D[], elements: Opening[]): Opening[] {
    return elements.filter(element => 
      this.isPointInPolygon(element.position, polygon)
    );
  }

  private estimateRoomType(area: number, doorCount: number, windowCount: number): RoomType {
    // Simple heuristic for room type estimation
    if (area < 50) {
      return RoomType.CLOSET;
    } else if (area < 80 && doorCount === 1 && windowCount === 0) {
      return RoomType.BATHROOM;
    } else if (area > 150 && windowCount >= 2) {
      return RoomType.LIVING_ROOM;
    } else if (area > 100 && area < 200) {
      return RoomType.BEDROOM;
    } else if (area > 80 && area < 150 && windowCount >= 1) {
      return RoomType.KITCHEN;
    }
    
    return RoomType.UNIDENTIFIED;
  }

  private calculateRoomConfidence(
    walls: any[],
    doors: any[],
    windows: any[]
  ): number {
    // Calculate confidence based on detection quality
    let confidence = 0.5;
    
    if (walls.length >= 3) confidence += 0.2;
    if (doors.length >= 1) confidence += 0.15;
    if (windows.length >= 1) confidence += 0.15;
    
    return Math.min(confidence, 1.0);
  }

  private estimateScale(walls: WallSegment[], doors: Opening[]): number {
    // Estimate pixels per foot based on standard door width (36 inches)
    if (doors.length > 0) {
      const avgDoorWidth = doors.reduce((sum, d) => sum + d.width, 0) / doors.length;
      return avgDoorWidth / 3; // 36 inches = 3 feet
    }
    
    // Fallback: estimate based on wall thickness (assume 6 inch walls)
    if (walls.length > 0) {
      const avgThickness = walls.reduce((sum, w) => sum + w.thickness, 0) / walls.length;
      return avgThickness * 2; // 6 inches = 0.5 feet
    }
    
    return 10; // Default: 10 pixels per foot
  }

  // Utility geometry methods
  
  private pointToLineDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
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

  private lineIntersection(
    p1: Point2D, p2: Point2D,
    p3: Point2D, p4: Point2D
  ): Point2D | null {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    
    if (Math.abs(denom) < 0.0001) {
      return null; // Lines are parallel
    }
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      };
    }
    
    return null;
  }

  private linesOverlap(
    p1: Point2D, p2: Point2D,
    p3: Point2D, p4: Point2D
  ): boolean {
    // Check if two line segments overlap
    const threshold = 10;
    
    const dist1 = this.pointToLineDistance(p1, p3, p4);
    const dist2 = this.pointToLineDistance(p2, p3, p4);
    const dist3 = this.pointToLineDistance(p3, p1, p2);
    const dist4 = this.pointToLineDistance(p4, p1, p2);
    
    return dist1 < threshold && dist2 < threshold && 
           dist3 < threshold && dist4 < threshold;
  }

  private isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
    let inside = false;
    const n = polygon.length;
    
    let p1x = polygon[0].x;
    let p1y = polygon[0].y;
    
    for (let i = 1; i <= n; i++) {
      const p2x = polygon[i % n].x;
      const p2y = polygon[i % n].y;
      
      if (point.y > Math.min(p1y, p2y)) {
        if (point.y <= Math.max(p1y, p2y)) {
          if (point.x <= Math.max(p1x, p2x)) {
            let xinters: number;
            if (p1y !== p2y) {
              xinters = (point.y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x;
            } else {
              xinters = point.x;
            }
            if (p1x === p2x || point.x <= xinters) {
              inside = !inside;
            }
          }
        }
      }
      
      p1x = p2x;
      p1y = p2y;
    }
    
    return inside;
  }

  private isPointOnWall(point: Point2D, wall: WallSegment): boolean {
    const distance = this.pointToLineDistance(point, wall.start, wall.end);
    return distance < wall.thickness;
  }

  private mergeWallSegments(wall1: WallSegment, wall2: WallSegment): WallSegment {
    // Find the extreme points
    const points = [wall1.start, wall1.end, wall2.start, wall2.end];
    let maxDist = 0;
    let start = points[0];
    let end = points[1];
    
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dist = Math.sqrt(
          Math.pow(points[j].x - points[i].x, 2) +
          Math.pow(points[j].y - points[i].y, 2)
        );
        
        if (dist > maxDist) {
          maxDist = dist;
          start = points[i];
          end = points[j];
        }
      }
    }
    
    return {
      start,
      end,
      thickness: (wall1.thickness + wall2.thickness) / 2,
      length: maxDist,
      angle: Math.atan2(end.y - start.y, end.x - start.x),
      type: wall1.type,
      confidence: (wall1.confidence + wall2.confidence) / 2
    };
  }

  private isArcShape(points: Point2D[]): boolean {
    if (points.length < 5) return false;
    
    // Check if points form an arc by testing curvature
    const center = this.calculateCentroid(points);
    const radii = points.map(p => 
      Math.sqrt(Math.pow(p.x - center.x, 2) + Math.pow(p.y - center.y, 2))
    );
    
    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    const variance = radii.reduce((sum, r) => sum + Math.pow(r - avgRadius, 2), 0) / radii.length;
    
    // Low variance indicates circular shape
    return variance / (avgRadius * avgRadius) < 0.1;
  }

  private calculateAverageRadius(points: Point2D[], center: Point2D): number {
    const radii = points.map(p => 
      Math.sqrt(Math.pow(p.x - center.x, 2) + Math.pow(p.y - center.y, 2))
    );
    
    return radii.reduce((a, b) => a + b, 0) / radii.length;
  }
}

// Export singleton instance
export const roomDetectionService = new RoomDetectionService();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { roomDetectionService } from './services/vision/room-detection.service';

// Detect rooms in a floor plan
const detectionResult = await roomDetectionService.detectRooms(imageBuffer, {
  minRoomArea: 50,      // Minimum 50 sq ft
  maxRoomArea: 1000,    // Maximum 1000 sq ft
  wallThicknessRange: { min: 5, max: 30 },
  doorWidthRange: { min: 24, max: 48 },
  windowWidthRange: { min: 20, max: 80 },
  confidenceThreshold: 0.6
});

// Access detected elements
console.log(`Found ${detectionResult.rooms.length} rooms`);
console.log(`Detected ${detectionResult.walls.length} walls`);
console.log(`Found ${detectionResult.doors.length} doors`);
console.log(`Found ${detectionResult.windows.length} windows`);

// Process each room
for (const room of detectionResult.rooms) {
  console.log(`Room ${room.id}:`);
  console.log(`  Type: ${room.type}`);
  console.log(`  Area: ${room.area} sq ft`);
  console.log(`  Doors: ${room.doors.length}`);
  console.log(`  Windows: ${room.windows.length}`);
  console.log(`  Confidence: ${(room.confidence * 100).toFixed(1)}%`);
}

// Scale information
console.log(`Scale: ${detectionResult.metadata.scale} pixels per foot`);
*/