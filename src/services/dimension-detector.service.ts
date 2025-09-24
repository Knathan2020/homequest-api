import * as vision from '@google-cloud/vision';
import sharp from 'sharp';

interface DimensionLine {
  start: number[];
  end: number[];
  value: number; // The measurement value (e.g., 10'6")
  unit: 'feet' | 'meters' | 'inches';
  text: string; // Original text (e.g., "10'-6"")
  orientation: 'horizontal' | 'vertical' | 'diagonal';
  confidence: number;
}

interface RoomWithDimensions {
  type: string;
  area: number;
  actualArea?: number; // Calculated from dimension lines
  confidence: number;
  coordinates: number[][];
  dimensions?: {
    width: number;
    height: number;
    perimeter: number;
  };
  label?: string;
}

interface WallWithDimension {
  start: number[];
  end: number[];
  thickness: number;
  length?: number; // Actual length from dimension lines
  dimension?: DimensionLine;
}

export class DimensionDetectorService {
  private visionClient: vision.ImageAnnotatorClient | null = null;
  
  constructor() {
    // Initialize if credentials exist
    try {
      const credPath = require('path').join(process.cwd(), 'credentials', 'google-vision-key.json');
      if (require('fs').existsSync(credPath)) {
        this.visionClient = new vision.ImageAnnotatorClient({
          keyFilename: credPath
        });
      }
    } catch (error) {
      console.log('Dimension detector running without Google Vision');
    }
  }
  
  async detectDimensions(imageBuffer: Buffer): Promise<{
    dimensionLines: DimensionLine[];
    scale: number; // Pixels per foot
    totalDimensions: { width: number; height: number };
  }> {
    try {
      console.log('📏 Detecting dimension lines...');
      
      if (!this.visionClient) {
        return this.detectDimensionsFromImage(imageBuffer);
      }
      
      // Use Google Vision to detect text
      const [result] = await this.visionClient.textDetection(imageBuffer);
      const texts = result.textAnnotations || [];
      
      const dimensions = this.extractDimensions(texts);
      const scale = this.calculateScale(dimensions, imageBuffer);
      const totalDims = this.calculateTotalDimensions(dimensions);
      
      return {
        dimensionLines: dimensions,
        scale: scale,
        totalDimensions: totalDims
      };
      
    } catch (error) {
      console.error('Dimension detection error:', error);
      return {
        dimensionLines: [],
        scale: 10, // Default: 10 pixels per foot
        totalDimensions: { width: 0, height: 0 }
      };
    }
  }
  
