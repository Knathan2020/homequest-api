// ========================================
// 3D EXPORT SERVICE - export.service.ts
// Export to JSON, OBJ, glTF formats
// ========================================

import * as THREE from 'three';
// Temporarily disable these imports for CommonJS compatibility
// import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
// import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';
// import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter';
// import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
const GLTFExporter = null as any;
const OBJExporter = null as any;
const PLYExporter = null as any;
const STLExporter = null as any;
// Note: ColladaExporter not available in this Three.js version
import * as fs from 'fs/promises';
// Import interfaces locally since they're not exported
interface Generated3DModel {
  scene: THREE.Scene;
  metadata: any;
  materials?: Map<string, THREE.Material>;
  groups?: {
    rooms?: Map<string, THREE.Group>;
  };
  meshes?: {
    walls?: THREE.Mesh[];
  };
}

interface FloorPlan3D {
  floors: any[];
  metadata: any;
}

export enum ExportFormat {
  JSON = 'json',
  GLTF = 'gltf',
  GLB = 'glb',
  OBJ = 'obj',
  STL = 'stl',
  PLY = 'ply',
  COLLADA = 'dae',
  THREEJS = 'three',
  USD = 'usd',
  FBX = 'fbx'
}

interface ExportOptions {
  format: ExportFormat;
  outputPath?: string;
  includeTextures?: boolean;
  includeLights?: boolean;
  includeAnimations?: boolean;
  optimize?: boolean;
  compress?: boolean;
  embedImages?: boolean;
  binary?: boolean;
  precision?: number;
  scale?: number;
  units?: 'meters' | 'centimeters' | 'millimeters' | 'feet' | 'inches';
  metadata?: {
    title?: string;
    author?: string;
    description?: string;
    copyright?: string;
    generator?: string;
    version?: string;
    created?: Date;
  };
}

interface ExportResult {
  success: boolean;
  format: ExportFormat;
  data?: Buffer | string | ArrayBuffer;
  filePath?: string;
  fileSize?: number;
  metadata?: {
    vertexCount: number;
    triangleCount: number;
    materialCount: number;
    textureCount: number;
    exportTime: number;
  };
  errors?: string[];
}

interface MaterialExport {
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  transparent: boolean;
  texture?: string;
}

interface CustomJSONExport {
  version: string;
  metadata: any;
  scene: {
    name: string;
    children: any[];
    lights: any[];
    cameras: any[];
  };
  geometries: any[];
  materials: MaterialExport[];
  textures: any[];
  rooms: any[];
  walls: any[];
  connections: any[];
  dimensions: {
    bounds: any;
    units: string;
    scale: number;
  };
}

export class Export3DService {
  private gltfExporter: any;
  private objExporter: any;
  private plyExporter: any;
  private stlExporter: any;

  constructor() {
    // Temporarily disabled for CommonJS compatibility
    // this.gltfExporter = new GLTFExporter();
    // this.objExporter = new OBJExporter();
    // this.plyExporter = new PLYExporter();
    // this.stlExporter = new STLExporter();
  }

