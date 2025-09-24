// ========================================
// ROOM MAPPER - room-mapper.ts
// Map 2D rooms to 3D space with height estimation
// ========================================

import * as THREE from 'three';
import { Wall } from '../../types/floor-plan.types';
import { Room, RoomType } from '../../types/room.types';

// Define missing Point2D interface
interface Point2D {
  x: number;
  y: number;
}
import { LengthUnit } from '../geometry/dimension-calculator';

interface RoomMapping3D {
  roomId: string;
  roomType: RoomType;
  floor: number;
  bounds2D: {
    min: Point2D;
    max: Point2D;
    center: Point2D;
  };
  bounds3D: THREE.Box3;
  height: number;
  ceilingHeight: number;
  floorLevel: number;
  volume: number;
  adjacentRooms: string[];
  connections: RoomConnection[];
  features: RoomFeature3D[];
  lighting: LightingConfig;
}

interface RoomConnection {
  fromRoom: string;
  toRoom: string;
  type: 'door' | 'opening' | 'stairs' | 'hallway';
  position: THREE.Vector3;
  width: number;
  height: number;
  bidirectional: boolean;
}

interface RoomFeature3D {
  type: string;
  position: THREE.Vector3;
  dimensions: THREE.Vector3;
  rotation: THREE.Euler;
  metadata?: any;
}

interface LightingConfig {
  natural: NaturalLight[];
  artificial: ArtificialLight[];
  ambientLevel: number;
}

interface NaturalLight {
  type: 'window' | 'skylight' | 'door';
  position: THREE.Vector3;
  direction: THREE.Vector3;
  intensity: number;
  area: number;
}

interface ArtificialLight {
  type: 'ceiling' | 'wall' | 'floor' | 'accent';
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  range?: number;
}

interface FloorPlan3D {
  floors: Map<number, Floor3D>;
  rooms: Map<string, RoomMapping3D>;
  connections: RoomConnection[];
  bounds: THREE.Box3;
  totalVolume: number;
  totalArea: number;
}

interface Floor3D {
  level: number;
  elevation: number;
  rooms: string[];
  height: number;
  area: number;
}

interface HeightEstimationParams {
  defaultHeight?: number;
  basementHeight?: number;
  firstFloorHeight?: number;
  upperFloorHeight?: number;
  atticHeight?: number;
  minimumHeight?: number;
  maximumHeight?: number;
  unit?: LengthUnit;
}

export class RoomMapper {
  private defaultHeights: Map<RoomType, number>;
  // private standardCeilingHeights: Map<string, number>; // Removed as unused
  private roomConnectivity: Map<string, Set<string>>;

  constructor() {
    this.defaultHeights = this.initializeDefaultHeights();
    // this.standardCeilingHeights = this.initializeStandardHeights(); // Removed as unused
    this.roomConnectivity = new Map();
  }

  /**
   * Initialize default room heights by type
   */
  private initializeDefaultHeights(): Map<RoomType, number> {
    const heights = new Map<RoomType, number>();
    
    // Standard residential heights in meters
    heights.set(RoomType.LIVING_ROOM, 2.7);
    heights.set(RoomType.GREAT_ROOM, 3.6);
    heights.set(RoomType.FAMILY_ROOM, 2.7);
    heights.set(RoomType.DINING_ROOM, 2.7);
    heights.set(RoomType.KITCHEN, 2.7);
    heights.set(RoomType.BEDROOM, 2.4);
    heights.set(RoomType.MASTER_BEDROOM, 2.7);
    heights.set(RoomType.BATHROOM, 2.4);
    heights.set(RoomType.MASTER_BATHROOM, 2.4);
    heights.set(RoomType.POWDER_ROOM, 2.4);
    heights.set(RoomType.OFFICE, 2.4);
    heights.set(RoomType.STUDY, 2.4);
    heights.set(RoomType.LIBRARY, 3.0);
    heights.set(RoomType.DEN, 2.4);
    heights.set(RoomType.GARAGE, 2.4);
    heights.set(RoomType.BASEMENT, 2.1);
    heights.set(RoomType.ATTIC, 2.1);
    heights.set(RoomType.UTILITY_ROOM, 2.1);
    heights.set(RoomType.LAUNDRY_ROOM, 2.4);
    heights.set(RoomType.CLOSET, 2.1);
    heights.set(RoomType.PANTRY, 2.4);
    heights.set(RoomType.FOYER, 3.0);
    heights.set(RoomType.HALLWAY, 2.4);
    heights.set(RoomType.STAIRWAY, 2.7);
    heights.set(RoomType.BALCONY, 2.4);
    heights.set(RoomType.DECK, 2.4);
    heights.set(RoomType.PATIO, 2.4);
    heights.set(RoomType.PORCH, 2.4);
    heights.set(RoomType.SUNROOM, 2.7);
    heights.set(RoomType.UTILITY_ROOM, 3.0); // Using UTILITY_ROOM as fallback for CONSERVATORY
    heights.set(RoomType.GYM, 2.7);
    heights.set(RoomType.HOME_THEATER, 2.7);
    heights.set(RoomType.GAME_ROOM, 2.7);
    heights.set(RoomType.BAR, 2.4);
    heights.set(RoomType.WINE_CELLAR, 2.1);
    heights.set(RoomType.WORKSHOP, 2.4);
    heights.set(RoomType.STORAGE, 2.1);
    heights.set(RoomType.STORAGE, 2.4); // Using STORAGE as fallback for OTHER

    return heights;
  }

