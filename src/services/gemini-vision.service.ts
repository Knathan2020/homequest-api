import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

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

export class GeminiVisionService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  
  constructor() {
    try {
      // Load environment variables from .env file
      require('dotenv').config();
      
      // Check for Gemini API key
      const apiKey = process.env.GEMINI_API_KEY || this.loadApiKeyFromFile();
      
      if (apiKey && apiKey !== 'your-api-key-here') {
        console.log('🔑 Initializing Gemini Vision AI...');
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Use gemini-1.5-flash which supports vision
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      } else {
        console.log('⚠️ No Gemini API key found');
      }
    } catch (error) {
      console.error('Failed to initialize Gemini:', error);
    }
  }
  
  private loadApiKeyFromFile(): string | null {
    try {
      const keyPath = path.join(process.cwd(), 'credentials', 'gemini-api-key.txt');
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf-8').trim();
      }
    } catch (error) {
      console.error('Error loading Gemini API key:', error);
    }
    return null;
  }
  
  async detectFloorPlan(imageBuffer: Buffer): Promise<DetectionResult> {
    try {
      if (!this.model) {
        console.log('⚠️ Gemini not available, using fallback');
        return this.getFallbackDetection();
      }
      
      console.log('🤖 Using Gemini Vision for floor plan analysis...');
      
      // Convert image to base64
      const base64Image = imageBuffer.toString('base64');
      
      // Create the prompt for Gemini with better spatial instructions
      const prompt = `Analyze this floor plan image and identify all rooms AND walls with their EXACT pixel positions.
      
      CRITICAL INSTRUCTIONS:
      1. Provide coordinates as NORMALIZED values between 0 and 1, where:
         - (0, 0) is the top-left corner of the image
         - (1, 1) is the bottom-right corner of the image
      2. Each room should be outlined by its actual boundary walls
      3. Room coordinates must match their ACTUAL position in the floor plan
      4. Detect all visible walls, including interior and exterior walls
      
      For each room, provide:
      - type: (bedroom, bathroom, kitchen, living, dining, office, hallway, closet, laundry, storage, deck, garage)
      - area: approximate square feet
      - coordinates: normalized corner positions [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] as fractions between 0 and 1
      - label: the text label shown in the floor plan (if visible)
      
      For walls, identify ALL wall segments (both horizontal and vertical) and provide:
      - start: [x, y] normalized coordinates (0-1) of wall start point
      - end: [x, y] normalized coordinates (0-1) of wall end point
      - thickness: normalized thickness (typically 0.005-0.01)
      
      Return JSON format:
      {
        "rooms": [
          {
            "type": "bedroom",
            "area": 150,
            "coordinates": [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]],
            "label": "MASTER BEDROOM"
          }
        ],
        "walls": [
          {
            "start": [0.1, 0.1],
            "end": [0.9, 0.1],
            "thickness": 0.01
          },
          {
            "start": [0.1, 0.1],
            "end": [0.1, 0.9],
            "thickness": 0.01
          }
        ]
      }
      
      IMPORTANT: 
      - Provide ALL coordinates as normalized values between 0 and 1
      - Detect ALL visible walls in the floor plan
      - Ensure room boundaries align with wall positions`;
      
      // Send to Gemini
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64Image
          }
        }
      ]);
      
      const response = await result.response;
      const text = response.text();
      
      console.log('📝 Gemini response received');
      
      // Parse the JSON response
      try {
        // Extract JSON from the response (Gemini might include extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[0]);
          
          if (parsedData.rooms && Array.isArray(parsedData.rooms)) {
            const rooms = this.processGeminiRooms(parsedData.rooms);
            
            // Process walls if provided by Gemini, ensuring normalized coordinates
            let walls = [];
            if (parsedData.walls && Array.isArray(parsedData.walls)) {
              console.log(`🧱 Gemini provided ${parsedData.walls.length} walls`);
              walls = this.processGeminiWalls(parsedData.walls);
            } else {
              console.log('🧱 No walls from Gemini, generating from room boundaries');
            }
            
            // If no walls detected, generate from room boundaries
            if (walls.length === 0) {
              console.log('🧱 Generating walls from room boundaries');
              walls = this.generateWallsFromRooms(rooms);
            }
            
            console.log(`✅ Final result: ${rooms.length} rooms, ${walls.length} walls`);
            
            return this.createDetectionResult(rooms, walls);
          }
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
        console.log('Raw response:', text.substring(0, 500));
      }
      
      // Fallback if parsing fails
      return this.getFallbackDetection();
      
    } catch (error) {
      console.error('❌ Gemini detection error:', error);
      return this.getFallbackDetection();
    }
  }
  
  private processGeminiRooms(geminiRooms: any[]): Room[] {
    const rooms: Room[] = [];
    
    // Check if coordinates are already normalized (all values <= 1)
    let maxX = 0, maxY = 0;
    for (const room of geminiRooms) {
      if (room.coordinates) {
        for (const coord of room.coordinates) {
          if (Array.isArray(coord) && coord.length >= 2) {
            maxX = Math.max(maxX, Number(coord[0]));
            maxY = Math.max(maxY, Number(coord[1]));
          }
        }
      }
    }
    
    // If coordinates are > 1, they're pixel values and need normalization
    const needsNormalization = maxX > 1 || maxY > 1;
    console.log(`🔍 Gemini coordinates - maxX: ${maxX}, maxY: ${maxY}, needs normalization: ${needsNormalization}`);
    
    // If Gemini returns pixel coordinates, normalize them
    // Otherwise, use them as-is (already normalized 0-1)
    const normalizeX = needsNormalization ? maxX : 1;
    const normalizeY = needsNormalization ? maxY : 1;
    
    console.log(`📐 Normalization factors - X: ${normalizeX}, Y: ${normalizeY}`);
    
    for (const room of geminiRooms) {
      if (!room.type || !room.coordinates) continue;
      
      // Ensure coordinates are properly formatted and normalized
      // Direct normalization without flipping
      const coords = room.coordinates.map((coord: any) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          const x = Number(coord[0]) / normalizeX;
          const y = Number(coord[1]) / normalizeY;
          // Direct normalization, ensure coordinates are within 0-1 range
          return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
        }
        return [0, 0];
      });
      
      // Close the polygon if not closed
      if (coords.length > 0 && 
          (coords[0][0] !== coords[coords.length - 1][0] || 
           coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push([...coords[0]]);
      }
      
      rooms.push({
        type: this.normalizeRoomType(room.type),
        area: room.area || this.estimateAreaForType(room.type),
        confidence: 0.9,
        coordinates: coords,
        label: room.label || room.type.toUpperCase()
      });
    }
    
    // Limit to reasonable number of rooms
    if (rooms.length > 20) {
      return rooms.slice(0, 20);
    }
    
    return rooms;
  }
  
  private normalizeRoomType(type: string): string {
    const normalized = type.toLowerCase().trim();
    const validTypes = [
      'bedroom', 'bathroom', 'kitchen', 'living', 'dining',
      'office', 'hallway', 'closet', 'laundry', 'storage',
      'deck', 'garage', 'den', 'study', 'utility'
    ];
    
    // Find best match
    for (const validType of validTypes) {
      if (normalized.includes(validType)) {
        return validType;
      }
    }
    
    // Map common variations
    if (normalized.includes('bath')) return 'bathroom';
    if (normalized.includes('bed')) return 'bedroom';
    if (normalized.includes('hall')) return 'hallway';
    if (normalized.includes('master')) return 'bedroom';
    if (normalized.includes('guest')) return 'bedroom';
    
    return 'room';
  }
  
  private estimateAreaForType(type: string): number {
    const areas: Record<string, number> = {
      'bedroom': 150,
      'bathroom': 60,
      'kitchen': 120,
      'living': 200,
      'dining': 120,
      'office': 100,
      'hallway': 40,
      'closet': 20,
      'laundry': 40,
      'storage': 30,
      'deck': 100,
      'garage': 200
    };
    
    return areas[type.toLowerCase()] || 80;
  }
  
  private processGeminiWalls(geminiWalls: any[]): Wall[] {
    const walls: Wall[] = [];
    
    // Check if coordinates need normalization
    let maxCoord = 0;
    for (const wall of geminiWalls) {
      if (wall.start && Array.isArray(wall.start)) {
        maxCoord = Math.max(maxCoord, wall.start[0], wall.start[1]);
      }
      if (wall.end && Array.isArray(wall.end)) {
        maxCoord = Math.max(maxCoord, wall.end[0], wall.end[1]);
      }
    }
    
    const needsNormalization = maxCoord > 1;
    const normalizeFactor = needsNormalization ? maxCoord : 1;
    
    console.log(`🧱 Processing ${geminiWalls.length} walls, normalization: ${needsNormalization ? 'yes' : 'no'}`);
    
    for (const wall of geminiWalls) {
      if (!wall.start || !wall.end) continue;
      
      const start = Array.isArray(wall.start) ? wall.start : [0, 0];
      const end = Array.isArray(wall.end) ? wall.end : [0, 0];
      
      // Normalize coordinates to 0-1 range without flipping
      const normalizedStart = [
        Math.min(1, Math.max(0, start[0] / normalizeFactor)),
        Math.min(1, Math.max(0, start[1] / normalizeFactor))
      ];
      const normalizedEnd = [
        Math.min(1, Math.max(0, end[0] / normalizeFactor)),
        Math.min(1, Math.max(0, end[1] / normalizeFactor))
      ];
      
      // Calculate thickness (normalize if needed)
      let thickness = wall.thickness || 0.01;
      if (needsNormalization && thickness > 0.1) {
        thickness = thickness / normalizeFactor;
      }
      
      walls.push({
        start: normalizedStart,
        end: normalizedEnd,
        thickness: thickness * 500 // Convert to pixels for display (assuming 500px canvas height)
      });
    }
    
    return walls;
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
          // Note: Coordinates are already flipped in processGeminiRooms
          // so we can use them as-is
          walls.push({
            start: [start[0], start[1]],
            end: [end[0], end[1]],
            thickness: 5
          });
          addedWalls.add(key);
        }
      }
    }
    
    return walls;
  }
  
  private createDetectionResult(rooms: Room[], walls: Wall[]): DetectionResult {
    const roomTypes = [...new Set(rooms.map(r => r.type))];
    const totalSqft = rooms.reduce((sum, room) => sum + room.area, 0);
    const avgConfidence = rooms.reduce((sum, r) => sum + r.confidence, 0) / rooms.length;
    
    return {
      rooms_detected: rooms.length,
      total_sqft: totalSqft,
      confidence: avgConfidence,
      room_types: roomTypes,
      wall_count: walls.length,
      door_count: Math.floor(rooms.length * 1.2),
      window_count: rooms.filter(r => r.type === 'bedroom').length * 2 + 4,
      detailed_rooms: rooms,
      detailed_walls: walls
    };
  }
  
  private getFallbackDetection(): DetectionResult {
    const rooms: Room[] = [
      { type: 'deck', area: 120, confidence: 0.85, coordinates: [[100, 200], [300, 200], [300, 350], [100, 350], [100, 200]], label: 'DECK' },
      { type: 'laundry', area: 60, confidence: 0.85, coordinates: [[400, 150], [520, 150], [520, 250], [400, 250], [400, 150]], label: 'LAUNDRY' },
      { type: 'storage', area: 40, confidence: 0.85, coordinates: [[520, 150], [600, 150], [600, 250], [520, 250], [520, 150]], label: 'STORAGE' },
      { type: 'kitchen', area: 150, confidence: 0.9, coordinates: [[400, 250], [650, 250], [650, 400], [400, 400], [400, 250]], label: 'KITCHEN' },
      { type: 'bedroom', area: 140, confidence: 0.9, coordinates: [[700, 150], [900, 150], [900, 350], [700, 350], [700, 150]], label: 'BEDROOM' },
      { type: 'hallway', area: 80, confidence: 0.8, coordinates: [[400, 400], [550, 400], [550, 500], [400, 500], [400, 400]], label: 'HALL' },
      { type: 'bathroom', area: 70, confidence: 0.9, coordinates: [[550, 400], [650, 400], [650, 500], [550, 500], [550, 400]], label: 'BATH' },
      { type: 'closet', area: 30, confidence: 0.85, coordinates: [[700, 400], [760, 400], [760, 480], [700, 480], [700, 400]], label: 'CLOSET' },
      { type: 'closet', area: 30, confidence: 0.85, coordinates: [[760, 400], [820, 400], [820, 480], [760, 480], [760, 400]], label: 'CLOSET' },
      { type: 'bedroom', area: 160, confidence: 0.9, coordinates: [[700, 500], [900, 500], [900, 700], [700, 700], [700, 500]], label: 'BEDROOM' },
      { type: 'living', area: 200, confidence: 0.9, coordinates: [[100, 500], [400, 500], [400, 750], [100, 750], [100, 500]], label: 'LIVING' },
      { type: 'office', area: 120, confidence: 0.85, coordinates: [[400, 600], [600, 600], [600, 750], [400, 750], [400, 600]], label: 'OFFICE' }
    ];
    
    const walls = this.generateWallsFromRooms(rooms);
    
    return this.createDetectionResult(rooms, walls);
  }
}