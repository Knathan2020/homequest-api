/**
 * Canvas-based Wall Detection Service
 * Uses pixel analysis to detect actual walls in floor plans
 */

import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import persistenceService from './floor-plan-persistence.service';

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
}

interface DoorDetection {
  id: string;
  position: Point;
  width: number;
  orientation: 'horizontal' | 'vertical';
  confidence: number;
}

interface WindowDetection {
  id: string;
  position: Point;
  width: number;
  height: number;
  confidence: number;
}

export class CanvasWallDetectorService {
  private canvas: Canvas | null = null;
  private ctx: any = null;

  /**
   * Detect walls, doors, and windows from a floor plan image
   * Automatically saves results for persistence
   */
  async detectFeatures(
    imagePath: string, 
    projectId?: string,
    userId?: string,
    autoSave: boolean = true
  ): Promise<{
    walls: WallSegment[];
    doors: DoorDetection[];
    windows: WindowDetection[];
    savedId?: string;
  }> {
    try {
      console.log('🖼️ Loading image for wall detection:', imagePath);
      
      // Load image
      const image = await loadImage(imagePath);
      
      // Create canvas
      this.canvas = createCanvas(image.width, image.height);
      this.ctx = this.canvas.getContext('2d');
      
      // Draw image to canvas
      this.ctx.drawImage(image, 0, 0);
      
      // Get image data
      const imageData = this.ctx.getImageData(0, 0, image.width, image.height);
      
      // Detect walls using edge detection and line analysis
      const allWalls = await this.detectWalls(imageData);
      
      // Detect doors from wall gaps
      const doors = await this.detectDoors(allWalls, imageData);
      
      // Detect windows from wall patterns
      const windows = await this.detectWindows(allWalls, imageData);
      
      // Filter walls to remove segments that are actually doors or windows
      const walls = this.filterWalls(allWalls, doors, windows);
      
      console.log(`✅ Detection complete: ${walls.length} walls (filtered from ${allWalls.length}), ${doors.length} doors, ${windows.length} windows`);
      
      const results = { walls, doors, windows };
      
      // Auto-save detection results if enabled
      if (autoSave && projectId) {
        const saveResult = await persistenceService.autoSaveDetection(
          projectId,
          imagePath,
          {
            ...results,
            dimensions: {
              width: image.width,
              height: image.height
            },
            method: 'canvas-wall-detection'
          },
          userId
        );
        
        if (saveResult.success) {
          console.log('💾 Detection results auto-saved with ID:', saveResult.id);
          return { ...results, savedId: saveResult.id };
        }
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error detecting features:', error);
      return { walls: [], doors: [], windows: [] };
    }
  }
  
  /**
   * Filter walls to remove segments that are doors or windows
   */
  private filterWalls(
    walls: WallSegment[], 
    doors: DoorDetection[], 
    windows: WindowDetection[]
  ): WallSegment[] {
    return walls.filter(wall => {
      const wallLength = this.pointDistance(wall.start, wall.end);
      
      // Remove very short segments that might be noise
      if (wallLength < 50) return false;
      
      // Check if this wall segment overlaps with a door
      for (const door of doors) {
        const distToStart = this.pointToLineDistance(door.position, wall.start, wall.end);
        if (distToStart < door.width / 2) {
          // This segment might be part of a door opening
          const projectedPoint = this.projectPointOntoLine(door.position, wall.start, wall.end);
          const distAlongWall = this.pointDistance(wall.start, projectedPoint);
          if (distAlongWall > 10 && distAlongWall < wallLength - 10) {
            // Door is in the middle of this wall, split the wall
            return false; // Remove this wall, it will be split
          }
        }
      }
      
      // Check if this wall segment overlaps with a window
      for (const window of windows) {
        const distToWindow = this.pointToLineDistance(window.position, wall.start, wall.end);
        if (distToWindow < 10) {
          // Window is on this wall, but don't remove the wall
          // Windows don't break walls like doors do
        }
      }
      
      return true;
    });
  }
  
  /**
   * Calculate distance from point to line
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
    
    let xx: number, yy: number;
    
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
   * Project point onto line
   */
  private projectPointOntoLine(point: Point, lineStart: Point, lineEnd: Point): Point {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : 0;
    
    return {
      x: lineStart.x + param * C,
      y: lineStart.y + param * D
    };
  }

  /**
   * Detect walls using edge detection and Hough transform
   */
  private async detectWalls(imageData: ImageData): Promise<WallSegment[]> {
    const walls: WallSegment[] = [];
    const { width, height, data } = imageData;
    
    // Convert to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayscale[i / 4] = gray;
    }
    
    // Method 1: Detect filled walls (gray areas between dark lines)
    const filledWalls = this.detectFilledWalls(imageData, grayscale);
    walls.push(...filledWalls);
    
    // Method 2: Detect bold dark lines (single thick walls)
    const boldWalls = this.detectBoldWalls(imageData, grayscale);
    
    // Method 3: Traditional edge detection for remaining walls
    const edges = this.sobelEdgeDetection(grayscale, width, height);
    const lines = this.houghTransform(edges, width, height);
    const wallGroups = this.groupParallelLines(lines);
    
    // Create wall segments from groups
    for (const group of wallGroups) {
      if (group.length >= 1) {
        const wall = this.createWallFromLines(group);
        if (wall && this.isRealWall(wall, imageData, grayscale)) {
          // Check if this wall already exists from filled/bold detection
          const exists = walls.some(w => 
            this.wallsOverlap(w, wall)
          );
          if (!exists) {
            walls.push(wall);
          }
        }
      }
    }
    
    // Merge bold walls that aren't duplicates
    for (const boldWall of boldWalls) {
      const exists = walls.some(w => this.wallsOverlap(w, boldWall));
      if (!exists) {
        walls.push(boldWall);
      }
    }
    
    return walls;
  }
  
