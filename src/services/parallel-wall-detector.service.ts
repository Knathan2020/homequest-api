/**
 * Parallel Wall Detector Service
 * Detects walls that appear as two parallel black lines with white/gray space between
 * Walls are typically 6-10 pixels apart with consistent spacing
 */

import { createCanvas, loadImage, Canvas } from 'canvas';

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
  hasWhiteInterior: boolean; // Track if wall has white space between parallel lines
  interiorDarkness?: number; // Average darkness of space BETWEEN parallel lines (0-255, lower is darker)
}

export class ParallelWallDetectorService {
  private canvas: Canvas | null = null;
  private ctx: any = null;

  /**
   * Detect walls from a floor plan image
   */
  async detectWalls(imagePath: string): Promise<WallSegment[]> {
    try {
      console.log('🏗️ Detecting parallel line walls from:', imagePath);
      
      // Load image
      const image = await loadImage(imagePath);
      
      // Create canvas
      this.canvas = createCanvas(image.width, image.height);
      this.ctx = this.canvas.getContext('2d');
      
      // Draw image to canvas
      this.ctx.drawImage(image, 0, 0);
      
      // Get image data
      const imageData = this.ctx.getImageData(0, 0, image.width, image.height);
      
      // Step 1: Determine which detection path to use
      const detectionPath = this.determineDetectionPath(imageData);
      console.log(`\n🎯 Floor plan type: ${detectionPath.toUpperCase()}`);
      
      // Step 2: Use the appropriate detection method
      let walls: WallSegment[] = [];
      
      switch(detectionPath) {
        case 'black':
          console.log('⬛ Using BLACK wall detection');
          walls = this.detectSolidBlackWalls(imageData.data, imageData.width, imageData.height);
          break;
          
        case 'gray':
          console.log('🔘 Using GRAY scale detection');
          // Use the general detection for gray walls since they're similar to the scan method
          // but we'll classify them based on gray levels
          walls = this.detectParallelWalls(imageData);
          
          // Enhance detection by classifying walls based on their gray levels
          walls = walls.map(wall => {
            const samples = this.sampleWallPixels(wall, imageData.data, imageData.width);
            const avgGray = samples.reduce((sum, val) => sum + val, 0) / samples.length;
            
            // Classify based on gray level
            if (avgGray < 80) {
              wall.type = 'exterior';  // Dark gray/black = exterior
              wall.confidence = 0.95;
            } else if (avgGray < 150) {
              wall.type = 'interior';  // Medium gray = interior structural
              wall.confidence = 0.85;
            } else {
              wall.type = 'interior';  // Light gray = interior partition
              wall.confidence = 0.75;
            }
            
            return wall;
          });
          
          console.log(`  Detected ${walls.length} gray walls`);
          break;
          
        case 'parallel':
          console.log('═══ Using PARALLEL line detection');
          const vertWalls = this.detectVerticalWalls(imageData.data, imageData.width, imageData.height);
          const horzWalls = this.detectHorizontalWalls(imageData.data, imageData.width, imageData.height);
          walls = [...vertWalls, ...horzWalls];
          break;
          
        case 'thin':
          console.log('─── Using THIN line detection');
          // Use the scan method for thin lines
          walls = this.detectParallelWalls(imageData);
          break;
          
        case 'pattern':
          console.log('▓▓▓ Using PATTERN detection');
          // For now, use parallel detection as fallback
          walls = this.detectParallelWalls(imageData);
          break;
          
        default:
          console.log('🔍 Using MIXED detection');
          walls = this.detectParallelWalls(imageData);
      }
      
      console.log(`  Found ${walls.length} walls using ${detectionPath} detection`);
      
      // Step 3: Classify by position (perimeter = exterior, inside = interior)
      const classifiedWalls = this.classifyWallsByLocation(walls, imageData);
      
      // Step 4: Analyze structural importance by color
      const finalWalls = this.analyzeStructuralImportance(classifiedWalls, imageData);
      
      // Merge overlapping walls and remove duplicates
      const mergedWalls = this.mergeOverlappingWalls(finalWalls);
      
      console.log(`✅ Found ${classifiedWalls.length} walls, merged to ${mergedWalls.length} unique walls`);
      
      // Log wall coordinates for debugging
      console.log('\n📍 Wall Coordinates:');
      mergedWalls.forEach((wall, idx) => {
        console.log(`Wall ${idx + 1} [${wall.type}]: (${Math.round(wall.start.x)}, ${Math.round(wall.start.y)}) to (${Math.round(wall.end.x)}, ${Math.round(wall.end.y)}) - thickness: ${wall.thickness}px`);
      });
      
      return mergedWalls;
    } catch (error) {
      console.error('❌ Error detecting walls:', error);
      return [];
    }
  }
  
  /**
   * Determine which detection path to use based on floor plan analysis
   */
  private determineDetectionPath(imageData: ImageData): string {
    const { data, width, height } = imageData;
    
    // Sample the image to determine predominant wall style
    let blackPixels = 0;
    let grayPixels = 0;
    let parallelLines = 0;
    let thinLines = 0;
    let patterns = 0;
    
    // Sample every 10th pixel for efficiency
    for (let y = 50; y < height - 50; y += 10) {
      for (let x = 50; x < width - 50; x += 10) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const gray = (r + g + b) / 3;
        
        if (gray < 50) {
          blackPixels++;
        } else if (gray >= 50 && gray < 200) {
          grayPixels++;
        }
        
        // Check for parallel lines
        if (this.hasParallelLinePattern(data, width, x, y)) {
          parallelLines++;
        }
        
        // Check for thin single lines
        if (this.hasThinLinePattern(data, width, x, y)) {
          thinLines++;
        }
        
        // Check for patterns
        if (this.hasPatternedWall(data, width, x, y)) {
          patterns++;
        }
      }
    }
    
    // Determine predominant style
    const total = blackPixels + grayPixels;
    
    if (parallelLines > total * 0.3) return 'parallel';
    if (blackPixels > total * 0.4) return 'black';
    if (grayPixels > total * 0.4) return 'gray';
    if (patterns > total * 0.2) return 'pattern';
    if (thinLines > total * 0.3) return 'thin';
    
