/**
 * RasterScan Floor Plan Recognition Service
 * Uses RapidAPI Floor Plan Digitalization API
 */

import axios from 'axios';
import * as fs from 'fs';

interface RoomDimensions {
  width: number;
  length: number;
  height: number;
  perimeter: number;
}

interface RoomFeatures {
  doors: number;
  windows: number;
  closets: number;
  hasFireplace: boolean;
  hasBuiltIns: boolean;
}

interface RoomLocation {
  floor: number;
  position: string; // 'north', 'south', 'east', 'west', 'center'
  adjacentRooms: string[];
}

interface RasterScanRoom {
  id: string;
  name: string;
  type: string;
  subType?: string; // 'master', 'guest', 'half', 'full', etc.
  area: number;
  dimensions: RoomDimensions;
  polygon: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number };
  boundingBox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  features: RoomFeatures;
  location: RoomLocation;
  materials?: {
    flooring?: string;
    walls?: string;
    ceiling?: string;
  };
  fixtures?: Array<{
    type: string;
    position: { x: number; y: number };
    dimensions?: { width: number; depth: number };
  }>;
  lighting?: {
    natural: number; // Number of windows
    artificial: number; // Number of light fixtures
  };
  accessibility?: {
    hasDirectExternalAccess: boolean;
    doorWidth: number;
    clearanceSpace: number;
  };
}

interface RasterScanWall {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  length: number;
  thickness: number;
  type: string; // 'exterior', 'interior', 'load-bearing'
  connectedRooms: string[];
}

interface RasterScanResponse {
  success: boolean;
  data: {
    rooms: RasterScanRoom[];
    walls: RasterScanWall[];
    doors: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      type: string; // 'interior', 'exterior', 'closet', 'sliding'
      swing: string; // 'left', 'right', 'double', 'pocket'
    }>;
    windows: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      type: string; // 'single', 'double', 'bay', 'sliding'
      exposure: string; // 'north', 'south', 'east', 'west'
    }>;
    stairs: Array<{
      x: number;
      y: number;
      width: number;
      steps: number;
      direction: string; // 'up', 'down'
    }>;
    totalArea: number;
    buildableArea: number;
    circulation: number; // Hallway/corridor space
    storageArea: number; // Closets/storage
    livingArea: number; // Living spaces only
    metadata: {
      processingTime: number;
      imageWidth: number;
      imageHeight: number;
      scale: number; // pixels per foot
      confidence: number; // 0-1 detection confidence
      detected: {
        rooms: number;
        walls: number;
        doors: number;
        windows: number;
      };
    };
  };
}

export class RasterScanService {
  private apiKey: string;
  private apiHost: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || '';
    this.apiHost = 'floor-plan-digitalization.p.rapidapi.com';
    this.apiUrl = `https://${this.apiHost}/raster-to-vector-base64`;