  /**
   * Initialize standard ceiling heights by building type
   */
  // initializeStandardHeights method removed as unused

  /**
   * Map 2D floor plan to 3D space
   */
  async mapTo3D(
    rooms: Room[],
    walls: Wall[],
    params: HeightEstimationParams = {}
  ): Promise<FloorPlan3D> {
    console.log('🗺️ Mapping 2D floor plan to 3D space...');

    // Set default parameters
    const defaultParams: HeightEstimationParams = {
      defaultHeight: 2.4,
      basementHeight: 2.1,
      firstFloorHeight: 2.7,
      upperFloorHeight: 2.4,
      atticHeight: 2.1,
      minimumHeight: 2.0,
      maximumHeight: 5.0,
      unit: LengthUnit.METERS
    };

    const finalParams = { ...defaultParams, ...params };

    // Step 1: Detect floors/levels
    const floors = this.detectFloors(rooms);

    // Step 2: Build room connectivity graph
    this.buildConnectivityGraph(rooms, walls);

    // Step 3: Map each room to 3D
    const roomMappings = new Map<string, RoomMapping3D>();
    const allConnections: RoomConnection[] = [];

    for (const room of rooms) {
      const mapping = await this.mapRoomTo3D(room, floors, finalParams);
      roomMappings.set(room.id, mapping);

      // Find connections
      const connections = this.findRoomConnections(room, rooms, walls);
      allConnections.push(...connections);
      mapping.connections = connections.filter(c => c.fromRoom === room.id);
    }

    // Step 4: Create floor structure
    const floorMap = this.createFloorMap(roomMappings, floors);

    // Step 5: Calculate bounds and totals
    const bounds = this.calculateTotalBounds(roomMappings);
    const totalVolume = this.calculateTotalVolume(roomMappings);
    const totalArea = this.calculateTotalArea(roomMappings);

    return {
      floors: floorMap,
      rooms: roomMappings,
      connections: allConnections,
      bounds,
      totalVolume,
      totalArea
    };
  }

  /**
   * Map individual room to 3D
   */
  private async mapRoomTo3D(
    room: Room,
    floors: Map<number, string[]>,
    params: HeightEstimationParams
  ): Promise<RoomMapping3D> {
    // Determine floor level
    const floorLevel = this.determineFloorLevel(room, floors);
    
    // Estimate ceiling height
    const ceilingHeight = this.estimateRoomHeight(room, floorLevel, params);
    
    // Calculate 2D bounds
    const bounds2D = this.calculate2DBounds((room.polygon as any) || []);
    
    // Create 3D bounds
    const floorElevation = this.calculateFloorElevation(floorLevel, params);
    const bounds3D = new THREE.Box3(
      new THREE.Vector3(bounds2D.min.x, floorElevation, bounds2D.min.y),
      new THREE.Vector3(bounds2D.max.x, floorElevation + ceilingHeight, bounds2D.max.y)
    );

    // Calculate volume
    const area = (room as any).area || this.calculatePolygonArea((room.polygon as any) || []);
    const volume = area * ceilingHeight;

    // Find adjacent rooms
    const adjacentRooms = this.findAdjacentRooms(room);

    // Generate room features
    const features = this.generateRoomFeatures(room, bounds3D);

    // Configure lighting
    const lighting = this.configureLighting(room, bounds3D);

    return {
      roomId: room.id,
      roomType: room.type,
      floor: floorLevel,
      bounds2D,
      bounds3D,
      height: ceilingHeight,
      ceilingHeight,
      floorLevel: floorElevation,
      volume,
      adjacentRooms,
      connections: [], // Will be filled later
      features,
      lighting
    };
  }

