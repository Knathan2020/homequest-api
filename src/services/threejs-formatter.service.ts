/**
 * Three.js Formatter Service
 * Converts 2D blueprint data to Three.js 3D geometries
 */

import * as THREE from 'three';

export class ThreeJSFormatter {
  private readonly WALL_HEIGHT = 9; // Default 9 feet ceiling
  private readonly FLOOR_THICKNESS = 0.5; // 6 inches
  private readonly ROOF_HEIGHT = 4; // 4 feet for roof peak
  
  /**
   * Format blueprint data for Three.js
   */
  async format(measurements: any, rooms: any): Promise<any> {
    console.log('🎮 Formatting data for Three.js...');
    
    try {
      // Ensure measurements and rooms have required structure
      if (!measurements) {
        console.warn('No measurements provided to Three.js formatter');
        measurements = { exterior_dimensions: { walls: [] } };
      }
      if (!rooms) {
        console.warn('No rooms provided to Three.js formatter');
        rooms = { room_boundaries: [] };
      }
      
      console.log('Measurements structure:', {
        hasExteriorDimensions: !!measurements.exterior_dimensions,
        wallCount: measurements.exterior_dimensions?.walls?.length || 0,
        firstWall: measurements.exterior_dimensions?.walls?.[0]
      });
      
      const wallGeometries = this.createWallGeometries(measurements);
      const roomGeometries = this.createRoomGeometries(rooms);
      const buildingEnvelope = this.createBuildingEnvelope(measurements);
      const roofGeometry = this.createRoofGeometry(buildingEnvelope);
      
      return {
        coordinate_conversion: {
          coordinate_system: 'Y_up_real_world_feet',
          origin_point: [0, 0, 0],
          north_direction: [0, 0, 1],
          scale_factor: 1.0
        },
        wall_geometries: wallGeometries,
        room_geometries: roomGeometries,
        roof_geometry: roofGeometry,
        building_envelope: buildingEnvelope,
        materials: this.getDefaultMaterials(),
        lights: this.getDefaultLights(),
        camera_settings: this.getCameraSettings(buildingEnvelope)
      };
    } catch (error) {
      console.error('Error in Three.js format method:', error);
      console.error('Stack:', (error as Error).stack);
      
      // Return minimal valid structure on error
      return {
        coordinate_conversion: {
          coordinate_system: 'Y_up_real_world_feet',
          origin_point: [0, 0, 0],
          north_direction: [0, 0, 1],
          scale_factor: 1.0
        },
        wall_geometries: [],
        room_geometries: [],
        roof_geometry: {},
        building_envelope: {
          footprint: [],
          overall_dimensions: { length: 30, width: 20, height: 9, roof_height: 13 },
          building_center: [15, 4.5, 10],
          orientation: 0,
          footprint_sqft: 600,
          perimeter_feet: 100
        },
        materials: this.getDefaultMaterials(),
        lights: this.getDefaultLights(),
        camera_settings: {
          type: 'PerspectiveCamera',
          fov: 50,
          aspect: 16 / 9,
          near: 0.1,
          far: 1000,
          position: [60, 45, 60],
          target: [15, 4.5, 10]
        }
      };
    }
  }
  
  /**
   * Create wall geometries
   */
  private createWallGeometries(measurements: any): any[] {
    const geometries: any[] = [];
    
    // Exterior walls
    if (measurements.exterior_dimensions?.walls) {
      for (const wall of measurements.exterior_dimensions.walls) {
        geometries.push({
          id: wall.id,
          geometry_type: 'BoxGeometry',
          position: this.calculateWallPosition(wall),
          dimensions: [
            wall.length_feet,
            this.WALL_HEIGHT,
            (wall.thickness_inches || 6) / 12
          ],
          rotation: this.calculateWallRotation(wall),
          material_type: 'exterior_wall',
          material_index: 0
        });
      }
    }
    
    // Interior walls (if available)
    if (measurements.interior_walls) {
      for (const wall of measurements.interior_walls) {
        geometries.push({
          id: wall.id,
          geometry_type: 'BoxGeometry',
          position: this.calculateWallPosition(wall),
          dimensions: [
            wall.length_feet,
            this.WALL_HEIGHT,
            (wall.thickness_inches || 4) / 12
          ],
          rotation: this.calculateWallRotation(wall),
          material_type: 'interior_wall',
          material_index: 1
        });
      }
    }
    
    return geometries;
  }
  
