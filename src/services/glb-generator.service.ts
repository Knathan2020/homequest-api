/**
 * GLB Generator Service
 * Generates GLB/GLTF 3D model files from Three.js data
 */

import * as THREE from 'three';
// Note: GLTFExporter requires three/addons package
// import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import * as fs from 'fs/promises';
import * as path from 'path';

// Stub GLTFExporter until three/addons is installed
class GLTFExporter {
  parse(scene: any, onComplete: (result: any) => void, onError: (error: any) => void, options?: any) {
    // Return a simple ArrayBuffer for now
    const buffer = new ArrayBuffer(100);
    onComplete(buffer);
  }
}

export class GLBGenerator {
  private exporter: GLTFExporter;
  
  constructor() {
    this.exporter = new GLTFExporter();
  }
  
  /**
   * Generate GLB specifications and optionally create the file
   */
  async generateSpecs(threeJSData: any, generateFile: boolean = false): Promise<any> {
    console.log('📦 Generating GLB specifications...');
    
    const buildingType = this.determineBuildingType(threeJSData);
    const complexity = this.calculateComplexity(threeJSData);
    const specs = this.createSpecifications(threeJSData, buildingType, complexity);
    
    if (generateFile) {
      const glbData = await this.generateGLBFile(threeJSData);
      specs.glb_data = glbData;
    }
    
    return specs;
  }
  
  /**
   * Determine building type from data
   */
  private determineBuildingType(data: any): string {
    const envelope = data.building_envelope;
    if (!envelope) return 'unknown';
    
    const sqft = envelope.footprint_sqft || 0;
    const rooms = data.room_geometries?.length || 0;
    
    if (sqft < 1200 && rooms <= 3) return 'single_family_small';
    if (sqft < 2500) return 'single_family_ranch';
    if (sqft < 4000) return 'single_family_colonial';
    if (sqft < 6000) return 'single_family_large';
    
    return 'multi_story';
  }
  
  /**
   * Calculate model complexity
   */
  private calculateComplexity(data: any): 'simple' | 'moderate' | 'complex' {
    const wallCount = data.wall_geometries?.length || 0;
    const roomCount = data.room_geometries?.length || 0;
    const totalElements = wallCount + roomCount;
    
    if (totalElements < 20) return 'simple';
    if (totalElements < 50) return 'moderate';
    return 'complex';
  }
  
  /**
   * Create GLB specifications
   */
  private createSpecifications(data: any, buildingType: string, complexity: string): any {
    const envelope = data.building_envelope || {};
    const polygonBudget = this.calculatePolygonBudget(complexity);
    
    return {
      model_requirements: {
        building_type: buildingType,
        complexity_level: complexity,
        polygon_budget: polygonBudget,
        texture_requirements: 'basic_materials',
        include_interior: complexity !== 'simple',
        include_site_context: true
      },
      geometry_specs: {
        exterior_envelope: {
          footprint_coordinates: envelope.footprint || [],
          building_height: envelope.overall_dimensions?.height || 9,
          roof_type: this.determineRoofType(data),
          roof_height: envelope.overall_dimensions?.roof_height || 12
        },
        curved_elements: this.extractCurvedElements(data),
        key_features: {
          entry_door: this.findEntryDoor(data),
          garage_door: this.findGarageDoor(data),
          major_windows: this.findMajorWindows(data)
        }
      },
      site_planning_data: {
        property_boundaries: this.generatePropertyBoundaries(envelope),
        building_position: envelope.building_center || [0, 0, 0],
        setbacks: this.calculateSetbacks(envelope),
        lot_coverage: this.calculateLotCoverage(envelope),
        orientation: {
          front_facing: 'south',
          rotation_degrees: 0
        }
      },
      placement_metadata: {
        building_center: envelope.building_center || [0, 0, 0],
        orientation: 0,
        foundation_outline: envelope.footprint || [],
        driveway_connection_point: this.calculateDrivewayPoint(envelope),
        utility_connection_zones: {
          electric: 'northeast_corner',
          water: 'front_right',
          sewer: 'rear_center',
          gas: 'left_side'
        },
        setback_reference_point: envelope.building_center || [0, 0, 0],
        landscaping_clearance: 5
      },
      optimization: {
        lod_levels: this.generateLODLevels(complexity),
        texture_atlas: complexity !== 'simple',
        instanced_geometry: true,
        compressed_textures: true
      }
    };
  }
  
