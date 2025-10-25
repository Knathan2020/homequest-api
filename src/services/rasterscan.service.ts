/**
 * RasterScan Floor Plan Recognition Service
 * Uses RapidAPI Floor Plan Digitalization API + GPT Vision for room analysis
 */

import axios from 'axios';
import * as fs from 'fs';
import { gptVisionDetector } from './gpt-vision-detection.service';

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
    // Check if running in development with Docker or production with RapidAPI
    const useDockerLocal = process.env.RASTERSCAN_USE_DOCKER === 'true' ||
                           process.env.NODE_ENV === 'development';

    if (useDockerLocal) {
      // Use local Docker RasterScan service for development
      this.apiKey = '';
      this.apiHost = 'localhost:8888';
      this.apiUrl = `http://${this.apiHost}/plan_recognition_on_base64`;
      console.log('✅ Using local RasterScan Docker service at', this.apiUrl);
    } else {
      // Use RapidAPI for production/Render deployment
      this.apiKey = process.env.RAPIDAPI_KEY || '';
      this.apiHost = 'floor-plan-digitalization.p.rapidapi.com';
      this.apiUrl = `https://${this.apiHost}/raster-to-vector-base64`;
      console.log('✅ Using RapidAPI RasterScan service at', this.apiUrl);

      if (!this.apiKey) {
        console.warn('⚠️ RapidAPI key not found. Set RAPIDAPI_KEY in .env');
      }
    }
  }

  /**
   * Process floor plan image with RasterScan
   */
  async processFloorPlan(imagePath: string): Promise<RasterScanResponse> {
    try {
      const isDocker = this.apiUrl.includes('localhost');
      console.log(`🔍 Processing floor plan with ${isDocker ? 'Docker' : 'RapidAPI'}:`, imagePath);

      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Prepare headers based on API type
      const headers: any = {
        'Content-Type': 'application/json'
      };

      if (!isDocker && this.apiKey) {
        headers['x-rapidapi-key'] = this.apiKey;
        headers['x-rapidapi-host'] = this.apiHost;
      }

      // Call RasterScan API (Docker or RapidAPI)
      const response = await axios.post(
        this.apiUrl,
        {
          image: base64Image
        },
        {
          headers,
          timeout: 60000
        }
      );

      console.log(`✅ RasterScan ${isDocker ? 'Docker' : 'RapidAPI'} processing complete`);
      console.log('🔍 RAW RESPONSE:', JSON.stringify(response.data, null, 2).substring(0, 2000));

      // Check response format (Docker vs RapidAPI)
      const plan = response.data.plans?.[0] || response.data;
      console.log('📊 Walls count:', (plan.walls || []).length);
      console.log('🚪 Doors count:', (plan.doors || []).length);
      console.log('🪟 Windows count:', (plan.windows || []).length);
      console.log('🏠 Rooms count:', (plan.rooms || plan.spaces || []).length);

      // Log room data structure if present
      if (plan.rooms && plan.rooms.length > 0) {
        console.log('🔍 FIRST ROOM SAMPLE:', JSON.stringify(plan.rooms[0], null, 2));
      } else if (plan.spaces && plan.spaces.length > 0) {
        console.log('🔍 FIRST SPACE SAMPLE:', JSON.stringify(plan.spaces[0], null, 2));
      } else {
        console.log('⚠️ No rooms/spaces in API response');
      }

      if (plan.walls && plan.walls.length > 0) {
        console.log('🔍 FIRST WALL SAMPLE:', JSON.stringify(plan.walls[0], null, 2));
      }
      if (plan.doors && plan.doors.length > 0) {
        console.log('🔍 FIRST DOOR SAMPLE:', JSON.stringify(plan.doors[0], null, 2));
      }
      if (plan.windows && plan.windows.length > 0) {
        console.log('🔍 FIRST WINDOW SAMPLE:', JSON.stringify(plan.windows[0], null, 2));
      }

      return await this.formatResponse(response.data, imagePath);
    } catch (error: any) {
      const isDocker = this.apiUrl.includes('localhost');
      console.error(`❌ RasterScan ${isDocker ? 'Docker' : 'RapidAPI'} error:`, error.message);

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }

      throw new Error(`RasterScan processing failed: ${error.message}`);
    }
  }

  /**
   * Format RasterScan response with enhanced room information
   * Handles both Docker ({ plans: [...] }) and RapidAPI formats
   */
  private async formatResponse(rawData: any, imagePath: string): Promise<RasterScanResponse> {
    // Docker format: { plans: [{ walls: [...], doors: [...], windows: [...] }] }
    // RapidAPI format: { walls: [...], doors: [...], windows: [...] }
    const plan = rawData.plans?.[0] || rawData;

    return {
      success: true,
      data: {
        rooms: await this.extractEnhancedRooms(plan, imagePath),
        walls: this.extractWalls(plan),
        doors: this.extractDoors(plan),
        windows: this.extractWindows(plan),
        stairs: this.extractStairs(plan),
        totalArea: this.calculateTotalArea(plan),
        buildableArea: this.calculateBuildableArea(plan),
        circulation: this.calculateCirculation(plan),
        storageArea: this.calculateStorageArea(plan),
        livingArea: this.calculateLivingArea(plan),
        metadata: {
          processingTime: 0,
          imageWidth: 0,
          imageHeight: 0,
          scale: 1,
          confidence: 0.85,
          detected: {
            rooms: (plan.rooms || []).length,
            walls: (plan.walls || []).length,
            doors: (plan.doors || []).length,
            windows: (plan.windows || []).length
          }
        }
      }
    };
  }

  /**
   * Extract enhanced room information
   * If API only provides centroids, automatically detect rooms from walls
   */
  private async extractEnhancedRooms(data: any, imagePath?: string): Promise<RasterScanRoom[]> {
    const rooms = data.rooms || data.spaces || [];

    // Check if API provides full room polygons (more than 2 vertices)
    if (rooms.length > 0 && rooms[0].polygon && rooms[0].polygon.length > 2) {
      console.log('✅ Using room polygons from API');
      return rooms.map((room: any, index: number) => this.formatRoomData(room, index, data));
    }

    // Check if we have at least centroids
    if (rooms.length > 0 && (rooms[0].x !== undefined || rooms[0].centroid)) {
      console.log('⚠️ API only provided room centroids (no polygons)');
    }

    // API only gave centroids or no rooms - detect from walls
    if (data.walls && data.walls.length > 0) {
      console.log('🔍 Auto-detecting rooms from wall segments with OCR...');
      const dataWithImage = { ...data, imagePath };
      return await this.detectRoomsFromWalls(dataWithImage);
    }

    console.log('⚠️ No room data or wall data available for detection');
    return [];
  }

  /**
   * Format room data from API response
   */
  private formatRoomData(room: any, index: number, data: any): RasterScanRoom {
    const polygon = room.polygon || room.coordinates || [];
    const dimensions = this.calculateRoomDimensions(polygon);
    const centroid = this.calculateCentroid(polygon);
    const boundingBox = this.calculateBoundingBox(polygon);
    const area = room.area || this.calculatePolygonArea(polygon);

    return {
      id: room.id || `room-${index}`,
      name: this.getRoomName(room.type || 'unknown', index),
      type: room.type || 'unknown',
      subType: room.subType || this.inferSubType(room.type, area),
      area,
      dimensions: {
        width: dimensions.width,
        length: dimensions.length,
        height: room.height || 9,
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
        doorWidth: room.door_width || 36,
        clearanceSpace: room.clearance || 0
      }
    };
  }

  /**
   * Detect rooms automatically from wall segments
   * Uses RasterScan for accurate polygons + GPT Vision for intelligent naming
   */
  private async detectRoomsFromWalls(data: any): Promise<RasterScanRoom[]> {
    const walls = this.extractWalls(data);
    const doors = this.extractDoors(data);
    const windows = this.extractWindows(data);

    console.log(`🔍 Detecting rooms from ${walls.length} walls, ${doors.length} doors, ${windows.length} windows`);

    // Step 1: Get raw polygons from wall boundaries (RasterScan)
    const rawPolygons = this.findClosedLoops(walls);
    console.log(`🔷 RasterScan found ${rawPolygons.length} raw polygons`);

    // Step 2: Deduplicate overlapping/duplicate polygons
    const uniquePolygons = this.deduplicatePolygons(rawPolygons);
    console.log(`✅ After deduplication: ${uniquePolygons.length} unique polygons`);

    // Step 3: Get intelligent room names from GPT Vision
    const gptVisionRooms = await this.analyzeRoomsWithGPTVision(data.imagePath);
    console.log(`🤖 GPT Vision detected ${gptVisionRooms.length} rooms`);

    // Step 4: Merge RasterScan polygons with GPT Vision names
    if (uniquePolygons.length > 0 && gptVisionRooms.length > 0) {
      console.log('🔗 Merging RasterScan polygons with GPT Vision room names...');
      return this.mergePolygonsWithGPTVision(uniquePolygons, gptVisionRooms, doors, windows);
    }

    // FALLBACK 1: Use GPT Vision rooms with estimated boundaries if no polygons
    if (gptVisionRooms.length > 0) {
      console.log('⚠️ No polygons found, using GPT Vision rooms with estimated boundaries');
      return gptVisionRooms.map((gptRoom, index) => {
        const size = 50;
        const polygon = [
          { x: gptRoom.position.x - size, y: gptRoom.position.y - size },
          { x: gptRoom.position.x + size, y: gptRoom.position.y - size },
          { x: gptRoom.position.x + size, y: gptRoom.position.y + size },
          { x: gptRoom.position.x - size, y: gptRoom.position.y + size }
        ];
        const area = this.calculatePolygonArea(polygon);
        const centroid = this.calculateCentroid(polygon);
        const dimensions = this.calculateRoomDimensions(polygon);
        const boundingBox = this.calculateBoundingBox(polygon);

        return {
          id: gptRoom.id,
          name: gptRoom.name,
          type: gptRoom.type,
          subType: undefined,
          area,
          dimensions: {
            width: dimensions.width,
            length: dimensions.length,
            height: 9,
            perimeter: dimensions.perimeter
          },
          polygon,
          centroid,
          boundingBox,
          features: {
            doors: 0,
            windows: 0,
            closets: 0,
            hasFireplace: false,
            hasBuiltIns: false
          },
          location: {
            floor: 0,
            position: 'center',
            adjacentRooms: []
          },
          materials: {},
          fixtures: [],
          lighting: {
            natural: 0,
            artificial: 0
          },
          accessibility: {
            hasDirectExternalAccess: false,
            doorWidth: 36,
            clearanceSpace: 0
          }
        };
      });
    }

    // FALLBACK 2: Use polygon detection only if GPT Vision failed
    console.log('⚠️ No GPT Vision data, falling back to polygon-only detection');
    const roomPolygons = uniquePolygons.length > 0 ? uniquePolygons : rawPolygons;
    console.log(`✅ Using ${roomPolygons.length} polygons`);

    return roomPolygons.map((polygon, index) => {
      const area = this.calculatePolygonArea(polygon);
      const dimensions = this.calculateRoomDimensions(polygon);
      const centroid = this.calculateCentroid(polygon);
      const boundingBox = this.calculateBoundingBox(polygon);

      // Count doors and windows inside this room
      const roomDoors = this.countFeaturesInRoom(doors, polygon);
      const roomWindows = this.countFeaturesInRoom(windows, polygon);

      // Fallback: infer room type from size/features
      const roomType = this.inferRoomType(area, dimensions, roomDoors, roomWindows);
      const roomName = this.getRoomName(roomType, index);

      return {
        id: `room-${index}`,
        name: roomName,
        type: roomType,
        subType: this.inferSubType(roomType, area),
        area,
        dimensions: {
          width: dimensions.width,
          length: dimensions.length,
          height: 9, // Default 9ft ceiling
          perimeter: dimensions.perimeter
        },
        polygon,
        centroid,
        boundingBox,
        features: {
          doors: roomDoors,
          windows: roomWindows,
          closets: 0,
          hasFireplace: false,
          hasBuiltIns: false
        },
        location: {
          floor: 0,
          position: this.inferPosition(centroid, data),
          adjacentRooms: []
        },
        materials: {},
        fixtures: [],
        lighting: {
          natural: roomWindows,
          artificial: 0
        },
        accessibility: {
          hasDirectExternalAccess: roomDoors > 0,
          doorWidth: 36,
          clearanceSpace: 0
        }
      };
    });
  }

  /**
   * Find closed loops (polygons) from wall segments
   * Uses graph traversal to detect cycles
   */
  private findClosedLoops(walls: RasterScanWall[]): Array<Array<{ x: number; y: number }>> {
    if (walls.length === 0) return [];

    console.log('🔍 Finding closed loops from wall segments...');

    // Build adjacency graph of wall endpoints
    const graph = new Map<string, Array<{ point: { x: number; y: number }; wallId: string }>>();
    const epsilon = 5; // Tolerance for point matching (5 pixels)

    // Helper to create point key
    const pointKey = (p: { x: number; y: number }) => `${Math.round(p.x / epsilon) * epsilon},${Math.round(p.y / epsilon) * epsilon}`;

    // Build graph
    walls.forEach((wall) => {
      const startKey = pointKey(wall.start);
      const endKey = pointKey(wall.end);

      if (!graph.has(startKey)) graph.set(startKey, []);
      if (!graph.has(endKey)) graph.set(endKey, []);

      graph.get(startKey)!.push({ point: wall.end, wallId: wall.id });
      graph.get(endKey)!.push({ point: wall.start, wallId: wall.id });
    });

    console.log(`📊 Built graph with ${graph.size} nodes`);

    // Find cycles using DFS
    const polygons: Array<Array<{ x: number; y: number }>> = [];
    const visited = new Set<string>();

    for (const [startKey, neighbors] of graph.entries()) {
      if (visited.has(startKey)) continue;

      const startPoint = neighbors[0]?.point || this.parsePoint(startKey);
      const cycle = this.findCycle(startPoint, startPoint, graph, new Set(), epsilon);

      if (cycle && cycle.length >= 4) {
        // Valid room polygon (at least 4 vertices)
        const cycleKey = cycle.map(p => pointKey(p)).sort().join('|');
        if (!visited.has(cycleKey)) {
          polygons.push(cycle);
          visited.add(cycleKey);
          console.log(`✅ Found cycle with ${cycle.length} vertices`);
        }
      }
    }

    return polygons;
  }

  /**
   * Find a cycle starting from a point using DFS
   */
  private findCycle(
    current: { x: number; y: number },
    start: { x: number; y: number },
    graph: Map<string, Array<{ point: { x: number; y: number }; wallId: string }>>,
    visited: Set<string>,
    epsilon: number
  ): Array<{ x: number; y: number }> | null {
    const pointKey = (p: { x: number; y: number }) => `${Math.round(p.x / epsilon) * epsilon},${Math.round(p.y / epsilon) * epsilon}`;
    const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const currentKey = pointKey(current);

    // If we've visited more than 3 points and we're back at start, we found a cycle
    if (visited.size >= 3 && distance(current, start) < epsilon) {
      return [current];
    }

    // Too many steps, abort
    if (visited.size > 20) {
      return null;
    }

    if (visited.has(currentKey)) {
      return null;
    }

    visited.add(currentKey);

    const neighbors = graph.get(currentKey) || [];
    for (const neighbor of neighbors) {
      const result = this.findCycle(neighbor.point, start, graph, new Set(visited), epsilon);
      if (result) {
        return [current, ...result];
      }
    }

    return null;
  }

  /**
   * Parse point from key string
   */
  private parsePoint(key: string): { x: number; y: number } {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }

  /**
   * Deduplicate overlapping polygons
   * Removes polygons that are too similar in area and position
   */
  private deduplicatePolygons(polygons: Array<Array<{ x: number; y: number }>>): Array<Array<{ x: number; y: number }>> {
    if (polygons.length === 0) return [];

    console.log(`🔍 Deduplicating ${polygons.length} polygons...`);

    // Calculate area and centroid for each polygon
    const polygonData = polygons.map((polygon, index) => ({
      polygon,
      area: this.calculatePolygonArea(polygon),
      centroid: this.calculateCentroid(polygon),
      index
    }));

    // Sort by area (largest first) to keep larger rooms
    polygonData.sort((a, b) => b.area - a.area);

    const unique: typeof polygonData = [];
    const areaThreshold = 0.15; // 15% area difference tolerance
    const distanceThreshold = 50; // 50 pixel centroid distance

    for (const current of polygonData) {
      let isDuplicate = false;

      for (const existing of unique) {
        // Calculate area similarity
        const areaDiff = Math.abs(current.area - existing.area) / Math.max(current.area, existing.area);

        // Calculate centroid distance
        const dx = current.centroid.x - existing.centroid.x;
        const dy = current.centroid.y - existing.centroid.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If similar area AND close centroids, it's a duplicate
        if (areaDiff < areaThreshold && distance < distanceThreshold) {
          isDuplicate = true;
          console.log(`🚫 Filtered duplicate: area ${current.area.toFixed(0)} vs ${existing.area.toFixed(0)}, distance ${distance.toFixed(1)}px`);
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(current);
      }
    }

    console.log(`✅ Kept ${unique.length} unique polygons after deduplication`);
    return unique.map(p => p.polygon);
  }

  /**
   * Calculate polygon area using Shoelace formula
   */
  private calculatePolygonArea(polygon: Array<{ x: number; y: number }>): number {
    if (polygon.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }

    return Math.abs(area / 2);
  }

  /**
   * Count features (doors/windows) inside a room polygon
   */
  private countFeaturesInRoom(
    features: Array<{ x: number; y: number; width: number; height: number }>,
    polygon: Array<{ x: number; y: number }>
  ): number {
    if (polygon.length < 3) return 0;

    return features.filter((feature) => {
      const featureCenter = {
        x: feature.x + feature.width / 2,
        y: feature.y + feature.height / 2
      };
      return this.isPointInPolygon(featureCenter, polygon);
    }).length;
  }

  /**
   * Check if a point is inside a polygon using ray casting
   */
  private isPointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Analyze rooms using GPT-4 Vision API
   */
  private async analyzeRoomsWithGPTVision(imagePath?: string): Promise<Array<{ id: string; name: string; type: string; position: { x: number; y: number }; confidence: number }>> {
    if (!imagePath || !fs.existsSync(imagePath)) {
      console.warn('⚠️ No image path provided or file does not exist, skipping GPT Vision');
      return [];
    }

    try {
      console.log('🤖 Analyzing floor plan with GPT-4 Vision...');

      // Call GPT Vision detection service
      const result = await gptVisionDetector.detectFloorPlan(imagePath);

      // Extract rooms from GPT Vision results
      const rooms = result.rooms.map(room => ({
        id: room.id,
        name: room.name,
        type: room.type,
        position: room.vertices && room.vertices.length > 0
          ? this.calculateCentroidFromVertices(room.vertices)
          : { x: 0, y: 0 },
        confidence: room.confidence
      }));

      console.log(`✅ GPT Vision detected ${rooms.length} rooms`);
      console.log('🏠 GPT Vision room names:', rooms.map(r => `${r.name} (${r.type})`).join(', '));
      console.log('📍 GPT Vision room positions:', rooms.map(r => `${r.name}: (${r.position.x}, ${r.position.y})`).join(', '));
      return rooms;
    } catch (error) {
      console.warn('⚠️ GPT Vision analysis failed, falling back to inference:', error);
      return [];
    }
  }

  /**
   * Merge RasterScan polygons with GPT Vision room names
   * Uses centroid distance to match polygons to room names
   */
  private mergePolygonsWithGPTVision(
    polygons: Array<Array<{ x: number; y: number }>>,
    gptRooms: Array<{ id: string; name: string; type: string; position: { x: number; y: number }; confidence: number }>,
    doors: Array<{ x: number; y: number; width: number; height: number }>,
    windows: Array<{ x: number; y: number; width: number; height: number }>
  ): RasterScanRoom[] {
    console.log(`🔗 Merging ${polygons.length} polygons with ${gptRooms.length} GPT Vision rooms`);

    const matchedRooms: RasterScanRoom[] = [];
    const usedGPTRooms = new Set<string>();

    for (const polygon of polygons) {
      const area = this.calculatePolygonArea(polygon);
      const centroid = this.calculateCentroid(polygon);
      const dimensions = this.calculateRoomDimensions(polygon);
      const boundingBox = this.calculateBoundingBox(polygon);

      // Find closest GPT Vision room to this polygon
      let closestRoom = null;
      let minDistance = Infinity;

      for (const gptRoom of gptRooms) {
        if (usedGPTRooms.has(gptRoom.id)) continue; // Skip already matched rooms

        const dx = centroid.x - gptRoom.position.x;
        const dy = centroid.y - gptRoom.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance) {
          minDistance = distance;
          closestRoom = gptRoom;
        }
      }

      // Use GPT Vision name if match is close enough (within 200px)
      let roomName = 'Unknown';
      let roomType = 'unknown';
      if (closestRoom && minDistance < 200) {
        roomName = closestRoom.name;
        roomType = closestRoom.type;
        usedGPTRooms.add(closestRoom.id);
        console.log(`✅ Matched polygon (${area.toFixed(0)} sq units) to "${roomName}" (distance: ${minDistance.toFixed(1)}px)`);
      } else {
        // Fallback: infer room type from polygon features
        const roomDoors = this.countFeaturesInRoom(doors, polygon);
        const roomWindows = this.countFeaturesInRoom(windows, polygon);
        roomType = this.inferRoomType(area, dimensions, roomDoors, roomWindows);
        roomName = this.getRoomName(roomType, matchedRooms.length);
        console.log(`⚠️ No GPT match for polygon, inferred as "${roomName}"`);
      }

      // Count features in this room
      const roomDoors = this.countFeaturesInRoom(doors, polygon);
      const roomWindows = this.countFeaturesInRoom(windows, polygon);

      matchedRooms.push({
        id: `room-${matchedRooms.length}`,
        name: roomName,
        type: roomType,
        subType: this.inferSubType(roomType, area),
        area,
        dimensions: {
          width: dimensions.width,
          length: dimensions.length,
          height: 9,
          perimeter: dimensions.perimeter
        },
        polygon,
        centroid,
        boundingBox,
        features: {
          doors: roomDoors,
          windows: roomWindows,
          closets: 0,
          hasFireplace: false,
          hasBuiltIns: false
        },
        location: {
          floor: 0,
          position: 'center',
          adjacentRooms: []
        },
        materials: {},
        fixtures: [],
        lighting: {
          natural: roomWindows,
          artificial: 0
        },
        accessibility: {
          hasDirectExternalAccess: roomDoors > 0,
          doorWidth: 36,
          clearanceSpace: 0
        }
      });
    }

    console.log(`✅ Created ${matchedRooms.length} merged rooms`);
    return matchedRooms;
  }

  /**
   * Match GPT Vision detected room with rasterscan polygon
   */
  private matchGPTVisionRoom(
    gptRooms: Array<{ id: string; name: string; type: string; position: { x: number; y: number }; confidence: number }>,
    centroid: { x: number; y: number },
    boundingBox: { minX: number; maxX: number; minY: number; maxY: number }
  ): { name: string; type: string } | null {
    if (gptRooms.length === 0) return null;

    // Find GPT Vision room closest to this polygon's centroid
    let closestRoom = null;
    let minDistance = Infinity;

    for (const room of gptRooms) {
      // Check if GPT room position is within this polygon's bounding box
      const inBounds =
        room.position.x >= boundingBox.minX &&
        room.position.x <= boundingBox.maxX &&
        room.position.y >= boundingBox.minY &&
        room.position.y <= boundingBox.maxY;

      if (inBounds) {
        const distance = Math.sqrt(
          Math.pow(room.position.x - centroid.x, 2) +
          Math.pow(room.position.y - centroid.y, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestRoom = room;
        }
      }
    }

    return closestRoom ? { name: closestRoom.name, type: closestRoom.type } : null;
  }

  /**
   * Calculate centroid from vertices
   */
  private calculateCentroidFromVertices(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
    if (vertices.length === 0) return { x: 0, y: 0 };

    const sum = vertices.reduce(
      (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / vertices.length,
      y: sum.y / vertices.length
    };
  }

  /**
   * Extract text labels from floor plan image using OCR (DEPRECATED - Use GPT Vision instead)
   */
  private async extractTextLabels(imagePath?: string): Promise<Array<{ text: string; x: number; y: number; confidence: number }>> {
    if (!imagePath) return [];

    try {
      const Tesseract = require('tesseract.js');

      console.log('📖 Running OCR on floor plan image...');
      const { data } = await Tesseract.recognize(imagePath, 'eng', {
        logger: () => {} // Suppress progress logs
      });

      // Extract text with positions
      const labels = data.words
        .filter((word: any) => word.confidence > 60) // Filter low confidence
        .map((word: any) => ({
          text: word.text.trim(),
          x: word.bbox.x0 + (word.bbox.x1 - word.bbox.x0) / 2,
          y: word.bbox.y0 + (word.bbox.y1 - word.bbox.y0) / 2,
          confidence: word.confidence
        }))
        .filter((label: any) => label.text.length > 2); // Filter single letters

      console.log(`✅ OCR found ${labels.length} text labels`);
      return labels;
    } catch (error) {
      console.warn('⚠️ OCR failed, falling back to inference:', error);
      return [];
    }
  }

  /**
   * Find text label inside a room polygon
   */
  private findLabelInRoom(
    labels: Array<{ text: string; x: number; y: number; confidence: number }>,
    polygon: Array<{ x: number; y: number }>,
    centroid: { x: number; y: number }
  ): { text: string; confidence: number } | null {
    // Find labels inside this room
    const labelsInRoom = labels.filter(label =>
      this.isPointInPolygon({ x: label.x, y: label.y }, polygon)
    );

    if (labelsInRoom.length === 0) return null;

    // If multiple labels, pick the one closest to centroid
    labelsInRoom.sort((a, b) => {
      const distA = Math.sqrt(Math.pow(a.x - centroid.x, 2) + Math.pow(a.y - centroid.y, 2));
      const distB = Math.sqrt(Math.pow(b.x - centroid.x, 2) + Math.pow(b.y - centroid.y, 2));
      return distA - distB;
    });

    // Combine multiple words if they're part of same label
    if (labelsInRoom.length > 1) {
      const combinedText = labelsInRoom
        .slice(0, 3) // Max 3 words
        .map(l => l.text)
        .join(' ');

      return {
        text: combinedText,
        confidence: labelsInRoom[0].confidence
      };
    }

    return {
      text: labelsInRoom[0].text,
      confidence: labelsInRoom[0].confidence
    };
  }

  /**
   * Parse room type from OCR text label
   */
  private parseRoomType(text: string): string {
    if (!text) return 'unknown';

    const normalized = text.toLowerCase().trim();

    // Common room name patterns
    if (normalized.includes('bedroom') || normalized.includes('bed')) return 'bedroom';
    if (normalized.includes('master') || normalized.includes('mstr')) return 'bedroom';
    if (normalized.includes('bath') || normalized.includes('wc')) return 'bathroom';
    if (normalized.includes('kitchen') || normalized.includes('kit')) return 'kitchen';
    if (normalized.includes('living') || normalized.includes('family')) return 'living';
    if (normalized.includes('dining') || normalized.includes('din')) return 'dining';
    if (normalized.includes('office') || normalized.includes('study')) return 'office';
    if (normalized.includes('closet') || normalized.includes('clst')) return 'closet';
    if (normalized.includes('hallway') || normalized.includes('hall') || normalized.includes('corridor')) return 'hallway';
    if (normalized.includes('garage') || normalized.includes('gar')) return 'garage';
    if (normalized.includes('laundry') || normalized.includes('utility')) return 'laundry';
    if (normalized.includes('pantry')) return 'pantry';
    if (normalized.includes('storage') || normalized.includes('stor')) return 'storage';
    if (normalized.includes('den')) return 'den';
    if (normalized.includes('foyer') || normalized.includes('entry')) return 'hallway';

    // If no match, return the text as-is (custom room name)
    return 'unknown';
  }

  /**
   * Infer room type based on size, shape, and features
   */
  private inferRoomType(
    area: number,
    dimensions: { width: number; length: number; perimeter: number },
    doors: number,
    windows: number
  ): string {
    const aspectRatio = Math.max(dimensions.width, dimensions.length) / Math.min(dimensions.width, dimensions.length);

    // Very small rooms
    if (area < 2000) {
      if (windows === 0) return 'closet';
      return 'bathroom';
    }

    // Long narrow spaces (hallways)
    if (aspectRatio > 3 && area < 5000) {
      return 'hallway';
    }

    // Medium rooms
    if (area < 8000) {
      if (windows === 0) return 'storage';
      if (doors >= 2) return 'hallway';
      return 'bathroom';
    }

    // Large rooms
    if (area < 15000) {
      if (windows >= 2) return 'bedroom';
      if (windows === 1) return 'office';
      return 'bedroom';
    }

    // Very large rooms
    if (area < 25000) {
      if (windows >= 3) return 'living';
      if (windows >= 2) return 'bedroom'; // Master bedroom
      return 'family';
    }

    // Extra large rooms
    if (windows >= 3) return 'living';
    return 'family';
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
   * Handles multiple formats:
   * - RapidAPI: { "position": [[x1,y1], [x2,y2]] }
   * - Docker/Direct: { start: {x, y}, end: {x, y} }
   */
  private extractWalls(data: any): RasterScanWall[] {
    if (!data.walls) return [];

    return data.walls.map((wall: any, index: number) => {
      let start: { x: number; y: number };
      let end: { x: number; y: number };

      // Handle RapidAPI position array format: [[x1,y1], [x2,y2]]
      if (wall.position && Array.isArray(wall.position) && wall.position.length === 2) {
        const [pt1, pt2] = wall.position;
        start = { x: pt1[0], y: pt1[1] };
        end = { x: pt2[0], y: pt2[1] };
      } else {
        // Handle Docker/Direct format: { start: {x, y}, end: {x, y} }
        start = wall.start || wall.p1 || { x: 0, y: 0 };
        end = wall.end || wall.p2 || { x: 0, y: 0 };
      }

      // Calculate length if not provided
      const length = wall.length || Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      );

      return {
        id: wall.id || `wall-${index}`,
        start,
        end,
        length,
        thickness: wall.thickness || 6, // inches
        type: wall.type || 'interior',
        connectedRooms: wall.connected_rooms || []
      };
    });
  }

  /**
   * Extract doors with detailed information
   * Handles multiple formats:
   * - Docker: { "box": [[x1,y1], [x2,y1], [x2,y2], [x1,y2]] }
   * - RapidAPI: { "bbox": [[x1,y1], [x2,y1], [x2,y2], [x1,y2]] }
   * - Direct: { x, y, width, height }
   */
  private extractDoors(data: any) {
    if (!data.doors) return [];

    const rawDoors = data.doors.map((door: any) => {
      // Handle Docker/RapidAPI box format (both use 4-point arrays)
      const boxData = door.box || door.bbox;
      if (boxData && Array.isArray(boxData) && boxData.length === 4) {
        const [pt1, , pt3] = boxData;
        const x1 = pt1[0], y1 = pt1[1];
        const x2 = pt3[0], y2 = pt3[1];

        return {
          x: x1,
          y: y1,
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          type: door.type || 'interior',
          swing: door.swing || 'right'
        };
      }

      // Fallback to direct format (x, y, width, height)
      return {
        x: door.x || door.position?.x || 0,
        y: door.y || door.position?.y || 0,
        width: door.width || 36,
        height: door.height || 80,
        type: door.type || 'interior',
        swing: door.swing || 'right'
      };
    });

    // Filter out invalid doors (false positives)
    return this.filterValidDoors(rawDoors);
  }

  /**
   * Filter out invalid door detections (false positives)
   * Removes doors that are:
   * - Too small (likely noise)
   * - Wrong aspect ratio (too thin/wide)
   * - Overlapping duplicates
   */
  private filterValidDoors(doors: any[]): any[] {
    const validDoors = doors.filter((door) => {
      const width = door.width;
      const height = door.height;
      const area = width * height;

      // Minimum size: doors should be at least 20x20 pixels
      if (width < 20 || height < 20) {
        console.log(`🚫 Filtered door (too small): ${width}x${height}`);
        return false;
      }

      // Maximum size: doors shouldn't be larger than 150 pixels in either dimension
      if (width > 150 || height > 150) {
        console.log(`🚫 Filtered door (too large): ${width}x${height}`);
        return false;
      }

      // Aspect ratio check: typical doors are between 1:1.5 and 1:3 (or rotated)
      const aspectRatio = Math.max(width, height) / Math.min(width, height);
      if (aspectRatio > 4) {
        console.log(`🚫 Filtered door (bad aspect ratio ${aspectRatio.toFixed(1)}): ${width}x${height}`);
        return false;
      }

      // Minimum area: at least 600 square pixels
      if (area < 600) {
        console.log(`🚫 Filtered door (area too small ${area}): ${width}x${height}`);
        return false;
      }

      return true;
    });

    // Remove overlapping duplicates
    const nonOverlapping = this.removeDuplicateDoors(validDoors);

    console.log(`🚪 Filtered doors: ${doors.length} → ${validDoors.length} → ${nonOverlapping.length} (after dedup)`);

    return nonOverlapping;
  }

  /**
   * Remove duplicate/overlapping doors
   */
  private removeDuplicateDoors(doors: any[]): any[] {
    const result: any[] = [];

    for (const door of doors) {
      // Check if this door overlaps significantly with any existing door
      const hasOverlap = result.some((existing) => {
        const overlapX = Math.max(0,
          Math.min(door.x + door.width, existing.x + existing.width) -
          Math.max(door.x, existing.x)
        );
        const overlapY = Math.max(0,
          Math.min(door.y + door.height, existing.y + existing.height) -
          Math.max(door.y, existing.y)
        );
        const overlapArea = overlapX * overlapY;
        const doorArea = door.width * door.height;

        // If more than 50% overlap, consider it a duplicate
        return (overlapArea / doorArea) > 0.5;
      });

      if (!hasOverlap) {
        result.push(door);
      } else {
        console.log(`🚫 Filtered duplicate door at (${door.x}, ${door.y})`);
      }
    }

    return result;
  }

  /**
   * Extract windows with detailed information
   * Handles multiple formats:
   * - Docker: { "box": [[x1,y1], [x2,y1], [x2,y2], [x1,y2]] }
   * - RapidAPI: { "bbox": [[x1,y1], [x2,y1], [x2,y2], [x1,y2]] }
   * - Direct: { x, y, width, height }
   */
  private extractWindows(data: any) {
    if (!data.windows) return [];

    const rawWindows = data.windows.map((window: any) => {
      // Handle Docker/RapidAPI box format (both use 4-point arrays)
      const boxData = window.box || window.bbox;
      if (boxData && Array.isArray(boxData) && boxData.length === 4) {
        const [pt1, , pt3] = boxData;
        const x1 = pt1[0], y1 = pt1[1];
        const x2 = pt3[0], y2 = pt3[1];

        return {
          x: x1,
          y: y1,
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          type: window.type || 'single',
          exposure: window.exposure || 'unknown'
        };
      }

      // Fallback to direct format (x, y, width, height)
      return {
        x: window.x || window.position?.x || 0,
        y: window.y || window.position?.y || 0,
        width: window.width || 36, // inches
        height: window.height || 48, // inches
        type: window.type || 'single',
        exposure: window.exposure || 'unknown'
      };
    });

    // Filter out invalid windows (false positives)
    return this.filterValidWindows(rawWindows);
  }

  /**
   * Filter out invalid window detections (false positives)
   * Similar to door filtering but with slightly different thresholds
   */
  private filterValidWindows(windows: any[]): any[] {
    const validWindows = windows.filter((window) => {
      const width = window.width;
      const height = window.height;
      const area = width * height;

      // Minimum size: windows should be at least 15x15 pixels
      if (width < 15 || height < 15) {
        console.log(`🚫 Filtered window (too small): ${width}x${height}`);
        return false;
      }

      // Maximum size: windows shouldn't be larger than 120 pixels in either dimension
      if (width > 120 || height > 120) {
        console.log(`🚫 Filtered window (too large): ${width}x${height}`);
        return false;
      }

      // Aspect ratio check: windows can be wider range than doors (1:1 to 1:4)
      const aspectRatio = Math.max(width, height) / Math.min(width, height);
      if (aspectRatio > 5) {
        console.log(`🚫 Filtered window (bad aspect ratio ${aspectRatio.toFixed(1)}): ${width}x${height}`);
        return false;
      }

      // Minimum area: at least 400 square pixels
      if (area < 400) {
        console.log(`🚫 Filtered window (area too small ${area}): ${width}x${height}`);
        return false;
      }

      return true;
    });

    console.log(`🪟 Filtered windows: ${windows.length} → ${validWindows.length}`);

    return validWindows;
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