  /**
   * Create room floor geometries
   */
  private createRoomGeometries(rooms: any): any[] {
    const geometries: any[] = [];
    
    if (rooms.room_boundaries) {
      for (const room of rooms.room_boundaries) {
        // Create floor
        geometries.push({
          id: `${room.room_id}_floor`,
          geometry_type: 'ShapeGeometry',
          vertices: room.vertices || room.boundary_feet,
          position: [0, 0, 0], // Floor level
          material_type: this.getFloorMaterial(room.room_name),
          material_index: this.getMaterialIndex(room.room_name),
          area_sqft: room.area_sqft
        });
        
        // Create ceiling
        geometries.push({
          id: `${room.room_id}_ceiling`,
          geometry_type: 'ShapeGeometry',
          vertices: room.vertices || room.boundary_feet,
          position: [0, this.WALL_HEIGHT, 0],
          material_type: 'ceiling',
          material_index: 5,
          area_sqft: room.area_sqft
        });
      }
    }
    
    return geometries;
  }
  
  /**
   * Create building envelope
   */
  private createBuildingEnvelope(measurements: any): any {
    const envelope = measurements.exterior_dimensions?.building_envelope || {};
    
    // Calculate footprint from walls if not available
    let footprint = [];
    if (measurements.exterior_dimensions?.walls) {
      footprint = this.calculateFootprintFromWalls(measurements.exterior_dimensions.walls);
    }
    
    return {
      footprint: footprint,
      overall_dimensions: {
        length: envelope.length_feet || 30,
        width: envelope.width_feet || 20,
        height: this.WALL_HEIGHT,
        roof_height: this.WALL_HEIGHT + this.ROOF_HEIGHT
      },
      building_center: [
        (envelope.length_feet || 30) / 2,
        this.WALL_HEIGHT / 2,
        (envelope.width_feet || 20) / 2
      ],
      orientation: 0,
      footprint_sqft: envelope.footprint_sqft || 600,
      perimeter_feet: envelope.perimeter_feet || 100
    };
  }
  
  /**
   * Create roof geometry
   */
  private createRoofGeometry(envelope: any): any {
    const { length, width } = envelope.overall_dimensions;
    
    return {
      type: 'gable', // Default to gable roof
      geometry_type: 'ExtrudeGeometry',
      ridge_line: [
        [0, this.WALL_HEIGHT + this.ROOF_HEIGHT, width / 2],
        [length, this.WALL_HEIGHT + this.ROOF_HEIGHT, width / 2]
      ],
      eave_height: this.WALL_HEIGHT,
      ridge_height: this.WALL_HEIGHT + this.ROOF_HEIGHT,
      overhang: 1.5, // 1.5 feet overhang
      material_type: 'roof_shingles',
      material_index: 6
    };
  }
  
  /**
   * Calculate wall position (center point)
   */
  private calculateWallPosition(wall: any): number[] {
    // Check if wall has proper coordinates
    if (!wall.start_feet || !wall.end_feet) {
      console.warn('Wall missing coordinate data:', wall);
      // Return default position if coordinates are missing
      return [0, this.WALL_HEIGHT / 2, 0];
    }
    
    const centerX = (wall.start_feet[0] + wall.end_feet[0]) / 2;
    const centerY = this.WALL_HEIGHT / 2;
    const centerZ = (wall.start_feet[1] + wall.end_feet[1]) / 2;
    
    return [centerX, centerY, centerZ];
  }
  
  /**
   * Calculate wall rotation
   */
  private calculateWallRotation(wall: any): number[] {
    // Check if wall has proper coordinates
    if (!wall.start_feet || !wall.end_feet) {
      return [0, 0, 0]; // No rotation if coordinates are missing
    }
    
    const dx = wall.end_feet[0] - wall.start_feet[0];
    const dz = wall.end_feet[1] - wall.start_feet[1];
    const angle = Math.atan2(dz, dx);
    
    return [0, angle, 0]; // Rotate around Y axis
  }
  
  /**
   * Calculate footprint from walls
   */
  private calculateFootprintFromWalls(walls: any[]): number[][] {
    const points: number[][] = [];
    
    // Extract all wall endpoints with safety check
    for (const wall of walls) {
      if (wall.start_feet && wall.end_feet && 
          Array.isArray(wall.start_feet) && Array.isArray(wall.end_feet) &&
          wall.start_feet.length >= 2 && wall.end_feet.length >= 2) {
        points.push([wall.start_feet[0], 0, wall.start_feet[1]]);
        points.push([wall.end_feet[0], 0, wall.end_feet[1]]);
      } else {
        console.warn('Wall missing proper coordinate arrays:', wall);
      }
    }
    
    // Return empty array if no valid points found
    if (points.length === 0) {
      console.warn('No valid wall coordinates found for footprint calculation');
      return [];
    }
    
    // Find convex hull (simplified - just return unique points)
    const uniquePoints = this.getUniquePoints(points);
    
    // Sort points to form a polygon
    return this.sortPolygonPoints(uniquePoints);
  }
  