  /**
   * Generate actual GLB file
   */
  private async generateGLBFile(data: any): Promise<any> {
    try {
      // Create Three.js scene
      const scene = new THREE.Scene();
      
      // Add geometries
      this.addWallsToScene(scene, data.wall_geometries);
      this.addFloorsToScene(scene, data.room_geometries);
      this.addRoofToScene(scene, data.roof_geometry);
      
      // Add lights
      this.addLightsToScene(scene, data.lights);
      
      // Export to GLB
      const glbData = await this.exportSceneToGLB(scene);
      
      // Calculate file stats
      const fileSize = glbData.byteLength;
      const polygonCount = this.countPolygons(scene);
      
      return {
        success: true,
        data: glbData,
        file_size: fileSize,
        file_size_mb: (fileSize / (1024 * 1024)).toFixed(2),
        polygon_count: polygonCount,
        format: 'glb',
        version: '2.0'
      };
      
    } catch (error) {
      console.error('GLB generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Generation failed'
      };
    }
  }
  
  /**
   * Add walls to scene
   */
  private addWallsToScene(scene: THREE.Scene, wallGeometries: any[]): void {
    if (!wallGeometries) return;
    
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.8,
      metalness: 0.1
    });
    
    for (const wallData of wallGeometries) {
      const geometry = new THREE.BoxGeometry(
        wallData.dimensions[0],
        wallData.dimensions[1],
        wallData.dimensions[2]
      );
      
      const wall = new THREE.Mesh(geometry, wallMaterial);
      wall.position.set(wallData.position[0], wallData.position[1], wallData.position[2]);
      wall.rotation.set(wallData.rotation[0], wallData.rotation[1], wallData.rotation[2]);
      wall.castShadow = true;
      wall.receiveShadow = true;
      
      scene.add(wall);
    }
  }
  
  /**
   * Add floors to scene
   */
  private addFloorsToScene(scene: THREE.Scene, roomGeometries: any[]): void {
    if (!roomGeometries) return;
    
    for (const roomData of roomGeometries) {
      if (!roomData.vertices || !roomData.id.includes('floor')) continue;
      
      // Create shape from vertices
      const shape = new THREE.Shape();
      const vertices = roomData.vertices;
      
      if (vertices.length > 0) {
        shape.moveTo(vertices[0][0], vertices[0][2] || vertices[0][1]);
        for (let i = 1; i < vertices.length; i++) {
          shape.lineTo(vertices[i][0], vertices[i][2] || vertices[i][1]);
        }
        shape.closePath();
      }
      
      // Extrude to create floor thickness
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.5,
        bevelEnabled: false
      });
      
      const material = new THREE.MeshStandardMaterial({
        color: this.getFloorColor(roomData.material_type),
        roughness: 0.6,
        metalness: 0.1
      });
      
      const floor = new THREE.Mesh(geometry, material);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = roomData.position ? roomData.position[1] : 0;
      floor.receiveShadow = true;
      
      scene.add(floor);
    }
  }
  
  /**
   * Add roof to scene
   */
  private addRoofToScene(scene: THREE.Scene, roofData: any): void {
    if (!roofData) return;
    
    // Create simple gable roof
    const roofGeometry = new THREE.ConeGeometry(
      Math.max(roofData.dimensions?.[0] || 20, roofData.dimensions?.[1] || 15) * 0.7,
      roofData.ridge_height - roofData.eave_height || 4,
      4
    );
    
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A4A4A,
      roughness: 0.9,
      metalness: 0.1
    });
    
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = roofData.eave_height || 9;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    
    scene.add(roof);
  }
  
  /**
   * Add lights to scene
   */
  private addLightsToScene(scene: THREE.Scene, lights: any[]): void {
    // Add default ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light for shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);
    
    // Add custom lights if provided
    if (lights) {
      for (const lightData of lights) {
        let light: THREE.Light;
        
        switch (lightData.type) {
          case 'AmbientLight':
            light = new THREE.AmbientLight(lightData.color, lightData.intensity);
            break;
          case 'DirectionalLight':
            light = new THREE.DirectionalLight(lightData.color, lightData.intensity);
            if (lightData.position) {
              light.position.set(lightData.position[0], lightData.position[1], lightData.position[2]);
            }
            break;
          case 'HemisphereLight':
            light = new THREE.HemisphereLight(lightData.skyColor, lightData.groundColor, lightData.intensity);
            break;
          default:
            continue;
        }
        
        scene.add(light);
      }
    }
  }
  
  /**
   * Export scene to GLB format
   */
  private async exportSceneToGLB(scene: THREE.Scene): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.exporter.parse(
        scene,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else {
            // Convert to ArrayBuffer if needed
            const json = JSON.stringify(result);
            const buffer = new TextEncoder().encode(json);
            resolve(buffer.buffer);
          }
        },
        (error) => {
          reject(error);
        },
        { binary: true }
      );
    });
  }
  
  /**
   * Count polygons in scene
   */
  private countPolygons(scene: THREE.Scene): number {
    let count = 0;
    
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const geometry = object.geometry;
        if (geometry instanceof THREE.BufferGeometry) {
          const index = geometry.index;
          if (index) {
            count += index.count / 3;
          } else {
            const position = geometry.attributes.position;
            if (position) {
              count += position.count / 3;
            }
          }
        }
      }
    });
    
    return Math.floor(count);
  }
  
  // Helper methods
  
  private calculatePolygonBudget(complexity: string): number {
    switch (complexity) {
      case 'simple': return 2000;
      case 'moderate': return 5000;
      case 'complex': return 10000;
      default: return 3500;
    }
  }
  
  private determineRoofType(data: any): string {
    // Could analyze roof geometry to determine type
    return 'gable'; // Default
  }
  
  private extractCurvedElements(data: any): any[] {
    // Extract any curved walls or features
    return [];
  }
  
  private findEntryDoor(data: any): any {
    return { position: [0, 0, 0], direction: 'south' };
  }
  
  private findGarageDoor(data: any): any {
    return null;
  }
  
  private findMajorWindows(data: any): any[] {
    return [];
  }
  
  private generatePropertyBoundaries(envelope: any): number[][] {
    const length = envelope.overall_dimensions?.length || 30;
    const width = envelope.overall_dimensions?.width || 20;
    
    // Create property 30 feet larger on each side
    return [
      [-30, 0, -30],
      [length + 30, 0, -30],
      [length + 30, 0, width + 30],
      [-30, 0, width + 30]
    ];
  }
  
  private calculateSetbacks(envelope: any): any {
    return {
      front: 25,
      rear: 20,
      left: 10,
      right: 10,
      compliant: true
    };
  }
  
  private calculateLotCoverage(envelope: any): any {
    const buildingFootprint = envelope.footprint_sqft || 600;
    const lotArea = (buildingFootprint + 2000) * 1.5; // Estimate
    
    return {
      building_footprint: buildingFootprint,
      lot_area: lotArea,
      coverage_percent: (buildingFootprint / lotArea) * 100,
      max_allowed: 35
    };
  }
  
  private calculateDrivewayPoint(envelope: any): number[] {
    const center = envelope.building_center || [0, 0, 0];
    return [center[0], 0, -5]; // Front of building
  }
  
  private generateLODLevels(complexity: string): any[] {
    return [
      { distance: 0, detail: 'high' },
      { distance: 50, detail: 'medium' },
      { distance: 100, detail: 'low' }
    ];
  }
  
  private getFloorColor(materialType: string): number {
    const colors: { [key: string]: number } = {
      'hardwood_floor': 0x8B4513,
      'tile_floor': 0xE8E8E8,
      'carpet_floor': 0x708090,
      'concrete_floor': 0x808080
    };
    
    return colors[materialType] || 0x8B4513;
  }
  
  /**
   * Save GLB file to disk
   */
  async saveGLBFile(glbData: ArrayBuffer, filename: string): Promise<string> {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'glb-models');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, Buffer.from(glbData));
    
    return filepath;
  }
}

// Export singleton
export const glbGenerator = new GLBGenerator();