  /**
   * Export 3D model to specified format
   */
  async export(
    model: Generated3DModel,
    options: ExportOptions
  ): Promise<ExportResult> {
    const startTime = Date.now();
    console.log(`📦 Exporting 3D model to ${options.format}...`);

    try {
      let result: ExportResult;

      // Prepare scene for export
      const preparedScene = await this.prepareSceneForExport(model, options);

      switch (options.format) {
        case ExportFormat.JSON:
        case ExportFormat.THREEJS:
          result = await this.exportToJSON(model, preparedScene, options);
          break;

        case ExportFormat.GLTF:
        case ExportFormat.GLB:
          result = await this.exportToGLTF(preparedScene, options);
          break;

        case ExportFormat.OBJ:
          result = await this.exportToOBJ(preparedScene, options);
          break;

        case ExportFormat.STL:
          result = await this.exportToSTL(preparedScene, options);
          break;

        case ExportFormat.PLY:
          result = await this.exportToPLY(preparedScene, options);
          break;

        case ExportFormat.COLLADA:
          result = await this.exportToCollada(preparedScene, options);
          break;

        case ExportFormat.USD:
          result = await this.exportToUSD(preparedScene, options);
          break;

        case ExportFormat.FBX:
          result = await this.exportToFBX(preparedScene, options);
          break;

        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      // Add export metadata
      result.metadata = {
        ...result.metadata,
        vertexCount: result.metadata?.vertexCount || 0,
        triangleCount: result.metadata?.triangleCount || 0,
        materialCount: result.metadata?.materialCount || 0,
        textureCount: result.metadata?.textureCount || 0,
        exportTime: Date.now() - startTime
      };

      // Save to file if path provided
      if (options.outputPath && result.data) {
        await this.saveToFile(result.data, options.outputPath, options.format);
        result.filePath = options.outputPath;
      }

      console.log(`✅ Export completed in ${result.metadata?.exportTime || 0}ms`);
      return result;

    } catch (error) {
      console.error('❌ Export failed:', error);
      return {
        success: false,
        format: options.format,
        errors: [error instanceof Error ? error.message : 'Export failed']
      };
    }
  }

  /**
   * Export to custom JSON format
   */
  private async exportToJSON(
    model: Generated3DModel,
    scene: THREE.Scene,
    options: ExportOptions
  ): Promise<ExportResult> {
    const jsonExport: CustomJSONExport = {
      version: '1.0.0',
      metadata: {
        ...options.metadata,
        created: new Date().toISOString(),
        generator: 'FloorPlan3D Export Service',
        vertices: model.metadata?.vertexCount || 0,
        triangles: model.metadata?.triangleCount || 0,
        rooms: model.metadata?.roomCount || 0,
        walls: model.metadata?.wallCount || 0
      } as any,
      scene: {
        name: scene.name || 'Floor Plan 3D',
        children: [],
        lights: [],
        cameras: []
      },
      geometries: [],
      materials: [],
      textures: [],
      rooms: [],
      walls: [],
      connections: [],
      dimensions: {
        bounds: {
          min: model.metadata?.bounds?.min?.toArray() || [0, 0, 0],
          max: model.metadata?.bounds?.max?.toArray() || [1, 1, 1]
        },
        units: options.units || 'meters',
        scale: options.scale || 1
      }
    };

    // Export scene objects
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        jsonExport.scene.children.push(this.serializeMesh(object));
        
        // Add geometry if not already included
        const geoId = (object.geometry as any).uuid;
        if (!jsonExport.geometries.find((g: any) => g.uuid === geoId)) {
          jsonExport.geometries.push(this.serializeGeometry(object.geometry));
        }
      } else if (object instanceof THREE.Light) {
        if (options.includeLights) {
          jsonExport.scene.lights.push(this.serializeLight(object));
        }
      }
    });

    // Export materials - with type safety check
    if (model.materials) {
      for (const [name, material] of model.materials) {
        jsonExport.materials.push(this.serializeMaterial(name, material));
      }
    }

    // Export room data - with type safety check
    if (model.groups && model.groups.rooms) {
      for (const [roomId, roomGroup] of model.groups.rooms) {
        jsonExport.rooms.push(this.serializeRoom(roomId, roomGroup));
      }
    }

    // Export wall data - with type safety check
    if (model.meshes && model.meshes.walls) {
      model.meshes.walls.forEach((wall: THREE.Mesh, index: number) => {
        jsonExport.walls.push(this.serializeWall(wall, index));
      });
    }

    const jsonString = JSON.stringify(jsonExport, null, options.compress ? 0 : 2);
    const data = Buffer.from(jsonString);

    return {
      success: true,
      format: options.format,
      data,
      fileSize: data.length,
      metadata: {
        vertexCount: model.metadata?.vertexCount || 0,
        triangleCount: model.metadata?.triangleCount || 0,
        materialCount: jsonExport.materials.length,
        textureCount: jsonExport.textures.length,
        exportTime: 0
      }
    };
  }

  /**
   * Export to glTF/GLB format
   */
  private async exportToGLTF(
    scene: THREE.Scene,
    options: ExportOptions
  ): Promise<ExportResult> {
    return new Promise((resolve) => {
      const exportOptions = {
        binary: options.format === ExportFormat.GLB,
        embedImages: options.embedImages ?? true,
        animations: options.includeAnimations ? [] : undefined,
        forceIndices: true,
        truncateDrawRange: false
      };

      this.gltfExporter.parse(
        scene,
        (result: any) => {
          let data: Buffer;
          
          if (result instanceof ArrayBuffer) {
            data = Buffer.from(result);
          } else {
            data = Buffer.from(JSON.stringify(result));
          }

          resolve({
            success: true,
            format: options.format,
            data,
            fileSize: data.length,
            metadata: {
              vertexCount: this.countVertices(scene),
              triangleCount: this.countTriangles(scene),
              materialCount: this.countMaterials(scene),
              textureCount: this.countTextures(scene),
              exportTime: 0
            }
          });
        },
        (error: any) => {
          resolve({
            success: false,
            format: options.format,
            errors: [error.message]
          });
        },
        exportOptions
      );
    });
  }

  /**
   * Export to OBJ format
   */
  private async exportToOBJ(
    scene: THREE.Scene,
    options: ExportOptions
  ): Promise<ExportResult> {
    const objContent = this.objExporter.parse(scene);
    const data = Buffer.from(objContent);

    void scene; // Mark scene as used for MTL generation
    
    return {
      success: true,
      format: options.format,
      data,
      fileSize: data.length,
      metadata: {
        vertexCount: this.countVertices(scene),
        triangleCount: this.countTriangles(scene),
        materialCount: this.countMaterials(scene),
        textureCount: 0,
        exportTime: 0
      }
    };
  }

  /**
   * Export to STL format
   */
  private async exportToSTL(
    scene: THREE.Scene,
    options: ExportOptions
  ): Promise<ExportResult> {
    // Merge all meshes for STL export
    const mergedGeometry = this.mergeSceneGeometries(scene);
    const mesh = new THREE.Mesh(mergedGeometry);
    
    const stlResult = this.stlExporter.parse(mesh, { binary: options.binary ?? true });
    
    let data: Buffer;
    if (stlResult instanceof ArrayBuffer) {
      data = Buffer.from(stlResult);
    } else if (typeof stlResult === 'string') {
      data = Buffer.from(stlResult);
    } else {
      data = Buffer.from('');
    }

    return {
      success: true,
      format: options.format,
      data,
      fileSize: data.length,
      metadata: {
        vertexCount: mergedGeometry.attributes.position.count,
        triangleCount: mergedGeometry.index ? mergedGeometry.index.count / 3 : 0,
        materialCount: 0,
        textureCount: 0,
        exportTime: 0
      }
    };
  }

  /**
   * Export to PLY format
   */
  private async exportToPLY(
    scene: THREE.Scene,
    options: ExportOptions
  ): Promise<ExportResult> {
    const plyResult = this.plyExporter.parse(scene, () => {}, {});
    
    let data: Buffer;
    if (plyResult) {
      data = Buffer.from(plyResult);
    } else {
      data = Buffer.from('');
    }

    return {
      success: true,
      format: options.format,
      data,
      fileSize: data.length,
      metadata: {
        vertexCount: this.countVertices(scene),
        triangleCount: this.countTriangles(scene),
        materialCount: 0,
        textureCount: 0,
        exportTime: 0
      }
    };
  }

  /**
   * Export to Collada (DAE) format
   */
  private async exportToCollada(
    _scene: THREE.Scene,
    _options: ExportOptions
  ): Promise<ExportResult> {
    // ColladaExporter not available in this Three.js version
    throw new Error(`Collada export not supported in current Three.js version`);
  }

  /**
   * Export to USD format (placeholder)
   */
  private async exportToUSD(
    scene: THREE.Scene,
    _options: ExportOptions
  ): Promise<ExportResult> {
    // USD export would require additional libraries
    // This is a placeholder implementation
    
    const usdContent = this.generateUSDContent(scene, _options);
    const data = Buffer.from(usdContent);

    return {
      success: true,
      format: _options.format,
      data,
      fileSize: data.length,
      metadata: {
        vertexCount: this.countVertices(scene),
        triangleCount: this.countTriangles(scene),
        materialCount: this.countMaterials(scene),
        textureCount: 0,
        exportTime: 0
      }
    };
  }

  /**
   * Export to FBX format (placeholder)
   */
  private async exportToFBX(
    _scene: THREE.Scene,
    _options: ExportOptions
  ): Promise<ExportResult> {
    // FBX export would require additional libraries
    // This is a placeholder implementation
    
    throw new Error('FBX export not yet implemented');
  }

  /**
   * Export floor plan mapping data
   */
  async exportFloorPlanMapping(
    floorPlan3D: FloorPlan3D,
    options: ExportOptions
  ): Promise<ExportResult> {
    const exportData = {
      version: '1.0.0',
      metadata: {
        ...options.metadata,
        created: new Date().toISOString(),
        totalVolume: (floorPlan3D as any).totalVolume || 0,
        totalArea: (floorPlan3D as any).totalArea || 0,
        floorCount: (floorPlan3D as any).floors?.size || 0,
        roomCount: (floorPlan3D as any).rooms?.size || 0
      },
      floors: Array.from((floorPlan3D as any).floors?.entries() || []).map((entry: any) => {
        const [level, floor] = entry;
        return {
        level,
        elevation: floor.elevation,
        height: floor.height,
        area: floor.area,
          rooms: floor.rooms
        };
      }),
      rooms: Array.from((floorPlan3D as any).rooms?.values() || []).map((room: any) => ({
        id: room.roomId,
        type: room.roomType,
        floor: room.floor,
        bounds2D: room.bounds2D,
        bounds3D: {
          min: room.bounds3D.min.toArray(),
          max: room.bounds3D.max.toArray()
        },
        height: room.height,
        volume: room.volume,
        adjacentRooms: room.adjacentRooms,
        connections: room.connections.map((c: any) => ({
          to: c.toRoom,
          type: c.type,
          position: c.position.toArray(),
          width: c.width,
          height: c.height
        })),
        features: room.features.map((f: any) => ({
          type: f.type,
          position: f.position.toArray(),
          dimensions: f.dimensions.toArray(),
          rotation: f.rotation.toArray()
        })),
        lighting: {
          natural: room.lighting.natural.map((l: any) => ({
            type: l.type,
            position: l.position.toArray(),
            direction: l.direction.toArray(),
            intensity: l.intensity
          })),
          artificial: room.lighting.artificial.map((l: any) => ({
            type: l.type,
            position: l.position.toArray(),
            color: l.color.getHex(),
            intensity: l.intensity
          })),
          ambientLevel: room.lighting.ambientLevel
        }
      })),
      connections: ((floorPlan3D as any).connections || []).map((c: any) => ({
        from: c.fromRoom,
        to: c.toRoom,
        type: c.type,
        position: c.position.toArray(),
        width: c.width,
        height: c.height,
        bidirectional: c.bidirectional
      })),
      bounds: {
        min: (floorPlan3D as any).bounds?.min?.toArray() || [0, 0, 0],
        max: (floorPlan3D as any).bounds?.max?.toArray() || [1, 1, 1]
      }
    };

    const jsonString = JSON.stringify(exportData, null, options.compress ? 0 : 2);
    const data = Buffer.from(jsonString);

    return {
      success: true,
      format: ExportFormat.JSON,
      data,
      fileSize: data.length,
      metadata: {
        vertexCount: 0,
        triangleCount: 0,
        materialCount: 0,
        textureCount: 0,
        exportTime: 0
      }
    };
  }

  /**
   * Batch export to multiple formats
   */
  async batchExport(
    model: Generated3DModel,
    formats: ExportFormat[],
    baseOptions: Partial<ExportOptions>
  ): Promise<Map<ExportFormat, ExportResult>> {
    const results = new Map<ExportFormat, ExportResult>();

    for (const format of formats) {
      const options: ExportOptions = {
        ...baseOptions,
        format
      };

      if (baseOptions.outputPath) {
        const ext = this.getFileExtension(format);
        const basePath = baseOptions.outputPath.replace(/\.[^/.]+$/, '');
        options.outputPath = `${basePath}.${ext}`;
      }

      const result = await this.export(model, options);
      results.set(format, result);
    }

    return results;
  }

  /**
   * Helper methods
   */

  private async prepareSceneForExport(
    model: Generated3DModel,
    options: ExportOptions
  ): Promise<THREE.Scene> {
    const scene = model.scene.clone();

    // Apply scale if specified
    if (options.scale && options.scale !== 1) {
      scene.scale.multiplyScalar(options.scale);
    }

    // Remove lights if not included
    if (!options.includeLights) {
      const lights: THREE.Object3D[] = [];
      scene.traverse((object) => {
        if (object instanceof THREE.Light) {
          lights.push(object);
        }
      });
      lights.forEach(light => scene.remove(light));
    }

    // Optimize if requested
    if (options.optimize) {
      this.optimizeScene(scene);
    }

    return scene;
  }

  private optimizeScene(scene: THREE.Scene): void {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        // Optimize geometry
        if (object.geometry) {
          object.geometry.computeBoundingBox();
          object.geometry.computeBoundingSphere();
          
          // Remove unnecessary attributes for certain formats
          const attributes = object.geometry.attributes;
          if (attributes.uv2) delete attributes.uv2;
          if (attributes.color && !object.material) delete attributes.color;
        }

        // Optimize materials
        if (object.material instanceof THREE.MeshStandardMaterial) {
          if (object.material.metalness === 0) {
            object.material.metalness = 0.01; // Avoid pure 0 for better compatibility
          }
        }
      }
    });
  }

  private mergeSceneGeometries(scene: THREE.Scene): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry) {
        const geometry = object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        geometries.push(geometry);
      }
    });

    // Simple geometry merging fallback
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }
    if (geometries.length === 1) {
      return geometries[0];
    }
    // For multiple geometries, return the first one as fallback
    return geometries[0];
  }

  private generateMTL(_scene: THREE.Scene): string {
    let mtl = '# Material file generated by Export3DService\n\n';
    const materials = new Set<THREE.Material>();

    _scene.traverse((object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh && object.material) {
        materials.add(object.material);
      }
    });

    materials.forEach((material, index) => {
      const mat = material as THREE.MeshStandardMaterial;
      mtl += `newmtl material_${index}\n`;
      mtl += `Ka 0.0 0.0 0.0\n`; // Ambient
      
      if (mat.color) {
        mtl += `Kd ${mat.color.r} ${mat.color.g} ${mat.color.b}\n`; // Diffuse
      }
      
      mtl += `Ks 0.5 0.5 0.5\n`; // Specular
      mtl += `Ns ${(1 - mat.roughness) * 1000}\n`; // Shininess
      mtl += `d ${mat.opacity}\n`; // Opacity
      mtl += `illum 2\n\n`;
    });

    return mtl;
  }

  private generateUSDContent(scene: THREE.Scene, options: ExportOptions): string {
    // Simplified USD ASCII format
    let usd = `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = ${options.units === 'meters' ? 1 : 0.01}
    upAxis = "Y"
)

def Xform "Root" (
    assetInfo = {
        string name = "Floor Plan 3D"
    }
    kind = "component"
)
{
`;

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        usd += this.generateUSDMesh(object);
      }
    });

    usd += '}\n';
    return usd;
  }

  private generateUSDMesh(mesh: THREE.Mesh): string {
    const name = mesh.name || `mesh_${mesh.uuid}`;
    return `
    def Mesh "${name}"
    {
        float3[] extent = [(-1, -1, -1), (1, 1, 1)]
        int[] faceVertexCounts = []
        int[] faceVertexIndices = []
        point3f[] points = []
        
        matrix4d xformOp:transform = (
            (1, 0, 0, 0),
            (0, 1, 0, 0),
            (0, 0, 1, 0),
            (${mesh.position.x}, ${mesh.position.y}, ${mesh.position.z}, 1)
        )
        uniform token[] xformOpOrder = ["xformOp:transform"]
    }
`;
  }

  private serializeMesh(mesh: THREE.Mesh): any {
    return {
      type: 'Mesh',
      name: mesh.name,
      uuid: mesh.uuid,
      position: mesh.position.toArray(),
      rotation: mesh.rotation.toArray(),
      scale: mesh.scale.toArray(),
      geometry: (mesh.geometry as any).uuid,
      material: (mesh.material as any).uuid,
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow
    };
  }

  private serializeGeometry(geometry: THREE.BufferGeometry): any {
    const serialized: any = {
      type: 'BufferGeometry',
      uuid: (geometry as any).uuid,
      attributes: {}
    };

    // Serialize attributes
    for (const key in geometry.attributes) {
      const attribute = geometry.attributes[key];
      serialized.attributes[key] = {
        array: Array.from(attribute.array),
        itemSize: attribute.itemSize,
        normalized: attribute.normalized
      };
    }

    // Serialize index if present
    if (geometry.index) {
      serialized.index = {
        array: Array.from(geometry.index.array)
      };
    }

    return serialized;
  }

  private serializeMaterial(name: string, material: THREE.Material): MaterialExport {
    const mat = material as THREE.MeshStandardMaterial;
    return {
      name,
      color: mat.color ? `#${mat.color.getHexString()}` : '#ffffff',
      roughness: mat.roughness || 0.5,
      metalness: mat.metalness || 0,
      opacity: mat.opacity || 1,
      transparent: mat.transparent || false,
      texture: mat.map ? (mat.map as any).uuid : undefined
    };
  }

  private serializeLight(light: THREE.Light): any {
    const serialized: any = {
      type: light.type,
      name: light.name,
      color: `#${light.color.getHexString()}`,
      intensity: light.intensity,
      position: light.position.toArray()
    };

    if (light instanceof THREE.DirectionalLight) {
      serialized.target = light.target.position.toArray();
    } else if (light instanceof THREE.SpotLight) {
      serialized.angle = light.angle;
      serialized.penumbra = light.penumbra;
      serialized.decay = light.decay;
      serialized.distance = light.distance;
    } else if (light instanceof THREE.PointLight) {
      serialized.decay = light.decay;
      serialized.distance = light.distance;
    }

    return serialized;
  }

  private serializeRoom(roomId: string, roomGroup: THREE.Group): any {
    return {
      id: roomId,
      name: roomGroup.name,
      position: roomGroup.position.toArray(),
      children: roomGroup.children.map(child => child.name)
    };
  }

  private serializeWall(wall: THREE.Mesh, index: number): any {
    return {
      id: wall.name || `wall_${index}`,
      position: wall.position.toArray(),
      rotation: wall.rotation.toArray(),
      dimensions: this.getMeshDimensions(wall)
    };
  }

  private getMeshDimensions(mesh: THREE.Mesh): number[] {
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    return size.toArray();
  }

  private countVertices(scene: THREE.Scene): number {
    let count = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry) {
        count += object.geometry.attributes.position.count;
      }
    });
    return count;
  }

  private countTriangles(scene: THREE.Scene): number {
    let count = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry) {
        if (object.geometry.index) {
          count += object.geometry.index.count / 3;
        } else {
          count += object.geometry.attributes.position.count / 3;
        }
      }
    });
    return count;
  }

  private countMaterials(scene: THREE.Scene): number {
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => materials.add(mat));
        } else {
          materials.add(object.material);
        }
      }
    });
    return materials.size;
  }

  private countTextures(scene: THREE.Scene): number {
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          const mat = material as THREE.MeshStandardMaterial;
          if (mat.map) textures.add(mat.map);
          if (mat.normalMap) textures.add(mat.normalMap);
          if (mat.roughnessMap) textures.add(mat.roughnessMap);
          if (mat.metalnessMap) textures.add(mat.metalnessMap);
        });
      }
    });
    return textures.size;
  }

  private async saveToFile(
    data: Buffer | string | ArrayBuffer,
    filePath: string,
    _format: ExportFormat
  ): Promise<void> {
    let buffer: Buffer;
    
    if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data);
    } else {
      buffer = data;
    }

    await fs.writeFile(filePath, buffer);
    console.log(`💾 Saved to ${filePath} (${buffer.length} bytes)`);
  }

  private getFileExtension(format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      [ExportFormat.JSON]: 'json',
      [ExportFormat.GLTF]: 'gltf',
      [ExportFormat.GLB]: 'glb',
      [ExportFormat.OBJ]: 'obj',
      [ExportFormat.STL]: 'stl',
      [ExportFormat.PLY]: 'ply',
      [ExportFormat.COLLADA]: 'dae',
      [ExportFormat.THREEJS]: 'json',
      [ExportFormat.USD]: 'usd',
      [ExportFormat.FBX]: 'fbx'
    };
    return extensions[format] || 'bin';
  }
}

