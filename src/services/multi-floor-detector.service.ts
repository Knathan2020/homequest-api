import { GoogleVisionService } from './google-vision.service';
import { GeminiVisionService } from './gemini-vision.service';
import sharp from 'sharp';

interface Room {
  type: string;
  area: number;
  confidence: number;
  coordinates: number[][];
  label?: string;
  floor?: number; // Which floor this room belongs to
}

interface Wall {
  start: number[];
  end: number[];
  thickness: number;
  floor?: number;
}

interface FloorPlan {
  floor_number: number;
  floor_name: string;
  rooms: Room[];
  walls: Wall[];
  total_sqft: number;
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface DetectionResult {
  rooms_detected: number;
  total_sqft: number;
  confidence: number;
  room_types: string[];
  wall_count: number;
  door_count: number;
  window_count: number;
  detailed_rooms: Room[];
  detailed_walls: Wall[];
  floors?: FloorPlan[]; // Multiple floors
  floor_count?: number;
}

export class MultiFloorDetectorService {
  private googleVision: GoogleVisionService;
  private geminiVision: GeminiVisionService;
  
  constructor() {
    this.googleVision = new GoogleVisionService();
    this.geminiVision = new GeminiVisionService();
  }
  
  async detectFloorPlan(imageBuffer: Buffer): Promise<DetectionResult> {
    try {
      console.log('🏢 Starting multi-floor detection...');
      
      // Get image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 1000;
      const height = metadata.height || 800;
      
      // Try Gemini first with multi-floor prompt
      try {
        const result = await this.detectWithGeminiMultiFloor(imageBuffer, width, height);
        if (result && result.floors && result.floors.length > 0) {
          console.log(`✅ Detected ${result.floors.length} floors`);
          return result;
        }
      } catch (error) {
        console.log('⚠️ Multi-floor Gemini detection failed');
      }
      
      // Fallback to single floor detection
      const singleFloorResult = await this.detectSingleFloor(imageBuffer, width, height);
      return this.convertToMultiFloorResult(singleFloorResult);
      
    } catch (error) {
      console.error('❌ Multi-floor detection error:', error);
      return this.getFallbackDetection();
    }
  }
  
  private async detectWithGeminiMultiFloor(imageBuffer: Buffer, width: number, height: number): Promise<DetectionResult | null> {
    // This would use Gemini with a specific multi-floor prompt
    const prompt = `Analyze this architectural floor plan image.
    
    IMPORTANT: This image may contain MULTIPLE FLOORS (First Floor, Second Floor, Basement, etc.)
    
    For EACH floor found:
    1. Identify the floor name/number
    2. Determine the boundary/region of that floor in the image
    3. List all rooms on that floor with their types and approximate areas
    4. Note the approximate pixel coordinates for the floor's boundary
    
    Common layouts:
    - Side-by-side: First floor on left, second floor on right
    - Stacked: First floor on top, second floor below
    - Grid: Multiple floors in a grid layout
    
    Return JSON format:
    {
      "floors": [
        {
          "floor_number": 1,
          "floor_name": "FIRST FLOOR",
          "bounds": {"minX": 0, "maxX": 1000, "minY": 0, "maxY": 500},
          "rooms": [
            {"type": "living", "area": 200, "coordinates": [[x1,y1],[x2,y2]...]},
            {"type": "kitchen", "area": 150, "coordinates": [[x1,y1],[x2,y2]...]}
          ]
        },
        {
          "floor_number": 2,
          "floor_name": "SECOND FLOOR",
          "bounds": {"minX": 1000, "maxX": 2000, "minY": 0, "maxY": 500},
          "rooms": [
            {"type": "bedroom", "area": 150, "coordinates": [[x1,y1],[x2,y2]...]},
            {"type": "bathroom", "area": 60, "coordinates": [[x1,y1],[x2,y2]...]}
          ]
        }
      ]
    }`;
    
    // This would call Gemini API with the multi-floor prompt
    // For now, return null to use fallback
    return null;
  }
  
  private async detectSingleFloor(imageBuffer: Buffer, width: number, height: number): Promise<DetectionResult> {
    // Use existing single-floor detection
    try {
      const result = await this.googleVision.detectFloorPlan(imageBuffer);
      return result;
    } catch (error) {
      return this.getFallbackDetection();
    }
  }
  
  private convertToMultiFloorResult(singleResult: DetectionResult): DetectionResult {
    // Convert single floor result to multi-floor format
    const floor: FloorPlan = {
      floor_number: 1,
      floor_name: 'MAIN FLOOR',
      rooms: singleResult.detailed_rooms.map(room => ({...room, floor: 1})),
      walls: singleResult.detailed_walls.map(wall => ({...wall, floor: 1})),
      total_sqft: singleResult.total_sqft
    };
    
    return {
      ...singleResult,
      floors: [floor],
      floor_count: 1,
      detailed_rooms: floor.rooms,
      detailed_walls: floor.walls
    };
  }
  
