import { GeminiVisionService } from './gemini-vision.service';
import { OpenCVBoundaryService } from './opencv-boundary.service';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface Room {
  type: string;
  area: number;
  confidence: number;
  coordinates: number[][];
  label?: string;
}

interface Wall {
  start: number[];
  end: number[];
  thickness: number;
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
}

export class HybridVisionService {
  private geminiService: GeminiVisionService;
  private opencvService: OpenCVBoundaryService;
  
  constructor() {
    this.geminiService = new GeminiVisionService();
    this.opencvService = new OpenCVBoundaryService();
  }
  
  async detectFloorPlan(imageBuffer: Buffer): Promise<DetectionResult> {
    console.log('🚀 Starting Hybrid Detection (OpenCV + Gemini)...');
    
    try {
      // Step 1: Get precise boundaries from real Python OpenCV
      console.log('📐 Step 1: Detecting precise boundaries with Python OpenCV...');
      const boundaryResult = await this.detectWithPythonOpenCV(imageBuffer);
      
      // Step 2: Get room labels and semantic understanding from Gemini
      console.log('🤖 Step 2: Getting room labels from Gemini...');
      // Direct call to avoid recursion - we'll improve this later
      const geminiResult = await this.geminiService.detectFloorPlan(imageBuffer);
      
      // Step 3: Match Gemini labels to OpenCV boundaries
      console.log('🔄 Step 3: Matching labels to boundaries...');
      const matchedRooms = this.matchRoomsToLabels(
        boundaryResult.rooms,
        geminiResult.detailed_rooms
      );
      
      // Step 4: Use OpenCV's precise walls
      const walls = boundaryResult.walls.map(wall => ({
        start: [wall.start.x, wall.start.y],
        end: [wall.end.x, wall.end.y],
        thickness: 5
      }));
      
      // Calculate statistics
      const roomTypes = [...new Set(matchedRooms.map(r => r.type))];
      const totalArea = matchedRooms.reduce((sum, room) => sum + room.area, 0);
      
      console.log(`✅ Hybrid detection complete: ${matchedRooms.length} rooms with precise boundaries`);
      
      return {
        rooms_detected: matchedRooms.length,
        total_sqft: totalArea,
        confidence: 0.95, // High confidence due to dual verification
        room_types: roomTypes,
        wall_count: walls.length,
        door_count: geminiResult.door_count || 0,
        window_count: geminiResult.window_count || 0,
        detailed_rooms: matchedRooms,
        detailed_walls: walls
      };
      
    } catch (error) {
      console.error('❌ Hybrid detection failed:', error);
      // Fall back to Gemini-only detection
      return this.geminiService.detectFloorPlan(imageBuffer);
    }
  }
  
  private matchRoomsToLabels(
    opencvRooms: any[],
    geminiRooms: Room[]
  ): Room[] {
    console.log(`📊 Matching ${opencvRooms.length} OpenCV rooms to ${geminiRooms.length} Gemini labels`);
    
    const matchedRooms: Room[] = [];
    
    // For each OpenCV room, find the best matching Gemini room
    for (const cvRoom of opencvRooms) {
      let bestMatch: Room | null = null;
      let bestScore = 0;
      
      // Calculate center point of OpenCV room
      const cvCenter = this.calculateCenter(cvRoom.coordinates);
      
      for (const geminiRoom of geminiRooms) {
        // Calculate overlap/proximity score
        const score = this.calculateMatchScore(cvRoom, geminiRoom, cvCenter);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = geminiRoom;
        }
      }
      
      // Create room with OpenCV's precise boundaries and Gemini's labels
      if (bestMatch && bestScore > 0.3) {
        matchedRooms.push({
          type: bestMatch.type,
          area: bestMatch.area,
          confidence: bestScore,
          coordinates: cvRoom.coordinates, // Use OpenCV's precise coordinates
          label: bestMatch.label || bestMatch.type.toUpperCase()
        });
      } else {
        // No good match found, use OpenCV boundaries with generic label
        matchedRooms.push({
          type: 'room',
          area: this.calculateArea(cvRoom.coordinates),
          confidence: 0.5,
          coordinates: cvRoom.coordinates,
          label: 'ROOM'
        });
      }
    }
    