  /**
   * Get unique points
   */
  private getUniquePoints(points: number[][]): number[][] {
    const unique: number[][] = [];
    const seen = new Set<string>();
    
    for (const point of points) {
      const key = `${point[0]},${point[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(point);
      }
    }
    
    return unique;
  }
  
  /**
   * Sort points to form a polygon
   */
  private sortPolygonPoints(points: number[][]): number[][] {
    if (points.length < 3) return points;
    
    // Find center with safety check for z coordinate
    const center = points.reduce(
      (acc, p) => [acc[0] + p[0], acc[1] + (p[2] || 0)],
      [0, 0]
    ).map(v => v / points.length);
    
    // Sort by angle from center with safety check
    return points.sort((a, b) => {
      const angleA = Math.atan2((a[2] || 0) - center[1], a[0] - center[0]);
      const angleB = Math.atan2((b[2] || 0) - center[1], b[0] - center[0]);
      return angleA - angleB;
    });
  }
  
  /**
   * Get floor material based on room type
   */
  private getFloorMaterial(roomName: string): string {
    const name = roomName.toLowerCase();
    
    if (name.includes('bathroom')) return 'tile_floor';
    if (name.includes('kitchen')) return 'tile_floor';
    if (name.includes('garage')) return 'concrete_floor';
    if (name.includes('bedroom')) return 'carpet_floor';
    
    return 'hardwood_floor';
  }
  
  /**
   * Get material index
   */
  private getMaterialIndex(roomName: string): number {
    const material = this.getFloorMaterial(roomName);
    
    const indices: { [key: string]: number } = {
      'hardwood_floor': 2,
      'tile_floor': 3,
      'carpet_floor': 4,
      'concrete_floor': 7
    };
    
    return indices[material] || 2;
  }
  
  /**
   * Get default materials
   */
  private getDefaultMaterials(): any[] {
    return [
      {
        name: 'exterior_wall',
        type: 'MeshStandardMaterial',
        color: 0x8B7355,
        roughness: 0.8,
        metalness: 0.1
      },
      {
        name: 'interior_wall',
        type: 'MeshStandardMaterial',
        color: 0xF5F5DC,
        roughness: 0.6,
        metalness: 0
      },
      {
        name: 'hardwood_floor',
        type: 'MeshStandardMaterial',
        color: 0x8B4513,
        roughness: 0.5,
        metalness: 0.1
      },
      {
        name: 'tile_floor',
        type: 'MeshStandardMaterial',
        color: 0xE8E8E8,
        roughness: 0.3,
        metalness: 0.2
      },
      {
        name: 'carpet_floor',
        type: 'MeshStandardMaterial',
        color: 0x708090,
        roughness: 0.9,
        metalness: 0
      },
      {
        name: 'ceiling',
        type: 'MeshStandardMaterial',
        color: 0xFFFFFF,
        roughness: 0.8,
        metalness: 0
      },
      {
        name: 'roof_shingles',
        type: 'MeshStandardMaterial',
        color: 0x4A4A4A,
        roughness: 0.9,
        metalness: 0.1
      },
      {
        name: 'concrete_floor',
        type: 'MeshStandardMaterial',
        color: 0x808080,
        roughness: 0.8,
        metalness: 0
      }
    ];
  }
  
  /**
   * Get default lights
   */
  private getDefaultLights(): any[] {
    return [
      {
        type: 'AmbientLight',
        color: 0xffffff,
        intensity: 0.5
      },
      {
        type: 'DirectionalLight',
        color: 0xffffff,
        intensity: 0.8,
        position: [50, 100, 50],
        castShadow: true,
        shadow: {
          camera: {
            left: -50,
            right: 50,
            top: 50,
            bottom: -50,
            near: 0.1,
            far: 200
          }
        }
      },
      {
        type: 'HemisphereLight',
        skyColor: 0x87CEEB,
        groundColor: 0x8B7355,
        intensity: 0.3
      }
    ];
  }
  
  /**
   * Get camera settings based on building size
   */
  private getCameraSettings(envelope: any): any {
    const { length, width } = envelope.overall_dimensions;
    const maxDimension = Math.max(length, width);
    
    // Calculate camera distance for good view
    const distance = maxDimension * 2;
    const height = maxDimension * 1.5;
    
    return {
      type: 'PerspectiveCamera',
      fov: 50,
      aspect: 16 / 9,
      near: 0.1,
      far: 1000,
      position: [distance, height, distance],
      target: envelope.building_center,
      controls: {
        type: 'OrbitControls',
        enableDamping: true,
        dampingFactor: 0.05,
        minDistance: maxDimension * 0.5,
        maxDistance: maxDimension * 5,
        maxPolarAngle: Math.PI / 2.2
      }
    };
  }
}

// Export singleton
export const threeJSFormatter = new ThreeJSFormatter();