    return 'mixed'; // Use combined detection
  }
  
  /**
   * Analyze structural importance based on color darkness
   */
  private analyzeStructuralImportance(walls: WallSegment[], imageData: ImageData): WallSegment[] {
    const { data, width } = imageData;
    
    return walls.map(wall => {
      // Sample pixels along the wall
      const samples = this.sampleWallPixels(wall, data, width);
      const avgGray = samples.reduce((sum, val) => sum + val, 0) / samples.length;
      
      // Darker = more structural
      if (avgGray < 80) {
        wall.confidence = 0.95; // Very structural
      } else if (avgGray < 150) {
        wall.confidence = 0.8;  // Structural
      } else {
        wall.confidence = 0.6;  // Non-structural partition
      }
      
      return wall;
    });
  }
  
  /**
   * Sample pixels along a wall
   */
  private sampleWallPixels(wall: WallSegment, data: Uint8ClampedArray, width: number): number[] {
    const samples: number[] = [];
    const steps = 10;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(wall.start.x + (wall.end.x - wall.start.x) * t);
      const y = Math.round(wall.start.y + (wall.end.y - wall.start.y) * t);
      const idx = (y * width + x) * 4;
      
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      samples.push(gray);
    }
    
    return samples;
  }
  
  /**
   * Check for parallel line pattern at a point
   */
  private hasParallelLinePattern(data: Uint8ClampedArray, width: number, x: number, y: number): boolean {
    // Look for two dark lines with light space between
    let darkLines = 0;
    let lightSpace = false;
    
    for (let dx = 0; dx < 20; dx++) {
      const idx = (y * width + (x + dx)) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      if (gray < 100) {
        darkLines++;
      } else if (gray > 200 && darkLines === 1) {
        lightSpace = true;
      }
    }
    
    return darkLines >= 2 && lightSpace;
  }
  
  /**
   * Check for thin line pattern
   */
  private hasThinLinePattern(data: Uint8ClampedArray, width: number, x: number, y: number): boolean {
    const idx = (y * width + x) * 4;
    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    
    if (gray < 100) {
      // Check line thickness
      let thickness = 0;
      for (let dx = 0; dx < 5; dx++) {
        const checkIdx = (y * width + (x + dx)) * 4;
        const checkGray = (data[checkIdx] + data[checkIdx + 1] + data[checkIdx + 2]) / 3;
        if (checkGray < 100) thickness++;
      }
      
      return thickness >= 1 && thickness <= 3;
    }
    
    return false;
  }
  
  /**
   * Check for patterned wall
   */
  private hasPatternedWall(data: Uint8ClampedArray, width: number, x: number, y: number): boolean {
    // Look for repeating pattern (hatching, dots, dashes)
    let changes = 0;
    let lastGray = -1;
    
    for (let dx = 0; dx < 20; dx++) {
      const idx = (y * width + (x + dx)) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      if (lastGray >= 0 && Math.abs(gray - lastGray) > 50) {
        changes++;
      }
      lastGray = gray;
    }
    
    return changes >= 3; // Multiple changes indicate pattern
  }
  
  /**
   * Merge overlapping wall segments
   */
  private mergeOverlappingWalls(walls: WallSegment[]): WallSegment[] {
    const merged: WallSegment[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < walls.length; i++) {
      if (used.has(i)) continue;
      
      const wall1 = walls[i];
      let mergedWall = { ...wall1 };
      used.add(i);
      
      // Find overlapping walls
      for (let j = i + 1; j < walls.length; j++) {
        if (used.has(j)) continue;
        
        const wall2 = walls[j];
        
        // Check if walls are parallel and close
        if (this.areWallsOverlapping(mergedWall, wall2)) {
          // Merge the walls
          mergedWall = this.mergeWalls(mergedWall, wall2);
          used.add(j);
        }
      }
      
      merged.push(mergedWall);
    }
    
    return merged;
  }
  
  /**
   * Check if two walls are overlapping
   */
  private areWallsOverlapping(wall1: WallSegment, wall2: WallSegment): boolean {
    const threshold = 30; // pixels
    
    // Check if walls are roughly parallel
    const angle1 = Math.atan2(wall1.end.y - wall1.start.y, wall1.end.x - wall1.start.x);
    const angle2 = Math.atan2(wall2.end.y - wall2.start.y, wall2.end.x - wall2.start.x);
    const angleDiff = Math.abs(angle1 - angle2);
    
    if (angleDiff > 0.2 && angleDiff < Math.PI - 0.2) {
      return false; // Not parallel
    }
    
    // Check distance between walls
    const dist1 = this.pointToLineDistance(wall1.start, wall2.start, wall2.end);
    const dist2 = this.pointToLineDistance(wall1.end, wall2.start, wall2.end);
    
    return dist1 < threshold && dist2 < threshold;
  }
  
  /**
   * Merge two walls into one
   */
  private mergeWalls(wall1: WallSegment, wall2: WallSegment): WallSegment {
    // Find the extreme points
    const points = [wall1.start, wall1.end, wall2.start, wall2.end];
    
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    
    // Determine if horizontal or vertical
    const isHorizontal = (maxX - minX) > (maxY - minY);
    
    return {
      id: wall1.id,
      start: isHorizontal ? { x: minX, y: (wall1.start.y + wall2.start.y) / 2 } :
                           { x: (wall1.start.x + wall2.start.x) / 2, y: minY },
      end: isHorizontal ? { x: maxX, y: (wall1.end.y + wall2.end.y) / 2 } :
                         { x: (wall1.end.x + wall2.end.x) / 2, y: maxY },
      thickness: Math.max(wall1.thickness, wall2.thickness),
      type: wall1.type === 'exterior' || wall2.type === 'exterior' ? 'exterior' : wall1.type,
      confidence: Math.max(wall1.confidence, wall2.confidence),
      hasWhiteInterior: wall1.hasWhiteInterior || wall2.hasWhiteInterior,
      interiorDarkness: Math.min(wall1.interiorDarkness || 255, wall2.interiorDarkness || 255)
    };
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
   * Detect walls universally - handles black, gray, patterned walls
   */
  private detectParallelWalls(imageData: ImageData): WallSegment[] {
    const walls: WallSegment[] = [];
    const { width, height, data } = imageData;
    
    // Convert to grayscale for easier processing
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayscale[i / 4] = gray;
    }
    
    // Define scan area - focus on the actual floor plan
    const bounds = {
      startX: Math.floor(width * 0.05),
      endX: Math.floor(width * 0.75),  // Avoid 3D renderings on right
      startY: Math.floor(height * 0.15), // Avoid header tables
      endY: Math.floor(height * 0.85)   // Avoid footer notes
    };
    
    console.log(`\n🎯 Scanning floor plan area: (${bounds.startX},${bounds.startY}) to (${bounds.endX},${bounds.endY})`);
    
    // Detect all continuous lines regardless of color/pattern
    // This will catch black, gray, and even patterned walls
    const allWalls: WallSegment[] = [];
    
    // Scan for horizontal continuous segments
    for (let y = bounds.startY; y < bounds.endY; y += 40) { // Scan every 40 pixels
      const horizontalSegments = this.scanForWallSegments(grayscale, width, height, y, bounds.startX, bounds.endX, true);
      allWalls.push(...horizontalSegments);
    }
    
    // Scan for vertical continuous segments  
    for (let x = bounds.startX; x < bounds.endX; x += 40) { // Scan every 40 pixels
      const verticalSegments = this.scanForWallSegments(grayscale, width, height, x, bounds.startY, bounds.endY, false);
      allWalls.push(...verticalSegments);
    }
    
    console.log(`\n📊 Initial detection: ${allWalls.length} potential walls`);
    
    // Merge nearby parallel segments into single walls
    const mergedWalls = this.mergeNearbySegments(allWalls);
    console.log(`  After merging nearby: ${mergedWalls.length} walls`);
    
    // Filter out obvious non-walls (too short, too thin)
    const filteredWalls = mergedWalls.filter(wall => {
      const length = Math.sqrt(
        Math.pow(wall.end.x - wall.start.x, 2) + 
        Math.pow(wall.end.y - wall.start.y, 2)
      );
      // Keep walls at least 30 pixels long
      return length >= 30;
    });
    
    console.log(`  After filtering: ${filteredWalls.length} walls`);
    
    // Return the filtered walls directly - they work for most floor plans
    // The specialized detection methods can be called separately when needed
    return filteredWalls;
  }
  
  /**
   * Scan for wall segments along a line
   */
  private scanForWallSegments(grayscale: Uint8Array, width: number, height: number, pos: number, start: number, end: number, isHorizontal: boolean): WallSegment[] {
    const segments: WallSegment[] = [];
    let inWall = false;
    let wallStart = -1;
    let consecutiveNonWall = 0;
    
    const scanLength = isHorizontal ? (end - start) : (end - start);
    
    for (let i = 0; i < scanLength; i++) {
      const coord = start + i;
      const idx = isHorizontal ? (pos * width + coord) : ((coord) * width + pos);
      
      if (idx < 0 || idx >= grayscale.length) continue;
      
      const pixel = grayscale[idx];
      
      // Check if this pixel could be part of a wall (not white)
      const isWallPixel = pixel < 240; // Anything darker than near-white
      
      if (isWallPixel) {
        if (!inWall) {
          inWall = true;
          wallStart = coord;
          consecutiveNonWall = 0;
        }
      } else {
        if (inWall) {
          consecutiveNonWall++;
          // Allow small gaps (for doors, etc.)
          if (consecutiveNonWall > 20) {
            // End of wall segment
            const segmentLength = coord - wallStart;
            if (segmentLength > 20) { // Minimum wall length
              const segment: WallSegment = isHorizontal ? {
                id: `wall_h_${segments.length}`,
                start: { x: wallStart, y: pos },
                end: { x: coord - consecutiveNonWall, y: pos },
                thickness: 5,
                type: 'interior',
                confidence: 0.7,
                hasWhiteInterior: false
              } : {
                id: `wall_v_${segments.length}`,
                start: { x: pos, y: wallStart },
                end: { x: pos, y: coord - consecutiveNonWall },
                thickness: 5,
                type: 'interior',
                confidence: 0.7,
                hasWhiteInterior: false
              };
              segments.push(segment);
            }
            inWall = false;
            wallStart = -1;
            consecutiveNonWall = 0;
          }
        }
      }
    }
    
    // Handle wall that extends to edge
    if (inWall && (end - wallStart) > 20) {
      const segment: WallSegment = isHorizontal ? {
        id: `wall_h_${segments.length}`,
        start: { x: wallStart, y: pos },
        end: { x: end, y: pos },
        thickness: 5,
        type: 'interior',
        confidence: 0.7,
        hasWhiteInterior: false
      } : {
        id: `wall_v_${segments.length}`,
        start: { x: pos, y: wallStart },
        end: { x: pos, y: end },
        thickness: 5,
        type: 'interior',
        confidence: 0.7,
        hasWhiteInterior: false
      };
      segments.push(segment);
    }
    
    return segments;
  }
  
  /**
   * Merge nearby parallel segments into single walls
   */
  private mergeNearbySegments(walls: WallSegment[]): WallSegment[] {
    const merged: WallSegment[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < walls.length; i++) {
      if (used.has(i)) continue;
      
      let mergedWall = { ...walls[i] };
      used.add(i);
      
      // Look for nearby parallel walls to merge
      for (let j = i + 1; j < walls.length; j++) {
        if (used.has(j)) continue;
        
        const wall2 = walls[j];
        
        // Check if walls are close and parallel
        const isVertical1 = Math.abs(mergedWall.start.x - mergedWall.end.x) < 10;
        const isVertical2 = Math.abs(wall2.start.x - wall2.end.x) < 10;
        
        if (isVertical1 === isVertical2) {
          if (isVertical1) {
            // Both vertical - check if close in X
            if (Math.abs(mergedWall.start.x - wall2.start.x) < 15) {
              // Check for overlap or near connection in Y
              const overlap = this.checkOverlap(
                mergedWall.start.y, mergedWall.end.y,
                wall2.start.y, wall2.end.y
              );
              
              if (overlap > 0 || this.getGap(mergedWall.start.y, mergedWall.end.y, wall2.start.y, wall2.end.y) < 30) {
                // Merge the walls
                mergedWall = this.combineWalls(mergedWall, wall2);
                used.add(j);
              }
            }
          } else {
            // Both horizontal - check if close in Y
            if (Math.abs(mergedWall.start.y - wall2.start.y) < 15) {
              // Check for overlap or near connection in X
              const overlap = this.checkOverlap(
                mergedWall.start.x, mergedWall.end.x,
                wall2.start.x, wall2.end.x
              );
              
              if (overlap > 0 || this.getGap(mergedWall.start.x, mergedWall.end.x, wall2.start.x, wall2.end.x) < 30) {
                // Merge the walls
                mergedWall = this.combineWalls(mergedWall, wall2);
                used.add(j);
              }
            }
          }
        }
      }
      
      merged.push(mergedWall);
    }
    
    return merged;
  }
  
  private checkOverlap(start1: number, end1: number, start2: number, end2: number): number {
    const min1 = Math.min(start1, end1);
    const max1 = Math.max(start1, end1);
    const min2 = Math.min(start2, end2);
    const max2 = Math.max(start2, end2);
    
    const overlapStart = Math.max(min1, min2);
    const overlapEnd = Math.min(max1, max2);
    
    return Math.max(0, overlapEnd - overlapStart);
  }
  
  private getGap(start1: number, end1: number, start2: number, end2: number): number {
    const min1 = Math.min(start1, end1);
    const max1 = Math.max(start1, end1);
    const min2 = Math.min(start2, end2);
    const max2 = Math.max(start2, end2);
    
    if (max1 < min2) return min2 - max1;
    if (max2 < min1) return min1 - max2;
    return 0;
  }
  
  private combineWalls(wall1: WallSegment, wall2: WallSegment): WallSegment {
    const isVertical = Math.abs(wall1.start.x - wall1.end.x) < 10;
    
    if (isVertical) {
      const x = (wall1.start.x + wall1.end.x + wall2.start.x + wall2.end.x) / 4;
      const minY = Math.min(wall1.start.y, wall1.end.y, wall2.start.y, wall2.end.y);
      const maxY = Math.max(wall1.start.y, wall1.end.y, wall2.start.y, wall2.end.y);
      
      return {
        ...wall1,
        start: { x, y: minY },
        end: { x, y: maxY }
      };
    } else {
      const y = (wall1.start.y + wall1.end.y + wall2.start.y + wall2.end.y) / 4;
      const minX = Math.min(wall1.start.x, wall1.end.x, wall2.start.x, wall2.end.x);
      const maxX = Math.max(wall1.start.x, wall1.end.x, wall2.start.x, wall2.end.x);
      
      return {
        ...wall1,
        start: { x: minX, y },
        end: { x: maxX, y }
      };
    }
  }

  /**
   * Detect vertical walls (scan horizontally for parallel vertical lines)
   */
  private detectVerticalWalls(grayscale: Uint8Array, width: number, height: number): WallSegment[] {
    const walls: WallSegment[] = [];
    
    // Scan horizontal slices - even larger intervals to avoid duplicates
    for (let y = 30; y < height - 30; y += 60) {
      let firstLineX = -1;
      let secondLineX = -1;
      let whiteCount = 0;
      
      for (let x = 0; x < width; x++) {
        const pixel = grayscale[y * width + x];
        
        if (pixel < 50) { // Black pixel
          if (firstLineX === -1) {
            // Found first black line
            firstLineX = x;
            whiteCount = 0;
          } else if (whiteCount >= 4 && whiteCount <= 12) {
            // Found second black line after white space
            secondLineX = x;
            
            // Verify this is a wall (filter out dimension lines which are < 6px thick)
            const wallThickness = secondLineX - firstLineX;
            if (wallThickness >= 6 && wallThickness <= 25) { // Min 6px to better exclude dimension lines
              // Check if this wall continues vertically and if it has white interior
              const wallInfo = this.traceVerticalWallWithInterior(firstLineX, secondLineX, y, grayscale, width, height);
              
              if (wallInfo.length > 100) { // Increased to filter out short dimension lines
                // Valid wall segment
                const wallId = `wall_v_${walls.length}`;
                const centerX = (firstLineX + secondLineX) / 2;
                
                walls.push({
                  id: wallId,
                  start: { x: centerX, y: y - wallInfo.length / 2 },
                  end: { x: centerX, y: y + wallInfo.length / 2 },
                  thickness: wallThickness,
                  type: 'interior', // Will be reclassified based on location and darkness
                  confidence: this.calculateConfidence(wallInfo.length, wallThickness),
                  hasWhiteInterior: wallInfo.hasWhiteInterior,
                  interiorDarkness: wallInfo.avgInteriorDarkness
                });
                
                // Skip ahead to avoid duplicate detection
                x = secondLineX + 10;
              }
            }
            
            // Reset for next potential wall
            firstLineX = secondLineX;
            secondLineX = -1;
            whiteCount = 0;
          } else {
            // Too much white space, reset
            firstLineX = -1;
            secondLineX = -1;
            whiteCount = 0;
          }
        } else if (pixel > 180 && firstLineX !== -1) {
          // White/light pixel between potential wall lines
          whiteCount++;
          
          if (whiteCount > 15) {
            // Too wide, not a wall
            firstLineX = -1;
            whiteCount = 0;
          }
        }
      }
    }
    
    return walls;
  }

  /**
   * Detect horizontal walls (scan vertically for parallel horizontal lines)
   */
  private detectHorizontalWalls(grayscale: Uint8Array, width: number, height: number): WallSegment[] {
    const walls: WallSegment[] = [];
    
    // Scan vertical slices - even larger intervals to avoid duplicates
    for (let x = 30; x < width - 30; x += 60) {
      let firstLineY = -1;
      let secondLineY = -1;
      let whiteCount = 0;
      
      for (let y = 0; y < height; y++) {
        const pixel = grayscale[y * width + x];
        
        if (pixel < 50) { // Black pixel
          if (firstLineY === -1) {
            // Found first black line
            firstLineY = y;
            whiteCount = 0;
          } else if (whiteCount >= 4 && whiteCount <= 12) {
            // Found second black line after white space
            secondLineY = y;
            
            // Verify this is a wall (filter out dimension lines which are < 4px thick)
            const wallThickness = secondLineY - firstLineY;
            if (wallThickness >= 4 && wallThickness <= 25) { // Accept wider range, dimension lines are 1-3px
              // Check if this wall continues horizontally and if it has white interior
              const wallInfo = this.traceHorizontalWallWithInterior(firstLineY, secondLineY, x, grayscale, width, height);
              
              if (wallInfo.length > 100) { // Increased to filter out short dimension lines
                // Valid wall segment
                const wallId = `wall_h_${walls.length}`;
                const centerY = (firstLineY + secondLineY) / 2;
                
                walls.push({
                  id: wallId,
                  start: { x: x - wallInfo.length / 2, y: centerY },
                  end: { x: x + wallInfo.length / 2, y: centerY },
                  thickness: wallThickness,
                  type: 'interior', // Will be reclassified based on location and darkness
                  confidence: this.calculateConfidence(wallInfo.length, wallThickness),
                  hasWhiteInterior: wallInfo.hasWhiteInterior,
                  interiorDarkness: wallInfo.avgInteriorDarkness
                });
                
                // Skip ahead to avoid duplicate detection
                y = secondLineY + 10;
              }
            }
            
            // Reset for next potential wall
            firstLineY = secondLineY;
            secondLineY = -1;
            whiteCount = 0;
          } else {
            // Too much white space, reset
            firstLineY = -1;
            secondLineY = -1;
            whiteCount = 0;
          }
        } else if (pixel > 180 && firstLineY !== -1) {
          // White/light pixel between potential wall lines
          whiteCount++;
          
          if (whiteCount > 15) {
            // Too wide, not a wall
            firstLineY = -1;
            whiteCount = 0;
          }
        }
      }
    }
    
    return walls;
  }

  /**
   * Trace vertical wall to find its full length and check for white/light gray interior
   */
  private traceVerticalWallWithInterior(x1: number, x2: number, startY: number, grayscale: Uint8Array, width: number, height: number): { length: number; hasWhiteInterior: boolean; avgInteriorDarkness: number } {
    let length = 0;
    let lightInteriorCount = 0; // Count white OR light gray interior
    let totalChecks = 0;
    let interiorSum = 0; // Sum of all interior pixel values for average
    
    // Trace upward
    for (let y = startY - 1; y >= 0; y--) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      const middle = grayscale[y * width + Math.floor((x1 + x2) / 2)];
      
      if (left < 50 && right < 50) { // Black parallel lines
        length++;
        totalChecks++;
        interiorSum += middle;
        // Check for white (>200) OR light gray (150-200) interior
        if (middle > 150) { 
          lightInteriorCount++;
        }
      } else {
        break;
      }
    }
    
    // Trace downward
    for (let y = startY + 1; y < height; y++) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      const middle = grayscale[y * width + Math.floor((x1 + x2) / 2)];
      
      if (left < 50 && right < 50) { // Black parallel lines
        length++;
        totalChecks++;
        interiorSum += middle;
        // Check for white (>200) OR light gray (150-200) interior
        if (middle > 150) {
          lightInteriorCount++;
        }
      } else {
        break;
      }
    }
    
    // Wall has white/light gray interior if >70% of the middle pixels are light colored
    const hasWhiteInterior = totalChecks > 0 && (lightInteriorCount / totalChecks) > 0.7;
    const avgInteriorDarkness = totalChecks > 0 ? interiorSum / totalChecks : 0;
    
    return { length, hasWhiteInterior, avgInteriorDarkness };
  }

  /**
   * Detect LIGHT GRAY PARALLEL walls (light gray parallel lines for interior walls)
   */
  private detectLightGrayParallelWalls(grayscale: Uint8Array, width: number, height: number, isVertical: boolean): WallSegment[] {
    const walls: WallSegment[] = [];
    
    if (isVertical) {
      // Scan for vertical light gray parallel walls
      for (let y = 30; y < height - 30; y += 20) {
        let firstLineX = -1;
        let secondLineX = -1;
        let gapCount = 0;
        
        for (let x = 0; x < width; x++) {
          const pixel = grayscale[y * width + x];
          
          // Look for light gray lines (150-220)
          if (pixel > 150 && pixel < 220) {
            if (firstLineX === -1) {
              // Found first light gray line
              firstLineX = x;
              gapCount = 0;
            } else if (gapCount >= 2 && gapCount <= 10) {
              // Found second light gray line after a gap
              secondLineX = x;
              
              // Verify this is a parallel wall structure
              const wallThickness = secondLineX - firstLineX;
              if (wallThickness >= 3 && wallThickness <= 15) {
                // Trace the wall vertically
                const wallLength = this.traceLightGrayParallelVertical(firstLineX, secondLineX, y, grayscale, width, height);
                
                if (wallLength > 40) {
                  const centerX = (firstLineX + secondLineX) / 2;
                  walls.push({
                    id: `wall_light_parallel_v_${walls.length}`,
                    start: { x: centerX, y: y - wallLength / 2 },
                    end: { x: centerX, y: y + wallLength / 2 },
                    thickness: wallThickness,
                    type: 'interior',
                    confidence: 0.8,
                    hasWhiteInterior: true,
                    interiorDarkness: 180
                  });
                  
                  // Skip ahead
                  x = secondLineX + 10;
                }
              }
              
              // Reset for next wall
              firstLineX = secondLineX;
              secondLineX = -1;
              gapCount = 0;
            } else {
              // Too much gap, reset
              firstLineX = -1;
              secondLineX = -1;
              gapCount = 0;
            }
          } else if (pixel > 220 && firstLineX !== -1) {
            // White/very light pixel - could be gap between parallel lines
            gapCount++;
            if (gapCount > 10) {
              // Gap too wide, reset
              firstLineX = -1;
              gapCount = 0;
            }
          }
        }
      }
    } else {
      // Similar logic for horizontal walls
      for (let x = 30; x < width - 30; x += 20) {
        let firstLineY = -1;
        let secondLineY = -1;
        let gapCount = 0;
        
        for (let y = 0; y < height; y++) {
          const pixel = grayscale[y * width + x];
          
          // Look for light gray lines (150-220)
          if (pixel > 150 && pixel < 220) {
            if (firstLineY === -1) {
              // Found first light gray line
              firstLineY = y;
              gapCount = 0;
            } else if (gapCount >= 2 && gapCount <= 10) {
              // Found second light gray line after a gap
              secondLineY = y;
              
              // Verify this is a parallel wall structure
              const wallThickness = secondLineY - firstLineY;
              if (wallThickness >= 3 && wallThickness <= 15) {
                // Trace the wall horizontally
                const wallLength = this.traceLightGrayParallelHorizontal(firstLineY, secondLineY, x, grayscale, width, height);
                
                if (wallLength > 40) {
                  const centerY = (firstLineY + secondLineY) / 2;
                  walls.push({
                    id: `wall_light_parallel_h_${walls.length}`,
                    start: { x: x - wallLength / 2, y: centerY },
                    end: { x: x + wallLength / 2, y: centerY },
                    thickness: wallThickness,
                    type: 'interior',
                    confidence: 0.8,
                    hasWhiteInterior: true,
                    interiorDarkness: 180
                  });
                  
                  // Skip ahead
                  y = secondLineY + 10;
                }
              }
              
              // Reset for next wall
              firstLineY = secondLineY;
              secondLineY = -1;
              gapCount = 0;
            } else {
              // Too much gap, reset
              firstLineY = -1;
              secondLineY = -1;
              gapCount = 0;
            }
          } else if (pixel > 220 && firstLineY !== -1) {
            // White/very light pixel - could be gap between parallel lines
            gapCount++;
            if (gapCount > 10) {
              // Gap too wide, reset
              firstLineY = -1;
              gapCount = 0;
            }
          }
        }
      }
    }
    
    return walls;
  }
  
  /**
   * Trace light gray parallel wall vertically
   */
  private traceLightGrayParallelVertical(x1: number, x2: number, startY: number, grayscale: Uint8Array, width: number, height: number): number {
    let length = 0;
    
    // Trace upward
    for (let y = startY - 1; y >= 0; y--) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      
      // Check if light gray lines continue
      if ((left > 150 && left < 220) && (right > 150 && right < 220)) {
        length++;
      } else if (length < 10) {
        // Allow small gaps
        continue;
      } else {
        break;
      }
    }
    
    // Trace downward
    for (let y = startY + 1; y < height; y++) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      
      // Check if light gray lines continue
      if ((left > 150 && left < 220) && (right > 150 && right < 220)) {
        length++;
      } else if (length < 10) {
        // Allow small gaps
        continue;
      } else {
        break;
      }
    }
    
    return length;
  }
  
  /**
   * Trace light gray parallel wall horizontally
   */
  private traceLightGrayParallelHorizontal(y1: number, y2: number, startX: number, grayscale: Uint8Array, width: number, height: number): number {
    let length = 0;
    
    // Trace leftward
    for (let x = startX - 1; x >= 0; x--) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      
      // Check if light gray lines continue
      if ((top > 150 && top < 220) && (bottom > 150 && bottom < 220)) {
        length++;
      } else if (length < 10) {
        // Allow small gaps
        continue;
      } else {
        break;
      }
    }
    
    // Trace rightward
    for (let x = startX + 1; x < width; x++) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      
      // Check if light gray lines continue
      if ((top > 150 && top < 220) && (bottom > 150 && bottom < 220)) {
        length++;
      } else if (length < 10) {
        // Allow small gaps
        continue;
      } else {
        break;
      }
    }
    
    return length;
  }

  /**
   * Detect LIGHT GRAY walls (very light lines - interior walls in your floor plan)
   */
  private detectLightGrayWalls(grayscale: Uint8Array, width: number, height: number, isVertical: boolean): WallSegment[] {
    const walls: WallSegment[] = [];
    
    if (isVertical) {
      // Scan for vertical light gray walls with finer intervals
      for (let x = 10; x < width - 10; x += 8) {
        let inWall = false;
        let wallStartY = -1;
        let wallPixelSum = 0;
        let wallPixelCount = 0;
        
        for (let y = 50; y < height - 50; y++) {
          const pixel = grayscale[y * width + x];
          
          // Look for LIGHT gray pixels (120-220) - expanded range for very light walls
          if (pixel > 120 && pixel < 220) {
            if (!inWall) {
              inWall = true;
              wallStartY = y;
              wallPixelSum = pixel;
              wallPixelCount = 1;
            } else {
              wallPixelSum += pixel;
              wallPixelCount++;
            }
          } else if (pixel > 220) {
            // White pixel - could be a gap (door/window) in the wall
            // Continue if we're already in a wall
            if (inWall && wallPixelCount < 5) {
              // Short wall segment, might be noise
              inWall = false;
              wallStartY = -1;
              wallPixelSum = 0;
              wallPixelCount = 0;
            }
          } else {
            // Dark pixel - end of wall
            if (inWall && wallPixelCount > 20) {
              // Found a significant wall segment
              const avgPixel = wallPixelSum / wallPixelCount;
              walls.push({
                id: `wall_light_v_${walls.length}`,
                start: { x, y: wallStartY },
                end: { x, y: y - 1 },
                thickness: 3,
                type: 'interior',
                confidence: 0.75,
                hasWhiteInterior: false,
                interiorDarkness: avgPixel
              });
            }
            inWall = false;
            wallStartY = -1;
            wallPixelSum = 0;
            wallPixelCount = 0;
          }
        }
        
        // Check if wall extends to edge
        if (inWall && wallPixelCount > 20) {
          const avgPixel = wallPixelSum / wallPixelCount;
          walls.push({
            id: `wall_light_v_${walls.length}`,
            start: { x, y: wallStartY },
            end: { x, y: height - 51 },
            thickness: 3,
            type: 'interior',
            confidence: 0.75,
            hasWhiteInterior: false,
            interiorDarkness: avgPixel
          });
        }
      }
    } else {
      // Scan for horizontal light gray walls with finer intervals  
      for (let y = 50; y < height - 50; y += 8) {
        let inWall = false;
        let wallStartX = -1;
        let wallPixelSum = 0;
        let wallPixelCount = 0;
        
        for (let x = 10; x < width - 10; x++) {
          const pixel = grayscale[y * width + x];
          
          // Look for LIGHT gray pixels (120-220) - expanded range for very light walls
          if (pixel > 120 && pixel < 220) {
            if (!inWall) {
              inWall = true;
              wallStartX = x;
              wallPixelSum = pixel;
              wallPixelCount = 1;
            } else {
              wallPixelSum += pixel;
              wallPixelCount++;
            }
          } else if (pixel > 220) {
            // White pixel - could be a gap (door/window) in the wall
            // Continue if we're already in a wall
            if (inWall && wallPixelCount < 5) {
              // Short wall segment, might be noise
              inWall = false;
              wallStartX = -1;
              wallPixelSum = 0;
              wallPixelCount = 0;
            }
          } else {
            // Dark pixel - end of wall
            if (inWall && wallPixelCount > 20) {
              // Found a significant wall segment
              const avgPixel = wallPixelSum / wallPixelCount;
              walls.push({
                id: `wall_light_h_${walls.length}`,
                start: { x: wallStartX, y },
                end: { x: x - 1, y },
                thickness: 3,
                type: 'interior',
                confidence: 0.75,
                hasWhiteInterior: false,
                interiorDarkness: avgPixel
              });
            }
            inWall = false;
            wallStartX = -1;
            wallPixelSum = 0;
            wallPixelCount = 0;
          }
        }
        
        // Check if wall extends to edge
        if (inWall && wallPixelCount > 20) {
          const avgPixel = wallPixelSum / wallPixelCount;
          walls.push({
            id: `wall_light_h_${walls.length}`,
            start: { x: wallStartX, y },
            end: { x: width - 11, y },
            thickness: 3,
            type: 'interior',
            confidence: 0.75,
            hasWhiteInterior: false,
            interiorDarkness: avgPixel
          });
        }
      }
    }
    
    return walls;
  }

  /**
   * Detect GRAY parallel walls (gray lines with light interior) - typically interior walls
   */
  private detectGrayParallelWalls(grayscale: Uint8Array, width: number, height: number, isVertical: boolean): WallSegment[] {
    const walls: WallSegment[] = [];
    
    if (isVertical) {
      // Scan for vertical gray walls - use smaller intervals for better detection
      for (let y = 30; y < height - 30; y += 25) {
        for (let x = 10; x < width - 10; x++) {
          const pixel = grayscale[y * width + x];
          
          // Look for gray pixels (30-220) - wider range to capture light interior walls
          if (pixel > 30 && pixel < 220) {
            // Check if this could be a gray wall line
            let thickness = 1;
            let hasLightInterior = false;
            
            // Measure thickness and check for light interior
            for (let dx = 1; dx < 25; dx++) {
              if (x + dx >= width) break;
              const nextPixel = grayscale[y * width + (x + dx)];
              
              if (nextPixel > 150 && nextPixel < 200) {
                // Light gray interior
                hasLightInterior = true;
              } else if (nextPixel > 200) {
                // White interior (could be header)
                hasLightInterior = true;
              } else if (nextPixel > 50 && nextPixel < 150) {
                // Another gray pixel, still part of wall
                thickness++;
              } else if (nextPixel < 50 || (hasLightInterior && nextPixel > 50 && nextPixel < 150)) {
                // Found the other side of the wall
                if (thickness >= 2 && thickness <= 25 && hasLightInterior) {
                  // Trace the wall vertically
                  const wallLength = this.traceGrayWallVertically(x, x + thickness, y, grayscale, width, height);
                  
                  if (wallLength > 30) {
                    walls.push({
                      id: `wall_gray_v_${walls.length}`,
                      start: { x: x + thickness/2, y: y - wallLength/2 },
                      end: { x: x + thickness/2, y: y + wallLength/2 },
                      thickness: thickness,
                      type: 'interior',
                      confidence: 0.8,
                      hasWhiteInterior: nextPixel > 200,
                      interiorDarkness: nextPixel
                    });
                    
                    x += thickness + 10; // Skip past this wall
                  }
                }
                break;
              }
            }
          }
        }
      }
    } else {
      // Scan for horizontal gray walls - use smaller intervals for better detection
      for (let x = 30; x < width - 30; x += 25) {
        for (let y = 10; y < height - 10; y++) {
          const pixel = grayscale[y * width + x];
          
          // Look for gray pixels (30-220) - wider range to capture light interior walls
          if (pixel > 30 && pixel < 220) {
            // Check if this could be a gray wall line
            let thickness = 1;
            let hasLightInterior = false;
            
            // Measure thickness and check for light interior
            for (let dy = 1; dy < 25; dy++) {
              if (y + dy >= height) break;
              const nextPixel = grayscale[(y + dy) * width + x];
              
              if (nextPixel > 150 && nextPixel < 200) {
                // Light gray interior
                hasLightInterior = true;
              } else if (nextPixel > 200) {
                // White interior (could be header)
                hasLightInterior = true;
              } else if (nextPixel > 50 && nextPixel < 150) {
                // Another gray pixel, still part of wall
                thickness++;
              } else if (nextPixel < 50 || (hasLightInterior && nextPixel > 50 && nextPixel < 150)) {
                // Found the other side of the wall
                if (thickness >= 2 && thickness <= 25 && hasLightInterior) {
                  // Trace the wall horizontally
                  const wallLength = this.traceGrayWallHorizontally(y, y + thickness, x, grayscale, width, height);
                  
                  if (wallLength > 30) {
                    walls.push({
                      id: `wall_gray_h_${walls.length}`,
                      start: { x: x - wallLength/2, y: y + thickness/2 },
                      end: { x: x + wallLength/2, y: y + thickness/2 },
                      thickness: thickness,
                      type: 'interior',
                      confidence: 0.8,
                      hasWhiteInterior: nextPixel > 200,
                      interiorDarkness: nextPixel
                    });
                    
                    y += thickness + 10; // Skip past this wall
                  }
                }
                break;
              }
            }
          }
        }
      }
    }
    
    return walls;
  }
  
  /**
   * Trace gray wall vertically
   */
  private traceGrayWallVertically(x1: number, x2: number, startY: number, grayscale: Uint8Array, width: number, height: number): number {
    let length = 0;
    
    // Trace upward
    for (let y = startY - 1; y >= 0; y--) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      
      // Check if gray walls continue
      if ((left > 50 && left < 150) || (right > 50 && right < 150)) {
        length++;
      } else {
        break;
      }
    }
    
    // Trace downward
    for (let y = startY + 1; y < height; y++) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      
      // Check if gray walls continue
      if ((left > 50 && left < 150) || (right > 50 && right < 150)) {
        length++;
      } else {
        break;
      }
    }
    
    return length;
  }
  
  /**
   * Trace gray wall horizontally
   */
  private traceGrayWallHorizontally(y1: number, y2: number, startX: number, grayscale: Uint8Array, width: number, height: number): number {
    let length = 0;
    
    // Trace leftward
    for (let x = startX - 1; x >= 0; x--) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      
      // Check if gray walls continue
      if ((top > 50 && top < 150) || (bottom > 50 && bottom < 150)) {
        length++;
      } else {
        break;
      }
    }
    
    // Trace rightward
    for (let x = startX + 1; x < width; x++) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      
      // Check if gray walls continue
      if ((top > 50 && top < 150) || (bottom > 50 && bottom < 150)) {
        length++;
      } else {
        break;
      }
    }
    
    return length;
  }

  /**
   * Detect solid black walls (not parallel lines, just thick black areas)
   */
  private detectSolidBlackWalls(grayscale: Uint8Array, width: number, height: number): WallSegment[] {
    const walls: WallSegment[] = [];
    const visited = new Uint8Array(width * height);
    
    // Scan for thick black regions - tighter scan for all-black floor plans
    for (let y = 10; y < height - 10; y += 10) {
      for (let x = 10; x < width - 10; x += 10) {
        const idx = y * width + x;
        
        if (visited[idx] || grayscale[idx] > 50) continue; // Skip if visited or not black
        
        // Check if this is part of a thick black region
        const region = this.traceSolidBlackRegion(x, y, grayscale, width, height, visited);
        
        if (region.thickness >= 5 && region.thickness <= 30 && region.length > 50) { // Lower threshold for solid walls
          // This is likely a wall, not a dimension line
          // Dimension lines are typically 1-3px thick, walls are 6-30px
          
          walls.push({
            id: `wall_solid_${walls.length}`,
            start: region.start,
            end: region.end,
            thickness: region.thickness,
            type: 'interior', // Will be reclassified
            confidence: 0.85,
            hasWhiteInterior: false, // Solid walls don't have white interior
            interiorDarkness: 0 // Fully dark
          });
        }
      }
    }
    
    return walls;
  }
  
  /**
   * Trace a solid black region to determine if it's a wall
   */
  private traceSolidBlackRegion(startX: number, startY: number, grayscale: Uint8Array, width: number, height: number, visited: Uint8Array): any {
    // Determine if this black region is horizontal or vertical
    let horizontalCount = 0;
    let verticalCount = 0;
    
    // Sample in both directions
    for (let dx = -20; dx <= 20; dx += 5) {
      const x = startX + dx;
      if (x >= 0 && x < width && grayscale[startY * width + x] < 50) {
        horizontalCount++;
      }
    }
    
    for (let dy = -20; dy <= 20; dy += 5) {
      const y = startY + dy;
      if (y >= 0 && y < height && grayscale[y * width + startX] < 50) {
        verticalCount++;
      }
    }
    
    const isHorizontal = horizontalCount > verticalCount;
    
    if (isHorizontal) {
      // Trace horizontal wall
      let left = startX;
      let right = startX;
      let thickness = 0;
      
      // Find left edge
      while (left > 0 && grayscale[startY * width + left] < 50) left--;
      // Find right edge
      while (right < width && grayscale[startY * width + right] < 50) right++;
      
      // Find thickness
      for (let y = startY; y < height && y < startY + 30; y++) {
        if (grayscale[y * width + startX] < 50) thickness++;
        else break;
      }
      
      // Mark as visited
      for (let y = startY - thickness/2; y <= startY + thickness/2; y++) {
        for (let x = left; x <= right; x++) {
          if (y >= 0 && y < height && x >= 0 && x < width) {
            visited[y * width + x] = 1;
          }
        }
      }
      
      return {
        start: { x: left, y: startY },
        end: { x: right, y: startY },
        thickness: thickness,
        length: right - left
      };
    } else {
      // Trace vertical wall
      let top = startY;
      let bottom = startY;
      let thickness = 0;
      
      // Find top edge
      while (top > 0 && grayscale[top * width + startX] < 50) top--;
      // Find bottom edge
      while (bottom < height && grayscale[bottom * width + startX] < 50) bottom++;
      
      // Find thickness
      for (let x = startX; x < width && x < startX + 30; x++) {
        if (grayscale[startY * width + x] < 50) thickness++;
        else break;
      }
      
      // Mark as visited
      for (let y = top; y <= bottom; y++) {
        for (let x = startX - thickness/2; x <= startX + thickness/2; x++) {
          if (y >= 0 && y < height && x >= 0 && x < width) {
            visited[y * width + x] = 1;
          }
        }
      }
      
      return {
        start: { x: startX, y: top },
        end: { x: startX, y: bottom },
        thickness: thickness,
        length: bottom - top
      };
    }
  }
  
  /**
   * Trace vertical wall to find its full length (legacy method kept for compatibility)
   */
  private traceVerticalWall(x1: number, x2: number, startY: number, grayscale: Uint8Array, width: number, height: number): number {
    let length = 0;
    
    // Trace upward
    for (let y = startY - 1; y >= 0; y--) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      const middle = grayscale[y * width + Math.floor((x1 + x2) / 2)];
      
      if (left < 50 && right < 50 && middle > 150) {
        length++;
      } else {
        break;
      }
    }
    
    // Trace downward
    for (let y = startY + 1; y < height; y++) {
      const left = grayscale[y * width + x1];
      const right = grayscale[y * width + x2];
      const middle = grayscale[y * width + Math.floor((x1 + x2) / 2)];
      
      if (left < 50 && right < 50 && middle > 150) {
        length++;
      } else {
        break;
      }
    }
    
    return length;
  }

  /**
   * Trace horizontal wall to find its full length and check for white/light gray interior
   */
  private traceHorizontalWallWithInterior(y1: number, y2: number, startX: number, grayscale: Uint8Array, width: number, height: number): { length: number; hasWhiteInterior: boolean; avgInteriorDarkness: number } {
    let length = 0;
    let lightInteriorCount = 0; // Count white OR light gray interior
    let totalChecks = 0;
    let interiorSum = 0; // Sum of all interior pixel values for average
    
    // Trace leftward
    for (let x = startX - 1; x >= 0; x--) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      const middle = grayscale[Math.floor((y1 + y2) / 2) * width + x];
      
      if (top < 50 && bottom < 50) { // Black parallel lines
        length++;
        totalChecks++;
        interiorSum += middle;
        // Check for white (>200) OR light gray (150-200) interior
        if (middle > 150) { 
          lightInteriorCount++;
        }
      } else {
        break;
      }
    }
    
    // Trace rightward
    for (let x = startX + 1; x < width; x++) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      const middle = grayscale[Math.floor((y1 + y2) / 2) * width + x];
      
      if (top < 50 && bottom < 50) { // Black parallel lines
        length++;
        totalChecks++;
        // Check for white (>200) OR light gray (150-200) interior
        if (middle > 150) {
          lightInteriorCount++;
        }
      } else {
        break;
      }
    }
    
    // Wall has white/light gray interior if >70% of the middle pixels are light colored
    const hasWhiteInterior = totalChecks > 0 && (lightInteriorCount / totalChecks) > 0.7;
    const avgInteriorDarkness = totalChecks > 0 ? interiorSum / totalChecks : 0;
    
    return { length, hasWhiteInterior, avgInteriorDarkness };
  }

  /**
   * Trace horizontal wall to find its full length (legacy method kept for compatibility)
   */
  private traceHorizontalWall(y1: number, y2: number, startX: number, grayscale: Uint8Array, width: number, height: number): number {
    let length = 0;
    
    // Trace leftward
    for (let x = startX - 1; x >= 0; x--) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      const middle = grayscale[Math.floor((y1 + y2) / 2) * width + x];
      
      if (top < 50 && bottom < 50 && middle > 150) {
        length++;
      } else {
        break;
      }
    }
    
    // Trace rightward
    for (let x = startX + 1; x < width; x++) {
      const top = grayscale[y1 * width + x];
      const bottom = grayscale[y2 * width + x];
      const middle = grayscale[Math.floor((y1 + y2) / 2) * width + x];
      
      if (top < 50 && bottom < 50 && middle > 150) {
        length++;
      } else {
        break;
      }
    }
    
    return length;
  }

  /**
   * Calculate confidence based on wall properties
   */
  private calculateConfidence(length: number, thickness: number): number {
    let confidence = 0.5;
    
    // Longer walls are more confident
    if (length > 100) confidence += 0.2;
    else if (length > 50) confidence += 0.1;
    
    // Typical wall thickness gives higher confidence
    if (thickness >= 7 && thickness <= 10) confidence += 0.2;
    else if (thickness >= 6 && thickness <= 12) confidence += 0.1;
    
    return Math.min(confidence, 0.95);
  }

  /**
   * Classify walls by their location relative to building perimeter
   */
  private classifyWallsByLocation(walls: WallSegment[], imageData: ImageData): WallSegment[] {
    if (walls.length === 0) return walls;
    
    // Analyze darkness variation in walls
    const darknesses = walls.map(w => w.interiorDarkness || 0).filter(d => d > 0);
    const hasVaryingDarkness = darknesses.length > 0 && 
      (Math.max(...darknesses) - Math.min(...darknesses)) > 50;
    
    // Find the building perimeter (outermost walls)
    const perimeter = this.findBuildingPerimeter(walls, imageData);
    
    // Classify each wall
    return walls.map(wall => {
      const isPerimeter = this.isPartOfPerimeter(wall, perimeter);
      const wallCenter = {
        x: (wall.start.x + wall.end.x) / 2,
        y: (wall.start.y + wall.end.y) / 2
      };
      const isInside = this.isPointInsidePerimeter(wallCenter, perimeter);
      
      // Determine wall type based on darkness, location and properties
      let wallType: 'interior' | 'exterior' | 'load-bearing' = wall.type;
      
      if (hasVaryingDarkness && wall.interiorDarkness !== undefined) {
        // If floorplan has varying darkness, use it for classification
        if (wall.interiorDarkness < 30) {
          // Very dark interior (black fill) - likely exterior or structural
          wallType = isPerimeter ? 'exterior' : 'load-bearing';
        } else if (wall.interiorDarkness > 220) {
          // Pure white interior - header/load-bearing
          wallType = 'load-bearing';
        } else if (wall.interiorDarkness > 180) {
          // Light gray to white interior (180-220) - could be interior or header
          wallType = wall.hasWhiteInterior ? 'load-bearing' : 'interior';
        } else if (wall.interiorDarkness > 100) {
          // Medium gray interior (100-180) - interior wall
          wallType = 'interior';
        } else {
          // Dark gray (30-100) - use location and thickness
          wallType = isPerimeter ? 'exterior' : (wall.thickness > 10 ? 'load-bearing' : 'interior');
        }
      } else {
        // If all walls are similar darkness, use location and thickness
        if (isPerimeter) {
          wallType = 'exterior';
        } else if (isInside) {
          // Check if it has white/light interior or use thickness
          if (wall.hasWhiteInterior) {
            wallType = 'load-bearing';
          } else if (wall.thickness > 10) {
            wallType = 'load-bearing';
          } else {
            wallType = 'interior';
          }
        } else {
          // Outside perimeter - likely exterior features
          wallType = wall.thickness > 9 ? 'exterior' : 'interior';
        }
      }
      
      return { ...wall, type: wallType };
    });
  }
  
  /**
   * Find the building perimeter walls
   */
  private findBuildingPerimeter(walls: WallSegment[], _imageData: ImageData): WallSegment[] {
    // Find the bounding box of all walls
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    walls.forEach(wall => {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    });
    
    // Add margin
    const margin = 20;
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;
    
    // Find walls that are close to the bounding edges
    const perimeterWalls: WallSegment[] = [];
    
    walls.forEach(wall => {
      const startNearEdge = this.isNearPerimeter(wall.start, minX, maxX, minY, maxY);
      const endNearEdge = this.isNearPerimeter(wall.end, minX, maxX, minY, maxY);
      
      // If both endpoints are near the edge, it's likely a perimeter wall
      if (startNearEdge || endNearEdge) {
        // Additional check: perimeter walls are usually thicker and continuous
        if (wall.thickness >= 8 || this.isConnectedToOtherWalls(wall, walls)) {
          perimeterWalls.push(wall);
        }
      }
    });
    
    return perimeterWalls;
  }
  
  /**
   * Check if a point is near the building perimeter
   */
  private isNearPerimeter(point: Point, minX: number, maxX: number, minY: number, maxY: number): boolean {
    const threshold = 50; // Distance from edge to be considered perimeter
    
    return (
      Math.abs(point.x - minX) < threshold ||
      Math.abs(point.x - maxX) < threshold ||
      Math.abs(point.y - minY) < threshold ||
      Math.abs(point.y - maxY) < threshold
    );
  }
  
  /**
   * Check if a wall is part of the perimeter
   */
  private isPartOfPerimeter(wall: WallSegment, perimeterWalls: WallSegment[]): boolean {
    return perimeterWalls.some(p => p.id === wall.id);
  }
  
  /**
   * Check if a point is inside the building perimeter
   */
  private isPointInsidePerimeter(point: Point, perimeterWalls: WallSegment[]): boolean {
    if (perimeterWalls.length === 0) return false;
    
    // Simple check: point is inside if it's within the bounding box of perimeter walls
    // and not too close to any perimeter wall
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    perimeterWalls.forEach(wall => {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    });
    
    // Check if point is within bounds
    const margin = 10;
    return (
      point.x > minX + margin &&
      point.x < maxX - margin &&
      point.y > minY + margin &&
      point.y < maxY - margin
    );
  }
  
  /**
   * Check if a wall connects to other walls (for perimeter detection)
   */
  private isConnectedToOtherWalls(wall: WallSegment, allWalls: WallSegment[]): boolean {
    let connections = 0;
    const threshold = 30; // Distance to be considered connected
    
    allWalls.forEach(other => {
      if (other.id === wall.id) return;
      
      // Check if endpoints are close
      if (
        this.pointDistance(wall.start, other.start) < threshold ||
        this.pointDistance(wall.start, other.end) < threshold ||
        this.pointDistance(wall.end, other.start) < threshold ||
        this.pointDistance(wall.end, other.end) < threshold
      ) {
        connections++;
      }
    });
    
    return connections >= 2; // Wall connects to at least 2 other walls
  }
  
  /**
   * Calculate distance between two points
   */
  private pointDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

export default ParallelWallDetectorService;