    return matchedRooms;
  }
  
  private calculateCenter(coordinates: number[][]): [number, number] {
    if (!coordinates || coordinates.length === 0) {
      return [0.5, 0.5];
    }
    
    let sumX = 0, sumY = 0;
    for (const coord of coordinates) {
      sumX += coord[0];
      sumY += coord[1];
    }
    
    return [sumX / coordinates.length, sumY / coordinates.length];
  }
  
  private calculateMatchScore(cvRoom: any, geminiRoom: Room, cvCenter: [number, number]): number {
    // Calculate distance between room centers
    const geminiCenter = this.calculateCenter(geminiRoom.coordinates);
    const distance = Math.sqrt(
      Math.pow(cvCenter[0] - geminiCenter[0], 2) +
      Math.pow(cvCenter[1] - geminiCenter[1], 2)
    );
    
    // Calculate area similarity
    const cvArea = this.calculateArea(cvRoom.coordinates);
    const areaDiff = Math.abs(cvArea - geminiRoom.area) / Math.max(cvArea, geminiRoom.area);
    
    // Calculate bounding box overlap
    const overlap = this.calculateOverlap(cvRoom.coordinates, geminiRoom.coordinates);
    
    // Weighted score (closer = better, similar area = better, more overlap = better)
    const distanceScore = Math.max(0, 1 - distance * 2); // Normalize distance
    const areaScore = Math.max(0, 1 - areaDiff);
    const overlapScore = overlap;
    
    // Weighted combination
    return (distanceScore * 0.4) + (areaScore * 0.2) + (overlapScore * 0.4);
  }
  
  private calculateArea(coordinates: number[][]): number {
    if (!coordinates || coordinates.length < 3) return 0;
    
    // Shoelace formula for polygon area
    let area = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      area += coordinates[i][0] * coordinates[i + 1][1];
      area -= coordinates[i + 1][0] * coordinates[i][1];
    }
    
    // Convert from normalized units to approximate square feet
    return Math.abs(area / 2) * 2000; // Rough conversion factor
  }
  
  private calculateOverlap(coords1: number[][], coords2: number[][]): number {
    // Simple bounding box overlap calculation
    const bbox1 = this.getBoundingBox(coords1);
    const bbox2 = this.getBoundingBox(coords2);
    
    // Calculate intersection
    const xOverlap = Math.max(0, 
      Math.min(bbox1.maxX, bbox2.maxX) - Math.max(bbox1.minX, bbox2.minX)
    );
    const yOverlap = Math.max(0,
      Math.min(bbox1.maxY, bbox2.maxY) - Math.max(bbox1.minY, bbox2.minY)
    );
    
    const intersectionArea = xOverlap * yOverlap;
    const bbox1Area = (bbox1.maxX - bbox1.minX) * (bbox1.maxY - bbox1.minY);
    const bbox2Area = (bbox2.maxX - bbox2.minX) * (bbox2.maxY - bbox2.minY);
    
    // IoU (Intersection over Union)
    return intersectionArea / (bbox1Area + bbox2Area - intersectionArea);
  }
  
  private getBoundingBox(coordinates: number[][]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    if (!coordinates || coordinates.length === 0) {
      return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const coord of coordinates) {
      minX = Math.min(minX, coord[0]);
      maxX = Math.max(maxX, coord[0]);
      minY = Math.min(minY, coord[1]);
      maxY = Math.max(maxY, coord[1]);
    }
    
    return { minX, maxX, minY, maxY };
  }
  
  private async detectWithPythonOpenCV(imageBuffer: Buffer): Promise<any> {
    return new Promise((resolve, reject) => {
      // Save image to temp file
      const tempPath = path.join(process.cwd(), 'temp_floor_plan.png');
      fs.writeFileSync(tempPath, imageBuffer);
      
      // Run Python OpenCV detector (using simple version for speed)
      const pythonScript = path.join(process.cwd(), 'simple_opencv_detector.py');
      const pythonProcess = spawn('python3', [pythonScript, tempPath]);
      
      let outputData = '';
      let errorData = '';
      
      pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.error('Failed to delete temp file:', e);
        }
        
        if (code === 0) {
          try {
            const result = JSON.parse(outputData);
            if (result.success) {
              console.log(`✅ Python OpenCV detected ${result.rooms.length} rooms and ${result.walls.length} walls`);
              
              // Convert Python format to our format
              const rooms = result.rooms.map(room => ({
                contour: { points: [], area: room.area, center: { x: room.center[0], y: room.center[1] } },
                coordinates: room.coordinates,
                type: undefined,
                label: undefined
              }));
              
              const walls = result.walls.map(wall => ({
                start: { x: wall.start[0], y: wall.start[1] },
                end: { x: wall.end[0], y: wall.end[1] },
                angle: 0,
                length: wall.length
              }));
              
              resolve({
                rooms,
                walls,
                imageSize: result.image_size
              });
            } else {
              reject(new Error(result.error || 'OpenCV detection failed'));
            }
          } catch (parseError) {
            reject(new Error('Failed to parse Python output: ' + parseError.message));
          }
        } else {
          reject(new Error('Python process exited with code ' + code + ': ' + errorData));
        }
      });
      
      pythonProcess.on('error', (err) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          // Ignore
        }
        reject(err);
      });
    });
  }
}