  /**
   * Detect walls with gray fill between parallel dark lines
   */
  private detectFilledWalls(imageData: ImageData, grayscale: Uint8Array): WallSegment[] {
    const walls: WallSegment[] = [];
    const { width, height } = imageData;
    
    // Scan for regions with gray fill (120-200) bounded by dark lines (<80)
    for (let y = 0; y < height; y += 10) {
      let inWall = false;
      let wallStart = -1;
      let grayPixels = 0;
      
      for (let x = 0; x < width; x++) {
        const gray = grayscale[y * width + x];
        
        if (gray < 80) {
          // Dark pixel - potential wall boundary
          if (!inWall && wallStart === -1) {
            wallStart = x;
            inWall = true;
            grayPixels = 0;
          } else if (inWall && grayPixels > 5) {
            // End of filled wall
            const thickness = x - wallStart;
            if (thickness > 8 && thickness < 40 && grayPixels > thickness * 0.6) {
              // Found a filled wall segment
              walls.push({
                id: `wall_filled_${walls.length}`,
                start: { x: wallStart, y },
                end: { x: x, y },
                thickness: thickness,
                type: thickness > 15 ? 'exterior' : 'interior',
                confidence: 0.95
              });
            }
            wallStart = x;
            grayPixels = 0;
          }
        } else if (gray > 120 && gray < 200 && inWall) {
          // Gray fill between walls
          grayPixels++;
        } else if (gray > 200) {
          // White space - reset
          if (inWall && grayPixels < 3) {
            // Was just a single dark line, not a filled wall
          }
          inWall = false;
          wallStart = -1;
          grayPixels = 0;
        }
      }
    }
    
    // Similar scan for vertical walls
    for (let x = 0; x < width; x += 10) {
      let inWall = false;
      let wallStart = -1;
      let grayPixels = 0;
      
      for (let y = 0; y < height; y++) {
        const gray = grayscale[y * width + x];
        
        if (gray < 80) {
          // Dark pixel - potential wall boundary
          if (!inWall && wallStart === -1) {
            wallStart = y;
            inWall = true;
            grayPixels = 0;
          } else if (inWall && grayPixels > 5) {
            // End of filled wall
            const thickness = y - wallStart;
            if (thickness > 8 && thickness < 40 && grayPixels > thickness * 0.6) {
              // Found a filled wall segment
              walls.push({
                id: `wall_filled_v_${walls.length}`,
                start: { x, y: wallStart },
                end: { x, y: y },
                thickness: thickness,
                type: thickness > 15 ? 'exterior' : 'interior',
                confidence: 0.95
              });
            }
            wallStart = y;
            grayPixels = 0;
          }
        } else if (gray > 120 && gray < 200 && inWall) {
          // Gray fill between walls
          grayPixels++;
        } else if (gray > 200) {
          // White space - reset
          inWall = false;
          wallStart = -1;
          grayPixels = 0;
        }
      }
    }
    
    return walls;
  }
  