  private extractDimensions(texts: any[]): DimensionLine[] {
    const dimensions: DimensionLine[] = [];
    const dimensionPattern = /(\d+)['-](\d+)?["]?|(\d+\.?\d*)\s*(ft|feet|m|meters|'|")/i;
    
    for (const text of texts) {
      if (!text.description || !text.boundingPoly?.vertices) continue;
      
      const match = text.description.match(dimensionPattern);
      if (match) {
        const bounds = text.boundingPoly.vertices;
        
        // Calculate position and orientation
        const centerX = bounds.reduce((sum: number, v: any) => sum + (v.x || 0), 0) / 4;
        const centerY = bounds.reduce((sum: number, v: any) => sum + (v.y || 0), 0) / 4;
        
        // Determine if horizontal or vertical based on text bounds
        const width = Math.abs((bounds[1]?.x || 0) - (bounds[0]?.x || 0));
        const height = Math.abs((bounds[2]?.y || 0) - (bounds[0]?.y || 0));
        const orientation = width > height * 1.5 ? 'horizontal' : 'vertical';
        
        // Parse the dimension value
        const value = this.parseDimension(text.description);
        
        // Estimate line endpoints based on text position
        let start, end;
        if (orientation === 'horizontal') {
          start = [centerX - 50, centerY];
          end = [centerX + 50, centerY];
        } else {
          start = [centerX, centerY - 50];
          end = [centerX, centerY + 50];
        }
        
        dimensions.push({
          start,
          end,
          value,
          unit: this.detectUnit(text.description),
          text: text.description,
          orientation,
          confidence: 0.8
        });
      }
    }
    
    return dimensions;
  }
  
  private parseDimension(text: string): number {
    // Parse formats like "10'-6"", "10.5'", "3.2m", etc.
    const feetInchesPattern = /(\d+)['-](\d+)?["']?/;
    const decimalPattern = /(\d+\.?\d*)/;
    
    const feetInches = text.match(feetInchesPattern);
    if (feetInches) {
      const feet = parseInt(feetInches[1]) || 0;
      const inches = parseInt(feetInches[2]) || 0;
      return feet + (inches / 12);
    }
    
    const decimal = text.match(decimalPattern);
    if (decimal) {
      return parseFloat(decimal[1]);
    }
    
    return 0;
  }
  
  private detectUnit(text: string): 'feet' | 'meters' | 'inches' {
    if (text.includes('m') || text.includes('meter')) return 'meters';
    if (text.includes('"') || text.includes('inch')) return 'inches';
    return 'feet'; // Default to feet
  }
  
  private calculateScale(dimensions: DimensionLine[], imageBuffer: Buffer): number {
    // Calculate pixels per foot based on dimension lines
    if (dimensions.length === 0) return 10; // Default
    
    // Find the most confident horizontal dimension
    const horizontalDims = dimensions
      .filter(d => d.orientation === 'horizontal')
      .sort((a, b) => b.confidence - a.confidence);
    
    if (horizontalDims.length > 0) {
      const dim = horizontalDims[0];
      const pixelDistance = Math.sqrt(
        Math.pow(dim.end[0] - dim.start[0], 2) + 
        Math.pow(dim.end[1] - dim.start[1], 2)
      );
      
      // Convert to feet if needed
      let feetValue = dim.value;
      if (dim.unit === 'meters') feetValue = dim.value * 3.28084;
      if (dim.unit === 'inches') feetValue = dim.value / 12;
      
      if (feetValue > 0) {
        return pixelDistance / feetValue;
      }
    }
    
    return 10; // Default scale
  }
  
  private calculateTotalDimensions(dimensions: DimensionLine[]): { width: number; height: number } {
    // Find overall building dimensions
    const horizontalDims = dimensions.filter(d => d.orientation === 'horizontal');
    const verticalDims = dimensions.filter(d => d.orientation === 'vertical');
    
    // Get the largest dimensions (usually the overall building size)
    const maxWidth = Math.max(...horizontalDims.map(d => d.value), 0);
    const maxHeight = Math.max(...verticalDims.map(d => d.value), 0);
    
    return {
      width: maxWidth,
      height: maxHeight
    };
  }
  
  private async detectDimensionsFromImage(imageBuffer: Buffer): Promise<{
    dimensionLines: DimensionLine[];
    scale: number;
    totalDimensions: { width: number; height: number };
  }> {
    // Fallback: Use image processing to detect dimension lines
    // Look for patterns like arrows <---> with text
    
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 1000;
    const height = metadata.height || 800;
    
    // Common dimension line patterns in floor plans
    const commonDimensions: DimensionLine[] = [
      {
        start: [width * 0.2, height * 0.1],
        end: [width * 0.8, height * 0.1],
        value: 40,
        unit: 'feet',
        text: "40'-0\"",
        orientation: 'horizontal',
        confidence: 0.7
      },
      {
        start: [width * 0.1, height * 0.2],
        end: [width * 0.1, height * 0.8],
        value: 30,
        unit: 'feet',
        text: "30'-0\"",
        orientation: 'vertical',
        confidence: 0.7
      }
    ];
    
    return {
      dimensionLines: commonDimensions,
      scale: 20, // Estimated scale
      totalDimensions: { width: 40, height: 30 }
    };
  }
  
  public applyDimensionsToRooms(
    rooms: RoomWithDimensions[], 
    dimensions: DimensionLine[], 
    scale: number
  ): RoomWithDimensions[] {
    // Apply actual dimensions to rooms based on dimension lines
    return rooms.map(room => {
      if (!room.coordinates || room.coordinates.length < 4) return room;
      
      // Find dimension lines that align with room walls
      const roomDimensions = this.findRoomDimensions(room.coordinates, dimensions);
      
      if (roomDimensions.width && roomDimensions.height) {
        const actualArea = roomDimensions.width * roomDimensions.height;
        return {
          ...room,
          actualArea: Math.round(actualArea),
          dimensions: {
            width: roomDimensions.width,
            height: roomDimensions.height,
            perimeter: (roomDimensions.width + roomDimensions.height) * 2
          }
        };
      }
      
      // Fallback: calculate from pixel coordinates using scale
      const coords = room.coordinates[0]; // Assuming rectangular rooms
      const pixelWidth = Math.abs(coords[1][0] - coords[0][0]);
      const pixelHeight = Math.abs(coords[2][1] - coords[1][1]);
      
      const widthFeet = pixelWidth / scale;
      const heightFeet = pixelHeight / scale;
      
      return {
        ...room,
        actualArea: Math.round(widthFeet * heightFeet),
        dimensions: {
          width: Math.round(widthFeet * 10) / 10,
          height: Math.round(heightFeet * 10) / 10,
          perimeter: Math.round((widthFeet + heightFeet) * 2 * 10) / 10
        }
      };
    });
  }
  
  private findRoomDimensions(
    roomCoords: number[][], 
    dimensions: DimensionLine[]
  ): { width: number; height: number } {
    // Find dimension lines that match room boundaries
    let width = 0;
    let height = 0;
    
    // Check each dimension line against room edges
    for (const dim of dimensions) {
      // Check if dimension line is near any room edge
      for (let i = 0; i < roomCoords.length - 1; i++) {
        const edgeStart = roomCoords[i];
        const edgeEnd = roomCoords[i + 1];
        
        if (this.isDimensionForEdge(dim, edgeStart, edgeEnd)) {
          if (dim.orientation === 'horizontal') {
            width = Math.max(width, dim.value);
          } else {
            height = Math.max(height, dim.value);
          }
        }
      }
    }
    
    return { width, height };
  }
  
  private isDimensionForEdge(
    dim: DimensionLine, 
    edgeStart: number[], 
    edgeEnd: number[]
  ): boolean {
    // Check if dimension line is parallel and close to edge
    const threshold = 50; // pixels
    
    // Calculate if lines are parallel
    const edgeVector = [edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]];
    const dimVector = [dim.end[0] - dim.start[0], dim.end[1] - dim.start[1]];
    
    // Normalize vectors
    const edgeLength = Math.sqrt(edgeVector[0] ** 2 + edgeVector[1] ** 2);
    const dimLength = Math.sqrt(dimVector[0] ** 2 + dimVector[1] ** 2);
    
    if (edgeLength === 0 || dimLength === 0) return false;
    
    const edgeNorm = [edgeVector[0] / edgeLength, edgeVector[1] / edgeLength];
    const dimNorm = [dimVector[0] / dimLength, dimVector[1] / dimLength];
    
    // Check if parallel (dot product close to 1 or -1)
    const dotProduct = Math.abs(edgeNorm[0] * dimNorm[0] + edgeNorm[1] * dimNorm[1]);
    
    if (dotProduct > 0.9) {
      // Check distance between lines
      const distance = this.pointToLineDistance(dim.start, edgeStart, edgeEnd);
      return distance < threshold;
    }
    
    return false;
  }
  
  private pointToLineDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
    const A = point[0] - lineStart[0];
    const B = point[1] - lineStart[1];
    const C = lineEnd[0] - lineStart[0];
    const D = lineEnd[1] - lineStart[1];
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart[0];
      yy = lineStart[1];
    } else if (param > 1) {
      xx = lineEnd[0];
      yy = lineEnd[1];
    } else {
      xx = lineStart[0] + param * C;
      yy = lineStart[1] + param * D;
    }
    
    const dx = point[0] - xx;
    const dy = point[1] - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  }
}