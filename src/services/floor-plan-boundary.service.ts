import sharp from 'sharp';

interface FloorPlanBounds {
  x: number;      // Left edge (0-1)
  y: number;      // Top edge (0-1)
  width: number;  // Width (0-1)
  height: number; // Height (0-1)
}

export class FloorPlanBoundaryService {
  
  /**
   * Detects the actual floor plan boundaries within an image
   * This handles images where the floor plan doesn't fill the entire image
   * (e.g., has UI elements, toolbars, whitespace, etc.)
   */
  async detectFloorPlanBounds(imageBuffer: Buffer): Promise<FloorPlanBounds> {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 1000;
      const height = metadata.height || 800;
      
      // Convert to grayscale and get pixel data for analysis
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Find the bounding box of non-white pixels (the actual floor plan)
      let minX = width, maxX = 0;
      let minY = height, maxY = 0;
      
      // Sample the image to find content boundaries
      const threshold = 250; // Pixels darker than this are considered content
      const sampleRate = 10; // Check every 10th pixel for efficiency
      
      for (let y = 0; y < height; y += sampleRate) {
        for (let x = 0; x < width; x += sampleRate) {
          const idx = y * width + x;
          const pixel = data[idx];
          
          // If pixel is not white/near-white, it's part of the floor plan
          if (pixel < threshold) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      
      // Add padding to ensure we capture the full floor plan
      const padding = 0.05; // 5% padding
      minX = Math.max(0, minX - width * padding);
      maxX = Math.min(width, maxX + width * padding);
      minY = Math.max(0, minY - height * padding);
      maxY = Math.min(height, maxY + height * padding);
      
      // Convert to normalized coordinates (0-1)
      return {
        x: minX / width,
        y: minY / height,
        width: (maxX - minX) / width,
        height: (maxY - minY) / height
      };
      
    } catch (error) {
      console.error('Error detecting floor plan bounds:', error);
      // Default to center 70% of image (common for floor plans)
      return {
        x: 0.15,
        y: 0.15,
        width: 0.70,
        height: 0.70
      };
    }
  }
  
  /**
   * Adjusts room coordinates to fit within detected floor plan bounds
   * Takes normalized (0-1) room coordinates and maps them to the actual floor plan area
   */
  adjustRoomCoordinates(
    roomCoords: number[][], 
    floorPlanBounds: FloorPlanBounds
  ): number[][] {
    return roomCoords.map(coord => {
      // Keep coordinates normalized (0-1) but adjust to floor plan bounds
      // The frontend will handle the actual pixel scaling
      const adjustedX = floorPlanBounds.x + (coord[0] * floorPlanBounds.width);
      const adjustedY = floorPlanBounds.y + (coord[1] * floorPlanBounds.height);
      // Ensure we stay in 0-1 range
      return [
        Math.min(1, Math.max(0, adjustedX)),
        Math.min(1, Math.max(0, adjustedY))
      ];
    });
  }
  
  /**
   * Smart detection that handles various floor plan layouts:
   * - Centered floor plans
   * - Floor plans with UI toolbars
   * - Multiple floors side-by-side
   * - Floor plans with dimension text around edges
   */
  async detectSmartBounds(imageBuffer: Buffer): Promise<FloorPlanBounds> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 1000;
    const height = metadata.height || 800;
    
    // Analyze image in regions to find the main content area
    const regions = await this.analyzeImageRegions(imageBuffer);
    
    // Find the largest connected region (likely the floor plan)
    const mainRegion = this.findMainContentRegion(regions);
    
    if (mainRegion) {
      return mainRegion;
    }
    
    // Fallback: Use intelligent defaults based on image aspect ratio
    const aspectRatio = width / height;
    
    if (aspectRatio > 1.5) {
      // Wide image - floor plan likely in center
      return { x: 0.1, y: 0.15, width: 0.8, height: 0.7 };
    } else if (aspectRatio < 0.7) {
      // Tall image - floor plan likely in upper portion
      return { x: 0.1, y: 0.1, width: 0.8, height: 0.6 };
    } else {
      // Square-ish image - floor plan likely centered
      return { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
    }
  }
  
  private async analyzeImageRegions(imageBuffer: Buffer): Promise<any[]> {
    // Divide image into regions and analyze content density
    const regions: any[] = [];
    
    const { data, info } = await sharp(imageBuffer)
      .grayscale()
      .resize(100, 100) // Downsample for faster analysis
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const gridSize = 10;
    const cellWidth = info.width! / gridSize;
    const cellHeight = info.height! / gridSize;
    
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        let contentPixels = 0;
        
        // Count non-white pixels in this cell
        for (let y = row * cellHeight; y < (row + 1) * cellHeight; y++) {
          for (let x = col * cellWidth; x < (col + 1) * cellWidth; x++) {
            const idx = Math.floor(y) * info.width! + Math.floor(x);
            if (data[idx] < 240) { // Non-white pixel
              contentPixels++;
            }
          }
        }
        
        const density = contentPixels / (cellWidth * cellHeight);
        if (density > 0.1) { // Cell has significant content
          regions.push({
            row,
            col,
            density,
            x: col / gridSize,
            y: row / gridSize,
            width: 1 / gridSize,
            height: 1 / gridSize
          });
        }
      }
    }
    
    return regions;
  }
  
  private findMainContentRegion(regions: any[]): FloorPlanBounds | null {
    if (regions.length === 0) return null;
    
    // Find bounding box of all content regions
    let minX = 1, maxX = 0;
    let minY = 1, maxY = 0;
    
    for (const region of regions) {
      minX = Math.min(minX, region.x);
      maxX = Math.max(maxX, region.x + region.width);
      minY = Math.min(minY, region.y);
      maxY = Math.max(maxY, region.y + region.height);
    }
    
    // Filter out regions that are too far from the center
    // (likely UI elements or toolbars)
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const maxDistance = 0.4; // Maximum distance from center
    
    const centralRegions = regions.filter(region => {
      const regionCenterX = region.x + region.width / 2;
      const regionCenterY = region.y + region.height / 2;
      const distance = Math.sqrt(
        Math.pow(regionCenterX - centerX, 2) + 
        Math.pow(regionCenterY - centerY, 2)
      );
      return distance < maxDistance;
    });
    
    if (centralRegions.length === 0) return null;
    
    // Find bounding box of central regions
    minX = 1; maxX = 0;
    minY = 1; maxY = 0;
    
    for (const region of centralRegions) {
      minX = Math.min(minX, region.x);
      maxX = Math.max(maxX, region.x + region.width);
      minY = Math.min(minY, region.y);
      maxY = Math.max(maxY, region.y + region.height);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}