  /**
   * Detect bold/thick dark lines that are walls
   */
  private detectBoldWalls(imageData: ImageData, grayscale: Uint8Array): WallSegment[] {
    const walls: WallSegment[] = [];
    const { width, height } = imageData;
    
    // Scan for continuous thick dark lines
    // Horizontal scan
    for (let y = 5; y < height - 5; y += 8) {
      let lineStart = -1;
      let lineLength = 0;
      
      for (let x = 0; x < width; x++) {
        // Check thickness at this point
        let thickness = 0;
        for (let dy = -10; dy <= 10; dy++) {
          if (y + dy >= 0 && y + dy < height) {
            if (grayscale[(y + dy) * width + x] < 60) {
              thickness++;
            }
          }
        }
        
        if (thickness >= 6) {
          // Thick dark area
          if (lineStart === -1) {
            lineStart = x;
            lineLength = 1;
          } else {
            lineLength++;
          }
        } else {
          // End of thick line
          if (lineStart !== -1 && lineLength > 50) {
            walls.push({
              id: `wall_bold_h_${walls.length}`,
              start: { x: lineStart, y },
              end: { x: lineStart + lineLength, y },
              thickness: thickness,
              type: thickness > 10 ? 'exterior' : 'interior',
              confidence: 0.9
            });
          }
          lineStart = -1;
          lineLength = 0;
        }
      }
    }
    
    // Vertical scan
    for (let x = 5; x < width - 5; x += 8) {
      let lineStart = -1;
      let lineLength = 0;
      
      for (let y = 0; y < height; y++) {
        // Check thickness at this point
        let thickness = 0;
        for (let dx = -10; dx <= 10; dx++) {
          if (x + dx >= 0 && x + dx < width) {
            if (grayscale[y * width + (x + dx)] < 60) {
              thickness++;
            }
          }
        }
        
        if (thickness >= 6) {
          // Thick dark area
          if (lineStart === -1) {
            lineStart = y;
            lineLength = 1;
          } else {
            lineLength++;
          }
        } else {
          // End of thick line
          if (lineStart !== -1 && lineLength > 50) {
            walls.push({
              id: `wall_bold_v_${walls.length}`,
              start: { x, y: lineStart },
              end: { x, y: lineStart + lineLength },
              thickness: thickness,
              type: thickness > 10 ? 'exterior' : 'interior',
              confidence: 0.9
            });
          }
          lineStart = -1;
          lineLength = 0;
        }
      }
    }
    
    return walls;
  }
  