  /**
   * Detect floors/levels in the building
   */
  private detectFloors(rooms: Room[]): Map<number, string[]> {
    const floors = new Map<number, string[]>();
    
    // Simple heuristic: group rooms by type and connectivity
    const basementRooms = rooms.filter(r => 
      r.type === RoomType.BASEMENT || 
      (r as any).label?.toLowerCase().includes('basement')
    );
    
    const atticRooms = rooms.filter(r => 
      r.type === RoomType.ATTIC || 
      (r as any).label?.toLowerCase().includes('attic')
    );
    
    const garageRooms = rooms.filter(r => 
      r.type === RoomType.GARAGE
    );
    
    const mainFloorRooms = rooms.filter(r => 
      !basementRooms.includes(r) && 
      !atticRooms.includes(r) &&
      (r.type === RoomType.KITCHEN || 
       r.type === RoomType.LIVING_ROOM ||
       r.type === RoomType.DINING_ROOM ||
       garageRooms.includes(r))
    );
    
    const upperFloorRooms = rooms.filter(r => 
      !basementRooms.includes(r) && 
      !atticRooms.includes(r) &&
      !mainFloorRooms.includes(r) &&
      (r.type === RoomType.BEDROOM ||
       r.type === RoomType.MASTER_BEDROOM ||
       r.type === RoomType.BATHROOM)
    );

    // Assign floors
    if (basementRooms.length > 0) {
      floors.set(-1, basementRooms.map(r => r.id));
    }
    
    if (mainFloorRooms.length > 0) {
      floors.set(0, mainFloorRooms.map(r => r.id));
    }
    
    if (upperFloorRooms.length > 0) {
      floors.set(1, upperFloorRooms.map(r => r.id));
    }
    
    if (atticRooms.length > 0) {
      floors.set(2, atticRooms.map(r => r.id));
    }

    // Handle remaining rooms
    const assignedRooms = new Set([
      ...basementRooms,
      ...mainFloorRooms,
      ...upperFloorRooms,
      ...atticRooms
    ].map(r => r.id));

    const unassignedRooms = rooms.filter(r => !assignedRooms.has(r.id));
    
    // Assign unassigned rooms to ground floor by default
    if (unassignedRooms.length > 0) {
      const groundFloorRooms = floors.get(0) || [];
      floors.set(0, [...groundFloorRooms, ...unassignedRooms.map(r => r.id)]);
    }

    return floors;
  }

  /**
   * Build room connectivity graph
   */
  private buildConnectivityGraph(rooms: Room[], walls: Wall[]): void {
    this.roomConnectivity.clear();

    for (const room of rooms) {
      const connections = new Set<string>();
      
      // Find rooms that share walls
      for (const otherRoom of rooms) {
        if (room.id === otherRoom.id) continue;
        
        if (this.roomsShareWall(room, otherRoom, walls)) {
          connections.add(otherRoom.id);
        }
      }
      
      this.roomConnectivity.set(room.id, connections);
    }
  }