    if (!this.apiKey) {
      console.warn('⚠️ RapidAPI key not found. Set RAPIDAPI_KEY in .env');
    }
  }

  /**
   * Process floor plan image with RasterScan
   */
  async processFloorPlan(imagePath: string): Promise<RasterScanResponse> {
    try {
      console.log('🔍 Processing floor plan with RasterScan:', imagePath);

      if (!this.apiKey) {
        throw new Error('RapidAPI key not configured');
      }

      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Call RasterScan API (actual format from RapidAPI)
      const response = await axios.post(
        this.apiUrl,
        {
          image: base64Image
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-key': this.apiKey,
            'x-rapidapi-host': this.apiHost
          },
          timeout: 60000
        }
      );

      console.log('✅ RasterScan processing complete');

      return this.formatResponse(response.data);
    } catch (error: any) {
      console.error('❌ RasterScan error:', error.message);

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }

      throw new Error(`RasterScan processing failed: ${error.message}`);
    }
  }

  /**
   * Format RasterScan response with enhanced room information
   */
  private formatResponse(rawData: any): RasterScanResponse {
    const data = rawData.result || rawData.data || rawData;

    return {
      success: true,
      data: {
        rooms: this.extractEnhancedRooms(data),
        walls: this.extractWalls(data),
        doors: this.extractDoors(data),
        windows: this.extractWindows(data),
        stairs: this.extractStairs(data),
        totalArea: this.calculateTotalArea(data),
        buildableArea: this.calculateBuildableArea(data),
        circulation: this.calculateCirculation(data),
        storageArea: this.calculateStorageArea(data),
        livingArea: this.calculateLivingArea(data),
        metadata: {
          processingTime: data.processing_time || 0,
          imageWidth: data.image_width || 0,
          imageHeight: data.image_height || 0,
          scale: data.scale || 1,
          confidence: data.confidence || 0.85,
          detected: {
            rooms: (data.rooms || []).length,
            walls: (data.walls || []).length,
            doors: (data.doors || []).length,
            windows: (data.windows || []).length
          }
        }
      }
    };
  }

  /**
   * Extract enhanced room information
   */
  private extractEnhancedRooms(data: any): RasterScanRoom[] {
    if (!data.rooms && !data.spaces) {
      return [];
    }

    const rooms = data.rooms || data.spaces || [];

    return rooms.map((room: any, index: number) => {
      const polygon = room.polygon || room.coordinates || [];
      const dimensions = this.calculateRoomDimensions(polygon);
      const centroid = this.calculateCentroid(polygon);
      const boundingBox = this.calculateBoundingBox(polygon);

      return {
        id: room.id || `room-${index}`,
        name: this.getRoomName(room.type || 'unknown', index),
        type: room.type || 'unknown',
        subType: room.subType || this.inferSubType(room.type, room.area),
        area: room.area || room.square_footage || 0,
        dimensions: {
          width: dimensions.width,
          length: dimensions.length,
          height: room.height || 9, // Default 9ft ceiling
          perimeter: dimensions.perimeter
        },
        polygon,
        centroid,
        boundingBox,
        features: {
          doors: room.door_count || 0,
          windows: room.window_count || 0,
          closets: room.closet_count || 0,
          hasFireplace: room.has_fireplace || false,
          hasBuiltIns: room.has_built_ins || false
        },
        location: {
          floor: room.floor || 0,
          position: this.inferPosition(centroid, data),
          adjacentRooms: room.adjacent_rooms || []
        },
        materials: room.materials || {},
        fixtures: room.fixtures || [],
        lighting: {
          natural: room.window_count || 0,
          artificial: room.light_fixtures || 0
        },
        accessibility: {
          hasDirectExternalAccess: room.has_external_door || false,
          doorWidth: room.door_width || 36, // inches
          clearanceSpace: room.clearance || 0
        }
      };
    });
  }

  /**
   * Calculate room dimensions from polygon
   */
  private calculateRoomDimensions(polygon: Array<{ x: number; y: number }>): {
    width: number;
    length: number;
    perimeter: number;
  } {
    if (!polygon || polygon.length < 3) {
      return { width: 0, length: 0, perimeter: 0 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let perimeter = 0;

    polygon.forEach((point, i) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);

      // Calculate perimeter
      const nextPoint = polygon[(i + 1) % polygon.length];
      const dx = nextPoint.x - point.x;
      const dy = nextPoint.y - point.y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    });

    return {
      width: maxX - minX,
      length: maxY - minY,
      perimeter
    };
  }

  /**
   * Calculate centroid of polygon
   */
  private calculateCentroid(polygon: Array<{ x: number; y: number }>): { x: number; y: number } {
    if (!polygon || polygon.length === 0) {
      return { x: 0, y: 0 };
    }

    const sum = polygon.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / polygon.length,
      y: sum.y / polygon.length
    };
  }

  /**
   * Calculate bounding box
   */
  private calculateBoundingBox(polygon: Array<{ x: number; y: number }>) {
    if (!polygon || polygon.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    polygon.forEach(point => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });

    return { minX, maxX, minY, maxY };
  }

  /**
   * Infer room subtype based on type and area
   */
  private inferSubType(type: string, area: number): string | undefined {
    if (type === 'bedroom') {
      if (area > 200) return 'master';
      if (area > 120) return 'secondary';
      return 'small';
    }

    if (type === 'bathroom') {
      if (area < 40) return 'half';
      if (area < 80) return 'full';
      return 'master';
    }

    return undefined;
  }

  /**
   * Infer room position (north, south, east, west, center)
   */
  private inferPosition(centroid: { x: number; y: number }, data: any): string {
    // Simplified position detection
    const allRooms = data.rooms || [];
    if (allRooms.length === 0) return 'center';

    // Calculate center of floor plan
    const avgX = allRooms.reduce((sum: number, r: any) => sum + (r.centroid?.x || 0), 0) / allRooms.length;
    const avgY = allRooms.reduce((sum: number, r: any) => sum + (r.centroid?.y || 0), 0) / allRooms.length;

    // Determine position relative to center
    if (Math.abs(centroid.x - avgX) < 50 && Math.abs(centroid.y - avgY) < 50) {
      return 'center';
    }

    if (centroid.y < avgY) return 'north';
    if (centroid.y > avgY) return 'south';
    if (centroid.x < avgX) return 'west';
    return 'east';
  }

  /**
   * Extract walls with enhanced information
   */
  private extractWalls(data: any): RasterScanWall[] {
    if (!data.walls) return [];

    return data.walls.map((wall: any, index: number) => ({
      id: wall.id || `wall-${index}`,
      start: wall.start || wall.p1 || { x: 0, y: 0 },
      end: wall.end || wall.p2 || { x: 0, y: 0 },
      length: wall.length || 0,
      thickness: wall.thickness || 6, // inches
      type: wall.type || 'interior',
      connectedRooms: wall.connected_rooms || []
    }));
  }

  /**
   * Extract doors with detailed information
   */
  private extractDoors(data: any) {
    if (!data.doors) return [];

    return data.doors.map((door: any) => ({
      x: door.x || door.position?.x || 0,
      y: door.y || door.position?.y || 0,
      width: door.width || 36, // inches
      height: door.height || 80, // inches
      type: door.type || 'interior',
      swing: door.swing || 'right'
    }));
  }

  /**
   * Extract windows with detailed information
   */
  private extractWindows(data: any) {
    if (!data.windows) return [];

    return data.windows.map((window: any) => ({
      x: window.x || window.position?.x || 0,
      y: window.y || window.position?.y || 0,
      width: window.width || 36, // inches
      height: window.height || 48, // inches
      type: window.type || 'single',
      exposure: window.exposure || 'unknown'
    }));
  }

  /**
   * Extract stairs
   */
  private extractStairs(data: any) {
    if (!data.stairs) return [];

    return data.stairs.map((stair: any) => ({
      x: stair.x || 0,
      y: stair.y || 0,
      width: stair.width || 36,
      steps: stair.steps || 12,
      direction: stair.direction || 'up'
    }));
  }

  /**
   * Calculate total area
   */
  private calculateTotalArea(data: any): number {
    const rooms = data.rooms || [];
    return rooms.reduce((total: number, room: any) => total + (room.area || 0), 0);
  }

  /**
   * Calculate buildable area (excluding walls)
   */
  private calculateBuildableArea(data: any): number {
    return this.calculateTotalArea(data) * 0.95; // Approximate
  }

  /**
   * Calculate circulation space (hallways, stairs)
   */
  private calculateCirculation(data: any): number {
    const rooms = data.rooms || [];
    return rooms
      .filter((r: any) => r.type === 'hallway' || r.type === 'corridor')
      .reduce((total: number, room: any) => total + (room.area || 0), 0);
  }

  /**
   * Calculate storage area (closets, pantry)
   */
  private calculateStorageArea(data: any): number {
    const rooms = data.rooms || [];
    return rooms
      .filter((r: any) => r.type === 'closet' || r.type === 'pantry' || r.type === 'storage')
      .reduce((total: number, room: any) => total + (room.area || 0), 0);
  }

  /**
   * Calculate living area (bedrooms, living rooms, etc.)
   */
  private calculateLivingArea(data: any): number {
    const livingTypes = ['bedroom', 'living', 'dining', 'kitchen', 'family', 'den', 'office'];
    const rooms = data.rooms || [];
    return rooms
      .filter((r: any) => livingTypes.includes(r.type))
      .reduce((total: number, room: any) => total + (room.area || 0), 0);
  }

  /**
   * Convert to FloorPlansTab compatible format
   */
  convertToFloorPlanFormat(rasterData: RasterScanResponse) {
    return {
      rooms: rasterData.data.rooms.map(room => ({
        id: room.id,
        name: room.name,
        type: room.type,
        squareFootage: room.area,
        vertices: room.polygon,
        floor: room.location.floor,
        isExterior: false,
        // Enhanced data
        dimensions: room.dimensions,
        features: room.features,
        location: room.location,
        centroid: room.centroid,
        boundingBox: room.boundingBox
      })),
      walls: rasterData.data.walls,
      doors: rasterData.data.doors,
      windows: rasterData.data.windows,
      stairs: rasterData.data.stairs,
      totalSquareFootage: rasterData.data.totalArea,
      buildableArea: rasterData.data.buildableArea,
      circulationArea: rasterData.data.circulation,
      storageArea: rasterData.data.storageArea,
      livingArea: rasterData.data.livingArea,
      metadata: {
        source: 'rasterscan',
        timestamp: new Date().toISOString(),
        ...rasterData.data.metadata
      }
    };
  }

  /**
   * Get human-readable room name
   */
  private getRoomName(type: string, index: number): string {
    const names: { [key: string]: string } = {
      bedroom: 'Bedroom',
      bathroom: 'Bathroom',
      kitchen: 'Kitchen',
      living: 'Living Room',
      dining: 'Dining Room',
      hallway: 'Hallway',
      closet: 'Closet',
      garage: 'Garage',
      office: 'Office',
      den: 'Den',
      family: 'Family Room',
      laundry: 'Laundry Room',
      pantry: 'Pantry',
      storage: 'Storage',
      unknown: 'Room'
    };

    const baseName = names[type.toLowerCase()] || 'Room';
    return `${baseName} ${index + 1}`;
  }
}