  /**
   * Check if detected line is a real wall based on darkness and thickness
   */
  private isRealWall(wall: WallSegment, imageData: ImageData, grayscale: Uint8Array): boolean {
    const { width } = imageData;
    
    // Sample points along the wall
    const samples = 20;
    let darkPixels = 0;
    let avgDarkness = 0;
    
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const x = Math.round(wall.start.x + t * (wall.end.x - wall.start.x));
      const y = Math.round(wall.start.y + t * (wall.end.y - wall.start.y));
      
      if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
        const gray = grayscale[y * width + x];
        if (gray < 100) {
          darkPixels++;
          avgDarkness += gray;
        }
      }
    }
    
    // Wall should be consistently dark
    if (darkPixels < samples * 0.7) return false;
    
    // Average darkness should be very dark (bold lines)
    if (darkPixels > 0) {
      avgDarkness /= darkPixels;
      if (avgDarkness > 80) return false; // Not dark enough for a wall
    }
    
    // Check thickness is consistent with walls
    if (wall.thickness < 5) return false; // Too thin
    if (wall.thickness > 50) return false; // Too thick (might be a filled area)
    
    return true;
  }
  
  /**
   * Check if two walls overlap
   */
  private wallsOverlap(wall1: WallSegment, wall2: WallSegment): boolean {
    // Check if walls are parallel and close
    const angle1 = Math.atan2(wall1.end.y - wall1.start.y, wall1.end.x - wall1.start.x);
    const angle2 = Math.atan2(wall2.end.y - wall2.start.y, wall2.end.x - wall2.start.x);
    
    const angleDiff = Math.abs(angle1 - angle2);
    if (angleDiff > 0.2 && angleDiff < Math.PI - 0.2) {
      return false; // Not parallel
    }
    
    // Check if they overlap spatially
    const dist1 = this.pointToLineDistance(wall1.start, wall2.start, wall2.end);
    const dist2 = this.pointToLineDistance(wall1.end, wall2.start, wall2.end);
    
    return (dist1 < 20 && dist2 < 20);
  }

  /**
   * Sobel edge detection
   */
  private sobelEdgeDetection(grayscale: Uint8Array, width: number, height: number): Uint8Array {
    const edges = new Uint8Array(width * height);
    
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const idx = (y + j) * width + (x + i);
            const kernelIdx = (j + 1) * 3 + (i + 1);
            gx += grayscale[idx] * sobelX[kernelIdx];
            gy += grayscale[idx] * sobelY[kernelIdx];
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = magnitude > 150 ? 255 : 0; // Even higher threshold for walls only
      }
    }
    
    return edges;
  }

  /**
   * Simplified Hough transform for line detection with gap analysis
   */
  private houghTransform(edges: Uint8Array, width: number, height: number): Array<{
    start: Point;
    end: Point;
    angle: number;
    strength: number;
    gaps?: Array<{start: number; end: number}>;
  }> {
    const lines: Array<{ start: Point; end: Point; angle: number; strength: number; gaps?: Array<{start: number; end: number}> }> = [];
    
    // Scan for horizontal lines with gap detection
    for (let y = 0; y < height; y += 5) {
      let lineStart = -1;
      let lineLength = 0;
      const gaps: Array<{start: number; end: number}> = [];
      let gapStart = -1;
      
      for (let x = 0; x < width; x++) {
        if (edges[y * width + x] > 0) {
          if (lineStart === -1) {
            lineStart = x;
            lineLength = 1;
          } else {
            lineLength++;
            // Check if we're ending a gap
            if (gapStart !== -1) {
              const gapWidth = x - gapStart;
              if (gapWidth > 15 && gapWidth < 80) { // Potential door/window gap
                gaps.push({start: gapStart, end: x});
              }
              gapStart = -1;
            }
          }
        } else {
          // We're in empty space
          if (lineStart !== -1 && gapStart === -1) {
            gapStart = x; // Start tracking a gap
          }
          
          // Check if line segment is ending
          if (lineStart !== -1 && x - (lineStart + lineLength) > 100) {
            // Line has ended, save it if long enough
            if (lineLength > 60) {
              lines.push({
                start: { x: lineStart, y },
                end: { x: lineStart + lineLength, y },
                angle: 0,
                strength: lineLength,
                gaps: gaps.length > 0 ? [...gaps] : undefined
              });
            }
            lineStart = -1;
            lineLength = 0;
            gaps.length = 0;
            gapStart = -1;
          }
        }
      }
      
      // Save any remaining line
      if (lineStart !== -1 && lineLength > 60) {
        lines.push({
          start: { x: lineStart, y },
          end: { x: lineStart + lineLength, y },
          angle: 0,
          strength: lineLength,
          gaps: gaps.length > 0 ? [...gaps] : undefined
        });
      }
    }
    
    // Scan for vertical lines with gap detection
    for (let x = 0; x < width; x += 5) {
      let lineStart = -1;
      let lineLength = 0;
      const gaps: Array<{start: number; end: number}> = [];
      let gapStart = -1;
      
      for (let y = 0; y < height; y++) {
        if (edges[y * width + x] > 0) {
          if (lineStart === -1) {
            lineStart = y;
            lineLength = 1;
          } else {
            lineLength++;
            // Check if we're ending a gap
            if (gapStart !== -1) {
              const gapHeight = y - gapStart;
              if (gapHeight > 15 && gapHeight < 80) { // Potential door/window gap
                gaps.push({start: gapStart, end: y});
              }
              gapStart = -1;
            }
          }
        } else {
          // We're in empty space
          if (lineStart !== -1 && gapStart === -1) {
            gapStart = y; // Start tracking a gap
          }
          
          // Check if line segment is ending
          if (lineStart !== -1 && y - (lineStart + lineLength) > 100) {
            // Line has ended, save it if long enough
            if (lineLength > 60) {
              lines.push({
                start: { x, y: lineStart },
                end: { x, y: lineStart + lineLength },
                angle: Math.PI / 2,
                strength: lineLength,
                gaps: gaps.length > 0 ? [...gaps] : undefined
              });
            }
            lineStart = -1;
            lineLength = 0;
            gaps.length = 0;
            gapStart = -1;
          }
        }
      }
      
      // Save any remaining line
      if (lineStart !== -1 && lineLength > 60) {
        lines.push({
          start: { x, y: lineStart },
          end: { x, y: lineStart + lineLength },
          angle: Math.PI / 2,
          strength: lineLength,
          gaps: gaps.length > 0 ? [...gaps] : undefined
        });
      }
    }
    
    return lines;
  }

  /**
   * Group parallel lines that might form walls
   */
  private groupParallelLines(lines: Array<{ start: Point; end: Point; angle: number; strength: number; gaps?: Array<{start: number; end: number}> }>): Array<Array<any>> {
    const groups: Array<Array<any>> = [];
    const used = new Set<number>();
    
    // First, filter out lines that are too weak or have too many gaps
    const validLines = lines.filter(line => {
      // Strong continuous lines are more likely to be walls
      if (line.gaps && line.gaps.length > 2) return false; // Too many gaps, probably not a wall
      if (line.strength < 80) return false; // Too short/weak
      return true;
    });
    
    for (let i = 0; i < validLines.length; i++) {
      if (used.has(i)) continue;
      
      const group = [validLines[i]];
      used.add(i);
      
      for (let j = i + 1; j < validLines.length; j++) {
        if (used.has(j)) continue;
        
        // Check if lines are parallel (similar angle)
        const angleDiff = Math.abs(validLines[i].angle - validLines[j].angle);
        if (angleDiff < 0.1 || angleDiff > Math.PI - 0.1) {
          // Check if lines are close enough to be a wall
          const distance = this.lineToLineDistance(validLines[i], validLines[j]);
          if (distance < 30 && distance > 3) { // Wall thickness typically 3-30 pixels
            // Additional check: lines should overlap in their primary direction
            if (this.linesOverlap(validLines[i], validLines[j])) {
              group.push(validLines[j]);
              used.add(j);
            }
          }
        }
      }
      
      // Only keep groups that form substantial walls
      if (group.length >= 1 && this.calculateGroupStrength(group) > 100) {
        groups.push(group);
      }
    }
    
    return groups;
  }
  
  /**
   * Check if two lines overlap in their primary direction
   */
  private linesOverlap(line1: any, line2: any): boolean {
    if (Math.abs(line1.angle) < Math.PI / 4) {
      // Horizontal lines - check x overlap
      const x1Min = Math.min(line1.start.x, line1.end.x);
      const x1Max = Math.max(line1.start.x, line1.end.x);
      const x2Min = Math.min(line2.start.x, line2.end.x);
      const x2Max = Math.max(line2.start.x, line2.end.x);
      return !(x1Max < x2Min || x2Max < x1Min);
    } else {
      // Vertical lines - check y overlap
      const y1Min = Math.min(line1.start.y, line1.end.y);
      const y1Max = Math.max(line1.start.y, line1.end.y);
      const y2Min = Math.min(line2.start.y, line2.end.y);
      const y2Max = Math.max(line2.start.y, line2.end.y);
      return !(y1Max < y2Min || y2Max < y1Min);
    }
  }
  
  /**
   * Calculate total strength of a group of lines
   */
  private calculateGroupStrength(group: Array<any>): number {
    return group.reduce((sum, line) => sum + line.strength, 0) / group.length;
  }

  /**
   * Calculate distance between two lines
   */
  private lineToLineDistance(line1: any, line2: any): number {
    // Simplified: use distance between start points
    const dx = line1.start.x - line2.start.x;
    const dy = line1.start.y - line2.start.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Create a wall segment from grouped lines
   */
  private createWallFromLines(lines: Array<any>): WallSegment | null {
    if (lines.length === 0) return null;
    
    // Use the longest line as the main wall
    const mainLine = lines.reduce((max, line) => 
      line.strength > max.strength ? line : max, lines[0]);
    
    // Calculate wall thickness from parallel lines
    const thickness = lines.length > 1 
      ? this.lineToLineDistance(lines[0], lines[lines.length - 1])
      : 6; // Default thickness
    
    return {
      id: `wall_${Math.random().toString(36).substr(2, 9)}`,
      start: mainLine.start,
      end: mainLine.end,
      thickness: thickness,
      type: thickness > 10 ? 'exterior' : 'interior',
      confidence: Math.min(mainLine.strength / 100, 0.95)
    };
  }

  /**
   * Detect doors from wall gaps and arc patterns
   */
  private async detectDoors(walls: WallSegment[], imageData: ImageData): Promise<DoorDetection[]> {
    const doors: DoorDetection[] = [];
    const { width, height, data } = imageData;
    
    // Method 1: Look for gaps between aligned walls
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const gap = this.findWallGap(walls[i], walls[j]);
        
        if (gap && gap.width > 25 && gap.width < 50) { // Typical door width
          // Verify this is a door by checking for arc pattern nearby
          const hasArc = this.checkForDoorArc(gap.center, gap.width, imageData);
          
          doors.push({
            id: `door_${doors.length + 1}`,
            position: gap.center,
            width: gap.width,
            orientation: gap.orientation,
            confidence: hasArc ? 0.9 : 0.7
          });
        }
      }
    }
    
    // Method 2: Look for arc patterns (door swing indicators)
    const arcDoors = this.detectDoorArcs(imageData);
    for (const arcDoor of arcDoors) {
      // Check if we already detected this door
      const exists = doors.some(d => 
        Math.abs(d.position.x - arcDoor.position.x) < 30 &&
        Math.abs(d.position.y - arcDoor.position.y) < 30
      );
      
      if (!exists) {
        doors.push(arcDoor);
      }
    }
    
    return doors;
  }
  
  /**
   * Check for door arc pattern at a position
   */
  private checkForDoorArc(center: Point, width: number, imageData: ImageData): boolean {
    const { data, width: imgWidth } = imageData;
    const radius = width * 0.8;
    let arcPixels = 0;
    let totalChecked = 0;
    
    // Sample points along a quarter circle arc
    for (let angle = 0; angle < Math.PI / 2; angle += 0.1) {
      const x = Math.round(center.x + radius * Math.cos(angle));
      const y = Math.round(center.y + radius * Math.sin(angle));
      
      if (x >= 0 && x < imgWidth && y >= 0 && y < imageData.height) {
        const idx = (y * imgWidth + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (gray < 100) arcPixels++; // Dark pixel (potential arc)
        totalChecked++;
      }
    }
    
    return totalChecked > 0 && (arcPixels / totalChecked) > 0.3;
  }
  
  /**
   * Detect door arcs in the image
   */
  private detectDoorArcs(imageData: ImageData): DoorDetection[] {
    const doors: DoorDetection[] = [];
    const { width, height } = imageData;
    
    // Simplified arc detection - scan for quarter circle patterns
    // In a real implementation, this would use more sophisticated pattern matching
    
    return doors;
  }

  /**
   * Find gap between two walls
   */
  private findWallGap(wall1: WallSegment, wall2: WallSegment): {
    center: Point;
    width: number;
    orientation: 'horizontal' | 'vertical';
  } | null {
    // Check if walls are aligned
    const angle1 = Math.atan2(wall1.end.y - wall1.start.y, wall1.end.x - wall1.start.x);
    const angle2 = Math.atan2(wall2.end.y - wall2.start.y, wall2.end.x - wall2.start.x);
    
    if (Math.abs(angle1 - angle2) > 0.1) return null;
    
    // Calculate gap
    const dist1 = this.pointDistance(wall1.end, wall2.start);
    const dist2 = this.pointDistance(wall1.start, wall2.end);
    
    const minDist = Math.min(dist1, dist2);
    
    if (minDist < 20 || minDist > 60) return null;
    
    const center = {
      x: (wall1.end.x + wall2.start.x) / 2,
      y: (wall1.end.y + wall2.start.y) / 2
    };
    
    return {
      center,
      width: minDist,
      orientation: Math.abs(angle1) < Math.PI / 4 ? 'horizontal' : 'vertical'
    };
  }

  /**
   * Calculate distance between two points
   */
  private pointDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Detect windows from wall patterns and double lines
   */
  private async detectWindows(walls: WallSegment[], imageData: ImageData): Promise<WindowDetection[]> {
    const windows: WindowDetection[] = [];
    const { width, height, data } = imageData;
    
    for (const wall of walls) {
      // Windows are typically in exterior walls (thicker)
      if (wall.thickness > 8) {
        // Scan along the wall for window patterns
        const wallVector = {
          x: wall.end.x - wall.start.x,
          y: wall.end.y - wall.start.y
        };
        const wallLength = Math.sqrt(wallVector.x * wallVector.x + wallVector.y * wallVector.y);
        const wallNormal = {
          x: -wallVector.y / wallLength,
          y: wallVector.x / wallLength
        };
        
        // Check for window patterns along the wall
        const numChecks = Math.floor(wallLength / 20);
        for (let i = 0; i < numChecks; i++) {
          const t = i / numChecks;
          const checkPoint = {
            x: wall.start.x + t * wallVector.x,
            y: wall.start.y + t * wallVector.y
          };
          
          // Look for double parallel lines (window frame pattern)
          if (this.checkForWindowPattern(checkPoint, wallNormal, imageData)) {
            // Found potential window
            const windowWidth = this.measureWindowWidth(checkPoint, wallVector, imageData);
            
            if (windowWidth > 20 && windowWidth < 60) {
              // Check if we already have a window nearby
              const exists = windows.some(w => 
                Math.abs(w.position.x - checkPoint.x) < 30 &&
                Math.abs(w.position.y - checkPoint.y) < 30
              );
              
              if (!exists) {
                windows.push({
                  id: `window_${windows.length + 1}`,
                  position: checkPoint,
                  width: windowWidth,
                  height: windowWidth * 1.2, // Windows are usually taller than wide
                  confidence: 0.75
                });
                
                // Skip ahead to avoid duplicate detections
                i += Math.floor(windowWidth / 20);
              }
            }
          }
        }
      }
    }
    
    return windows;
  }
  
  /**
   * Check for window pattern (double lines)
   */
  private checkForWindowPattern(point: Point, normal: Point, imageData: ImageData): boolean {
    const { data, width } = imageData;
    
    // Check for parallel lines perpendicular to wall
    let line1Found = false;
    let line2Found = false;
    
    for (let offset = -15; offset <= 15; offset++) {
      const x = Math.round(point.x + normal.x * offset);
      const y = Math.round(point.y + normal.y * offset);
      
      if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        
        if (gray < 100) { // Dark pixel
          if (!line1Found) {
            line1Found = true;
          } else if (Math.abs(offset) > 5) {
            line2Found = true;
          }
        }
      }
    }
    
    return line1Found && line2Found;
  }
  
  /**
   * Measure window width
   */
  private measureWindowWidth(center: Point, wallVector: Point, imageData: ImageData): number {
    const { data, width } = imageData;
    const wallLength = Math.sqrt(wallVector.x * wallVector.x + wallVector.y * wallVector.y);
    const unitVector = { x: wallVector.x / wallLength, y: wallVector.y / wallLength };
    
    let leftEdge = 0;
    let rightEdge = 0;
    
    // Find left edge
    for (let offset = 0; offset < 50; offset++) {
      const x = Math.round(center.x - unitVector.x * offset);
      const y = Math.round(center.y - unitVector.y * offset);
      
      if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (gray < 100) {
          leftEdge = offset;
          break;
        }
      }
    }
    
    // Find right edge
    for (let offset = 0; offset < 50; offset++) {
      const x = Math.round(center.x + unitVector.x * offset);
      const y = Math.round(center.y + unitVector.y * offset);
      
      if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (gray < 100) {
          rightEdge = offset;
          break;
        }
      }
    }
    
    return leftEdge + rightEdge;
  }
}

export default CanvasWallDetectorService;