  /**
   * Check if two rooms share a wall
   */
  private roomsShareWall(room1: Room, room2: Room, _walls: Wall[]): boolean {
    if (!(room1 as any).walls || !(room2 as any).walls) return false;

    for (const wall1 of (room1 as any).walls) {
      for (const wall2 of (room2 as any).walls) {
        if (this.wallsOverlap(wall1, wall2)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if walls overlap
   */
  private wallsOverlap(wall1: Wall, wall2: Wall): boolean {
    const threshold = 0.5; // 50cm tolerance
    
    // Check if walls are collinear and overlapping
    const d1 = this.pointToLineDistance((wall1 as any).start || { x: 0, y: 0 }, (wall2 as any).start || { x: 0, y: 0 }, (wall2 as any).end || { x: 0, y: 0 });
    const d2 = this.pointToLineDistance((wall1 as any).end || { x: 0, y: 0 }, (wall2 as any).start || { x: 0, y: 0 }, (wall2 as any).end || { x: 0, y: 0 });
    
    if (d1 < threshold && d2 < threshold) {
      // Check for overlap
      return this.segmentsOverlap(wall1, wall2);
    }
    
    return false;
  }

  /**
   * Estimate room height based on type and floor
   */
  private estimateRoomHeight(
    room: Room,
    floorLevel: number,
    params: HeightEstimationParams
  ): number {
    // Check for explicit height in room data
    if ((room as any).height) {
      return Math.max(params.minimumHeight!, Math.min((room as any).height, params.maximumHeight!));
    }

    // Use floor-specific heights
    let height: number;
    
    if (floorLevel === -1) {
      height = params.basementHeight!;
    } else if (floorLevel === 0) {
      height = params.firstFloorHeight!;
    } else if (floorLevel === 2 && room.type === RoomType.ATTIC) {
      height = params.atticHeight!;
    } else {
      height = params.upperFloorHeight!;
    }

    // Adjust based on room type
    const typeHeight = this.defaultHeights.get(room.type);
    if (typeHeight) {
      // Average between floor height and type-specific height
      height = (height + typeHeight) / 2;
    }

    // Special cases
    if (room.type === RoomType.GREAT_ROOM || room.type === RoomType.FOYER) {
      // Double height spaces
      height *= 1.5;
    }

    return Math.max(params.minimumHeight!, Math.min(height, params.maximumHeight!));
  }

  /**
   * Find room connections (doors, openings)
   */
  private findRoomConnections(
    room: Room,
    allRooms: Room[],
    _walls: Wall[]
  ): RoomConnection[] {
    const connections: RoomConnection[] = [];

    if (!(room as any).doors) return connections;

    for (const door of (room as any).doors) {
      // Find connected room
      const connectedRoom = this.findRoomAtPoint(door.position, allRooms, room.id);
      
      if (connectedRoom) {
        connections.push({
          fromRoom: room.id,
          toRoom: connectedRoom.id,
          type: 'door',
          position: new THREE.Vector3(door.position.x, 0, door.position.y),
          width: door.width,
          height: door.height || 2.1,
          bidirectional: true
        });
      }
    }

    // Check for stairways
    if (room.type === RoomType.STAIRWAY) {
      // Connect to rooms on different floors
      const adjacentRooms = this.roomConnectivity.get(room.id);
      if (adjacentRooms) {
        for (const adjacentId of adjacentRooms) {
          const adjacent = allRooms.find(r => r.id === adjacentId);
          if (adjacent) {
            connections.push({
              fromRoom: room.id,
              toRoom: adjacentId,
              type: 'stairs',
              position: new THREE.Vector3(0, 0, 0), // Will be calculated
              width: 1.0,
              height: 2.4,
              bidirectional: true
            });
          }
        }
      }
    }

    return connections;
  }

  /**
   * Generate 3D features for room
   */
  private generateRoomFeatures(room: Room, bounds: THREE.Box3): RoomFeature3D[] {
    const features: RoomFeature3D[] = [];

    // Add fixtures
    if ((room as any).fixtures) {
      for (const fixture of (room as any).fixtures) {
        const position = new THREE.Vector3(
          fixture.position.x,
          bounds.min.y,
          fixture.position.y
        );

        features.push({
          type: fixture.type,
          position,
          dimensions: new THREE.Vector3(0.5, 0.5, 0.5), // Default size
          rotation: new THREE.Euler(0, 0, 0),
          metadata: fixture
        });
      }
    }

    // Add room-specific features based on type
    switch (room.type) {
      case RoomType.KITCHEN:
        features.push(...this.generateKitchenFeatures(bounds));
        break;
      
      case RoomType.BATHROOM:
      case RoomType.MASTER_BATHROOM:
        features.push(...this.generateBathroomFeatures(bounds));
        break;
      
      case RoomType.BEDROOM:
      case RoomType.MASTER_BEDROOM:
        features.push(...this.generateBedroomFeatures(bounds));
        break;
    }

    return features;
  }

  /**
   * Generate kitchen features
   */
  private generateKitchenFeatures(bounds: THREE.Box3): RoomFeature3D[] {
    const features: RoomFeature3D[] = [];
    const center = bounds.getCenter(new THREE.Vector3());

    // Add kitchen island
    features.push({
      type: 'kitchen_island',
      position: center,
      dimensions: new THREE.Vector3(2, 0.9, 1),
      rotation: new THREE.Euler(0, 0, 0)
    });

    // Add countertops along walls
    features.push({
      type: 'countertop',
      position: new THREE.Vector3(bounds.min.x + 0.3, bounds.min.y + 0.9, center.z),
      dimensions: new THREE.Vector3(0.6, 0.05, 2),
      rotation: new THREE.Euler(0, 0, 0)
    });

    return features;
  }

  /**
   * Generate bathroom features
   */
  private generateBathroomFeatures(bounds: THREE.Box3): RoomFeature3D[] {
    const features: RoomFeature3D[] = [];

    // Add toilet
    features.push({
      type: 'toilet',
      position: new THREE.Vector3(bounds.min.x + 0.5, bounds.min.y, bounds.min.z + 0.5),
      dimensions: new THREE.Vector3(0.4, 0.4, 0.6),
      rotation: new THREE.Euler(0, 0, 0)
    });

    // Add sink
    features.push({
      type: 'sink',
      position: new THREE.Vector3(bounds.max.x - 0.5, bounds.min.y + 0.8, bounds.min.z + 0.5),
      dimensions: new THREE.Vector3(0.5, 0.1, 0.4),
      rotation: new THREE.Euler(0, Math.PI / 2, 0)
    });

    // Add bathtub if room is large enough
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x > 2 && size.z > 2) {
      features.push({
        type: 'bathtub',
        position: new THREE.Vector3(bounds.max.x - 0.8, bounds.min.y, bounds.max.z - 1),
        dimensions: new THREE.Vector3(0.7, 0.5, 1.5),
        rotation: new THREE.Euler(0, 0, 0)
      });
    }

    return features;
  }

  /**
   * Generate bedroom features
   */
  private generateBedroomFeatures(bounds: THREE.Box3): RoomFeature3D[] {
    const features: RoomFeature3D[] = [];
    const center = bounds.getCenter(new THREE.Vector3());

    // Add bed
    features.push({
      type: 'bed',
      position: new THREE.Vector3(center.x, bounds.min.y + 0.3, center.z),
      dimensions: new THREE.Vector3(1.5, 0.6, 2),
      rotation: new THREE.Euler(0, 0, 0)
    });

    // Add nightstands
    features.push({
      type: 'nightstand',
      position: new THREE.Vector3(center.x - 1, bounds.min.y, center.z),
      dimensions: new THREE.Vector3(0.4, 0.5, 0.4),
      rotation: new THREE.Euler(0, 0, 0)
    });

    features.push({
      type: 'nightstand',
      position: new THREE.Vector3(center.x + 1, bounds.min.y, center.z),
      dimensions: new THREE.Vector3(0.4, 0.5, 0.4),
      rotation: new THREE.Euler(0, 0, 0)
    });

    return features;
  }

  /**
   * Configure room lighting
   */
  private configureLighting(room: Room, bounds: THREE.Box3): LightingConfig {
    const natural: NaturalLight[] = [];
    const artificial: ArtificialLight[] = [];
    
    // Add natural light from windows
    if ((room as any).windows) {
      for (const window of (room as any).windows) {
        natural.push({
          type: 'window',
          position: new THREE.Vector3(window.position.x, bounds.min.y + 1.5, window.position.y),
          direction: new THREE.Vector3(1, -0.5, 0).normalize(), // Assuming east-facing
          intensity: 0.8,
          area: window.width * window.height
        });
      }
    }

    // Add artificial lighting based on room type
    const center = bounds.getCenter(new THREE.Vector3());
    const ceilingY = bounds.max.y - 0.1;

    switch (room.type) {
      case RoomType.KITCHEN:
        // Bright task lighting
        artificial.push({
          type: 'ceiling',
          position: new THREE.Vector3(center.x, ceilingY, center.z),
          color: new THREE.Color(0xffffff),
          intensity: 1.0,
          range: 5
        });
        
        // Under-cabinet lighting
        artificial.push({
          type: 'accent',
          position: new THREE.Vector3(bounds.min.x + 0.3, bounds.min.y + 1.5, center.z),
          color: new THREE.Color(0xffffcc),
          intensity: 0.5,
          range: 2
        });
        break;

      case RoomType.BEDROOM:
      case RoomType.MASTER_BEDROOM:
        // Warm ambient lighting
        artificial.push({
          type: 'ceiling',
          position: new THREE.Vector3(center.x, ceilingY, center.z),
          color: new THREE.Color(0xffeecc),
          intensity: 0.7,
          range: 4
        });
        
        // Bedside lamps
        artificial.push({
          type: 'accent',
          position: new THREE.Vector3(center.x - 1, bounds.min.y + 0.5, center.z),
          color: new THREE.Color(0xffddaa),
          intensity: 0.3,
          range: 1.5
        });
        break;

      case RoomType.BATHROOM:
        // Bright vanity lighting
        artificial.push({
          type: 'wall',
          position: new THREE.Vector3(bounds.max.x - 0.1, bounds.min.y + 2, bounds.min.z + 0.5),
          color: new THREE.Color(0xffffff),
          intensity: 0.8,
          range: 2
        });
        break;

      default:
        // Standard ceiling light
        artificial.push({
          type: 'ceiling',
          position: new THREE.Vector3(center.x, ceilingY, center.z),
          color: new THREE.Color(0xffffff),
          intensity: 0.8,
          range: 4
        });
    }

    // Calculate ambient level based on natural and artificial lights
    const ambientLevel = Math.min(1, natural.length * 0.2 + artificial.length * 0.1);

    return {
      natural,
      artificial,
      ambientLevel
    };
  }

  /**
   * Helper methods
   */

  private calculate2DBounds(polygon: Point2D[]): {
    min: Point2D;
    max: Point2D;
    center: Point2D;
  } {
    if (polygon.length === 0) {
      return {
        min: { x: 0, y: 0 },
        max: { x: 0, y: 0 },
        center: { x: 0, y: 0 }
      };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    return {
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    };
  }

  private calculatePolygonArea(polygon: Point2D[]): number {
    if (polygon.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }

    return Math.abs(area / 2);
  }

  private determineFloorLevel(room: Room, floors: Map<number, string[]>): number {
    for (const [level, roomIds] of floors) {
      if (roomIds.includes(room.id)) {
        return level;
      }
    }
    return 0; // Default to ground floor
  }

  private calculateFloorElevation(level: number, params: HeightEstimationParams): number {
    let elevation = 0;
    
    if (level < 0) {
      // Basement
      elevation = level * (params.basementHeight || 2.1);
    } else if (level === 0) {
      // Ground floor
      elevation = 0;
    } else if (level === 1) {
      // Second floor
      elevation = params.firstFloorHeight || 2.7;
    } else {
      // Upper floors
      elevation = (params.firstFloorHeight || 2.7) + 
                 (level - 1) * (params.upperFloorHeight || 2.4);
    }
    
    return elevation;
  }

  private findAdjacentRooms(room: Room): string[] {
    return Array.from(this.roomConnectivity.get(room.id) || []);
  }

  private findRoomAtPoint(point: Point2D, rooms: Room[], excludeId?: string): Room | null {
    for (const room of rooms) {
      if (room.id === excludeId) continue;
      
      if (room.polygon && this.isPointInPolygon(point, room.polygon as any)) {
        return room;
      }
    }
    return null;
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

  private segmentsOverlap(wall1: Wall, wall2: Wall): boolean {
    // Project walls onto their common line and check for overlap
    const v1 = { x: ((wall1 as any).end?.x || 0) - ((wall1 as any).start?.x || 0), y: ((wall1 as any).end?.y || 0) - ((wall1 as any).start?.y || 0) };
    const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    v1.x /= len1;
    v1.y /= len1;

    // Project wall2 endpoints onto wall1
    const p1 = this.projectPointOntoLine((wall2 as any).start || { x: 0, y: 0 }, (wall1 as any).start || { x: 0, y: 0 }, v1);
    const p2 = this.projectPointOntoLine((wall2 as any).end || { x: 0, y: 0 }, (wall1 as any).start || { x: 0, y: 0 }, v1);

    // Check for overlap
    return (p1 >= 0 && p1 <= len1) || (p2 >= 0 && p2 <= len1) ||
           (p1 <= 0 && p2 >= len1);
  }

  private projectPointOntoLine(point: Point2D, lineStart: Point2D, direction: Point2D): number {
    const v = { x: point.x - lineStart.x, y: point.y - lineStart.y };
    return v.x * direction.x + v.y * direction.y;
  }

  private createFloorMap(
    roomMappings: Map<string, RoomMapping3D>,
    floors: Map<number, string[]>
  ): Map<number, Floor3D> {
    const floorMap = new Map<number, Floor3D>();

    for (const [level, roomIds] of floors) {
      let totalArea = 0;
      let maxHeight = 0;

      for (const roomId of roomIds) {
        const mapping = roomMappings.get(roomId);
        if (mapping) {
          totalArea += mapping.volume / mapping.ceilingHeight;
          maxHeight = Math.max(maxHeight, mapping.ceilingHeight);
        }
      }

      floorMap.set(level, {
        level,
        elevation: this.calculateFloorElevation(level, {}),
        rooms: roomIds,
        height: maxHeight,
        area: totalArea
      });
    }

    return floorMap;
  }

  private calculateTotalBounds(roomMappings: Map<string, RoomMapping3D>): THREE.Box3 {
    const bounds = new THREE.Box3();

    for (const mapping of roomMappings.values()) {
      bounds.union(mapping.bounds3D);
    }

    return bounds;
  }

  private calculateTotalVolume(roomMappings: Map<string, RoomMapping3D>): number {
    let total = 0;
    for (const mapping of roomMappings.values()) {
      total += mapping.volume;
    }
    return total;
  }

  private calculateTotalArea(roomMappings: Map<string, RoomMapping3D>): number {
    let total = 0;
    for (const mapping of roomMappings.values()) {
      total += mapping.volume / mapping.ceilingHeight;
    }
    return total;
  }

  /**
   * Optimize room connections for pathfinding
   */
  optimizeConnections(floorPlan3D: FloorPlan3D): RoomConnection[] {
    const optimized: RoomConnection[] = [];
    const processed = new Set<string>();

    for (const connection of floorPlan3D.connections) {
      const key = `${connection.fromRoom}-${connection.toRoom}`;
      const reverseKey = `${connection.toRoom}-${connection.fromRoom}`;

      if (!processed.has(key) && !processed.has(reverseKey)) {
        optimized.push(connection);
        processed.add(key);
        if (connection.bidirectional) {
          processed.add(reverseKey);
        }
      }
    }

    return optimized;
  }
}

// Export singleton instance
export const roomMapper = new RoomMapper();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { roomMapper } from './services/3d/room-mapper';

// Map 2D floor plan to 3D
const floorPlan3D = await roomMapper.mapTo3D(
  rooms,
  walls,
  {
    defaultHeight: 2.5,
    firstFloorHeight: 3.0,
    unit: LengthUnit.METERS
  }
);

// Access 3D room mappings
console.log(`Mapped ${floorPlan3D.rooms.size} rooms to 3D`);
console.log(`Total volume: ${floorPlan3D.totalVolume} m³`);
console.log(`Total area: ${floorPlan3D.totalArea} m²`);

// Get specific room mapping
const livingRoom3D = floorPlan3D.rooms.get('room_living');
if (livingRoom3D) {
  console.log(`Living room height: ${livingRoom3D.ceilingHeight}m`);
  console.log(`Living room volume: ${livingRoom3D.volume}m³`);
  console.log(`Floor level: ${livingRoom3D.floor}`);
  console.log(`Connected to: ${livingRoom3D.adjacentRooms.join(', ')}`);
}

// Access floor information
for (const [level, floor] of floorPlan3D.floors) {
  console.log(`Floor ${level}: ${floor.rooms.length} rooms, ${floor.area}m², height: ${floor.height}m`);
}

// Optimize connections for pathfinding
const optimizedConnections = roomMapper.optimizeConnections(floorPlan3D);
console.log(`Optimized connections: ${optimizedConnections.length}`);
*/