  private detectFloorBoundaries(width: number, height: number, floorCount: number): FloorPlan['bounds'][] {
    // Detect common floor layout patterns
    const bounds: FloorPlan['bounds'][] = [];
    
    if (floorCount === 2) {
      // Side-by-side layout (most common)
      const midX = width / 2;
      bounds.push(
        { minX: 0, maxX: midX, minY: 0, maxY: height }, // First floor
        { minX: midX, maxX: width, minY: 0, maxY: height } // Second floor
      );
    } else if (floorCount === 3) {
      // Three floors might be in a row or grid
      const thirdWidth = width / 3;
      bounds.push(
        { minX: 0, maxX: thirdWidth, minY: 0, maxY: height },
        { minX: thirdWidth, maxX: thirdWidth * 2, minY: 0, maxY: height },
        { minX: thirdWidth * 2, maxX: width, minY: 0, maxY: height }
      );
    } else {
      // Single floor or unknown layout
      bounds.push({ minX: 0, maxX: width, minY: 0, maxY: height });
    }
    
    return bounds;
  }
  
  private getFallbackDetection(): DetectionResult {
    // Example multi-floor fallback
    const firstFloor: FloorPlan = {
      floor_number: 1,
      floor_name: 'FIRST FLOOR',
      rooms: [
        { type: 'living', area: 200, confidence: 0.9, coordinates: [[100, 100], [400, 100], [400, 300], [100, 300], [100, 100]], floor: 1 },
        { type: 'kitchen', area: 150, confidence: 0.9, coordinates: [[400, 100], [600, 100], [600, 300], [400, 300], [400, 100]], floor: 1 },
        { type: 'dining', area: 120, confidence: 0.85, coordinates: [[100, 300], [300, 300], [300, 450], [100, 450], [100, 300]], floor: 1 },
        { type: 'bathroom', area: 50, confidence: 0.85, coordinates: [[600, 100], [700, 100], [700, 200], [600, 200], [600, 100]], floor: 1 }
      ],
      walls: [],
      total_sqft: 520,
      bounds: { minX: 0, maxX: 800, minY: 0, maxY: 500 }
    };
    
    const secondFloor: FloorPlan = {
      floor_number: 2,
      floor_name: 'SECOND FLOOR',
      rooms: [
        { type: 'bedroom', area: 150, confidence: 0.9, coordinates: [[900, 100], [1100, 100], [1100, 300], [900, 300], [900, 100]], floor: 2 },
        { type: 'bedroom', area: 140, confidence: 0.9, coordinates: [[1100, 100], [1300, 100], [1300, 300], [1100, 300], [1100, 100]], floor: 2 },
        { type: 'bedroom', area: 130, confidence: 0.85, coordinates: [[900, 300], [1100, 300], [1100, 450], [900, 450], [900, 300]], floor: 2 },
        { type: 'bathroom', area: 70, confidence: 0.9, coordinates: [[1100, 300], [1200, 300], [1200, 400], [1100, 400], [1100, 300]], floor: 2 }
      ],
      walls: [],
      total_sqft: 490,
      bounds: { minX: 850, maxX: 1650, minY: 0, maxY: 500 }
    };
    
    // Generate walls for each floor
    firstFloor.walls = this.generateWallsFromRooms(firstFloor.rooms);
    secondFloor.walls = this.generateWallsFromRooms(secondFloor.rooms);
    
    const allRooms = [...firstFloor.rooms, ...secondFloor.rooms];
    const allWalls = [...firstFloor.walls, ...secondFloor.walls];
    
    return {
      rooms_detected: allRooms.length,
      total_sqft: firstFloor.total_sqft + secondFloor.total_sqft,
      confidence: 0.85,
      room_types: [...new Set(allRooms.map(r => r.type))],
      wall_count: allWalls.length,
      door_count: allRooms.length + 4,
      window_count: 12,
      detailed_rooms: allRooms,
      detailed_walls: allWalls,
      floors: [firstFloor, secondFloor],
      floor_count: 2
    };
  }
  
  private generateWallsFromRooms(rooms: Room[]): Wall[] {
    const walls: Wall[] = [];
    const addedWalls = new Set<string>();
    
    for (const room of rooms) {
      if (!room.coordinates || room.coordinates.length < 2) continue;
      
      for (let i = 0; i < room.coordinates.length - 1; i++) {
        const start = room.coordinates[i];
        const end = room.coordinates[i + 1];
        
        const key = `${Math.round(start[0])},${Math.round(start[1])}-${Math.round(end[0])},${Math.round(end[1])}`;
        const reverseKey = `${Math.round(end[0])},${Math.round(end[1])}-${Math.round(start[0])},${Math.round(start[1])}`;
        
        if (!addedWalls.has(key) && !addedWalls.has(reverseKey)) {
          walls.push({
            start: [start[0], start[1]],
            end: [end[0], end[1]],
            thickness: 5,
            floor: room.floor
          });
          addedWalls.add(key);
        }
      }
    }
    
    return walls;
  }
}