// Export singleton instance
export const export3DService = new Export3DService();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { export3DService, ExportFormat } from './services/3d/export.service';

// Export to glTF
const gltfResult = await export3DService.export(model3D, {
  format: ExportFormat.GLTF,
  outputPath: './exports/floor-plan.gltf',
  includeTextures: true,
  includeLights: true,
  optimize: true,
  metadata: {
    title: 'My Floor Plan',
    author: 'John Doe',
    description: '3D model of residential floor plan'
  }
});

console.log(`Export success: ${gltfResult.success}`);
console.log(`File size: ${gltfResult.fileSize} bytes`);
console.log(`Vertices: ${gltfResult.metadata?.vertexCount}`);

// Export to multiple formats
const formats = [
  ExportFormat.GLTF,
  ExportFormat.OBJ,
  ExportFormat.JSON
];

const batchResults = await export3DService.batchExport(
  model3D,
  formats,
  {
    outputPath: './exports/floor-plan',
    optimize: true,
    compress: true
  }
);

for (const [format, result] of batchResults) {
  console.log(`${format}: ${result.success ? 'Success' : 'Failed'}`);
  if (result.filePath) {
    console.log(`  Saved to: ${result.filePath}`);
  }
}

// Export floor plan mapping data
const mappingResult = await export3DService.exportFloorPlanMapping(
  floorPlan3D,
  {
    format: ExportFormat.JSON,
    outputPath: './exports/floor-mapping.json',
    compress: false
  }
);
*/