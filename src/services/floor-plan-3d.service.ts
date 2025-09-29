// homequest-api/src/services/floor-plan-3d.service.ts
/**
 * Backend Service for 2D to 3D Floor Plan Conversion
 * Integrates with the frontend CV engines and provides API endpoints
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import types from the CV engines (these would be shared types)
interface HeightInferenceResult {
  baseHeight: number;
  ceilingHeight: number;
  floorThickness: number;
  clearanceHeight: number;
  confidence: number;
  reasoning: string[];
}

interface WallSegment {
  id: string;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  thickness: number;
  height: number;
  isExterior: boolean;
  isLoadBearing: boolean;
  material: any;
  openings: any[];
}

interface DoorProperties {
  id: string;
  type: string;
  width: number;
  height: number;
  position: { x: number; y: number; z: number };
  swingDirection: string;
  isExterior: boolean;
}

interface WindowProperties {
  id: string;
  type: string;
  width: number;
  height: number;
  sillHeight: number;
  position: { x: number; y: number; z: number };
}

interface FloorPlan3DModel {
  id: string;
  projectId: string;
  userId: string;
  floorPlanId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  modelUrl?: string;
  thumbnailUrl?: string;
  rooms: Room3D[];
  walls: WallSegment[];
  doors: DoorProperties[];
  windows: WindowProperties[];
  furniture?: any[];
  materials?: any;
  metadata: {
    totalArea: number;
    totalVolume: number;
    floors: number;
    buildingHeight: number;
    roomCount: number;
    processingTime: number;
    confidence: number;
    heights?: any;
    [key: string]: any;
  };
  exportFormats?: {
    gltf?: string;
    glb?: string;
    obj?: string;
    ifc?: string;
    dxf?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Room3D {
  id: string;
  name: string;
  type: string;
  boundaries: any;
  height: number;
  area: number;
  volume: number;
  position: { x: number; y: number; z: number };
  furniture?: any[];
  materials?: any;
}

export class FloorPlan3DService {
  private supabase: SupabaseClient | null;
  private storageBasePath: string;
  private processingQueue: Map<string, any> = new Map();
  private models: Map<string, FloorPlan3DModel> = new Map();

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase not configured - 3D service will run in mock mode');
      this.supabase = null;
    } else {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    this.storageBasePath = process.env.STORAGE_PATH || './uploads/3d-models';
    this.ensureStorageDirectory();
  }

  /**
   * Process 2D floor plan to 3D model
   */
  async convertTo3D(
    floorPlanId: string,
    cvData: any,
    options: {
      buildingType?: 'residential' | 'commercial';
      luxuryLevel?: 'standard' | 'premium' | 'luxury';
      style?: 'modern' | 'traditional' | 'rustic';
      generateFurniture?: boolean;
      exportFormats?: string[];
    } = {}
  ): Promise<FloorPlan3DModel> {
    const startTime = Date.now();
    const modelId = uuidv4();

    try {
      // Add to processing queue
      this.processingQueue.set(modelId, {
        status: 'processing',
        startTime,
        floorPlanId
      });

      // Step 1: Get floor plan data from database
      const floorPlan = await this.getFloorPlan(floorPlanId);
      if (!floorPlan) {
        throw new Error('Floor plan not found');
      }

      // Step 2: Infer heights for rooms
      const roomHeights = await this.inferRoomHeights(cvData.rooms, options);

      // Step 3: Generate wall system
      const walls = await this.generateWalls(cvData);

      // Step 4: Detect doors and windows
      const openings = await this.detectOpenings(cvData, walls);

      // Step 5: Generate 3D room data
      const rooms3D = await this.generateRooms3D(
        cvData.rooms,
        roomHeights,
        options
      );

      // Step 6: Calculate building metrics
      const metadata = this.calculateBuildingMetrics(
        rooms3D,
        walls,
        roomHeights
      );

      // Step 7: Generate 3D model data structure
      const model3D: FloorPlan3DModel = {
        id: modelId,
        projectId: floorPlan.project_id,
        userId: floorPlan.user_id,
        floorPlanId,
        status: 'processing',
        rooms: rooms3D,
        walls: walls.walls,
        doors: openings.doors,
        windows: openings.windows,
        metadata: {
          ...metadata,
          processingTime: Date.now() - startTime,
          confidence: this.calculateConfidence(cvData, roomHeights)
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Step 8: Export to requested formats
      if (options.exportFormats && options.exportFormats.length > 0) {
        const exports = await this.exportModel(model3D, options.exportFormats);
        model3D.exportFormats = exports;
      }

      // Step 9: Generate thumbnail
      const thumbnailUrl = await this.generateThumbnail(model3D);
      model3D.thumbnailUrl = thumbnailUrl;

      // Step 10: Save to database
      if (this.supabase) {
        await this.saveModel3D(model3D);
      }

      // Update status
      model3D.status = 'completed';
      this.processingQueue.delete(modelId);

      return model3D;

    } catch (error) {
      console.error('3D conversion failed:', error);
      
      this.processingQueue.delete(modelId);
      
      throw error;
    }
  }

  /**
   * Infer room heights using the HeightInferenceEngine logic
   */
  private async inferRoomHeights(
    rooms: any[],
    options: any
  ): Promise<Map<string, HeightInferenceResult>> {
    const heights = new Map<string, HeightInferenceResult>();

    for (const room of rooms) {
      // Apply height inference logic
      const height = this.inferRoomHeight(room, options);
      heights.set(room.id, height);
    }

    return heights;
  }

  /**
   * Infer height for a single room
   */
  private inferRoomHeight(room: any, options: any): HeightInferenceResult {
    // Standard heights by room type (in meters)
    const standardHeights: Record<string, number> = {
      bedroom: 2.7,
      living: 2.7,
      kitchen: 2.7,
      bathroom: 2.4,
      hallway: 2.4,
      closet: 2.3,
      garage: 2.7,
      foyer: 3.0,
      dining: 2.7,
      office: 2.7
    };

    let baseHeight = standardHeights[room.type] || 2.7;
    const reasoning: string[] = [];

    // Adjust for luxury level
    if (options.luxuryLevel === 'premium') {
      baseHeight += 0.3;
      reasoning.push('Premium finish adds height');
    } else if (options.luxuryLevel === 'luxury') {
      baseHeight += 0.6;
      reasoning.push('Luxury finish requires impressive height');
    }

    // Adjust for room area
    if (room.area > 50) {
      baseHeight += 0.3;
      reasoning.push('Large room area suggests higher ceiling');
    }

    // Special cases
    if (room.name?.toLowerCase().includes('great') || 
        room.name?.toLowerCase().includes('grand')) {
      baseHeight += 0.6;
      reasoning.push('Grand/Great room requires impressive height');
    }

    return {
      baseHeight,
      ceilingHeight: baseHeight,
      floorThickness: 0.3,
      clearanceHeight: baseHeight - 0.1,
      confidence: 0.85,
      reasoning
    };
  }

  /**
   * Generate wall system
   */
  private async generateWalls(cvData: any): Promise<{
    walls: WallSegment[];
    corners: any[];
    statistics: any;
  }> {
    const walls: WallSegment[] = [];
    
    // Convert CV wall data to 3D walls
    for (const wall of (cvData.walls || [])) {
      walls.push({
        id: wall.id || uuidv4(),
        startPoint: wall.startPoint || { x: 0, y: 0 },
        endPoint: wall.endPoint || { x: 1, y: 0 },
        thickness: wall.thickness || 0.15,
        height: 2.7,
        isExterior: wall.isExterior || false,
        isLoadBearing: wall.isLoadBearing || false,
        material: {
          type: wall.isExterior ? 'brick' : 'drywall',
          finish: 'painted',
          color: '#FFFFFF'
        },
        openings: []
      });
    }

    return {
      walls,
      corners: [],
      statistics: {
        totalWalls: walls.length,
        exteriorWalls: walls.filter(w => w.isExterior).length,
        interiorWalls: walls.filter(w => !w.isExterior).length
      }
    };
  }

  /**
   * Detect openings (doors and windows)
   */
  private async detectOpenings(
    cvData: any,
    walls: any
  ): Promise<{
    doors: DoorProperties[];
    windows: WindowProperties[];
  }> {
    const doors: DoorProperties[] = [];
    const windows: WindowProperties[] = [];

    // Process detected doors
    for (const door of (cvData.doors || [])) {
      doors.push({
        id: door.id || uuidv4(),
        type: door.type || 'single',
        width: door.width || 0.9,
        height: door.height || 2.1,
        position: door.position || { x: 0, y: 0, z: 0 },
        swingDirection: door.swingDirection || 'left',
        isExterior: door.isExterior || false
      });
    }

    // Auto-detect windows on exterior walls
    for (const wall of walls.walls) {
      if (wall.isExterior) {
        // Add window to exterior wall
        windows.push({
          id: uuidv4(),
          type: 'double-hung',
          width: 1.2,
          height: 1.2,
          sillHeight: 0.9,
          position: {
            x: (wall.startPoint.x + wall.endPoint.x) / 2,
            y: 0.9,
            z: (wall.startPoint.y + wall.endPoint.y) / 2
          }
        });
      }
    }

    return { doors, windows };
  }

  /**
   * Generate 3D room data
   */
  private async generateRooms3D(
    rooms: any[],
    heights: Map<string, HeightInferenceResult>,
    options: any
  ): Promise<Room3D[]> {
    const rooms3D: Room3D[] = [];

    for (const room of rooms) {
      const heightInfo = heights.get(room.id);
      const height = heightInfo?.ceilingHeight || 2.7;
      const area = room.area || 10;
      const volume = area * height;

      const room3D: Room3D = {
        id: room.id,
        name: room.name || `Room ${room.id}`,
        type: room.type || 'room',
        boundaries: room.boundaries,
        height,
        area,
        volume,
        position: room.position || { x: 0, y: 0, z: 0 }
      };

      // Generate furniture if requested
      if (options.generateFurniture) {
        room3D.furniture = this.generateFurniture(room3D, options);
      }

      // Assign materials
      room3D.materials = this.assignRoomMaterials(room3D, options);

      rooms3D.push(room3D);
    }

    return rooms3D;
  }

  /**
   * Generate furniture for a room
   */
  private generateFurniture(room: Room3D, options: any): any[] {
    const furniture: any[] = [];

    // Room-specific furniture
    const furnitureMap: Record<string, any[]> = {
      bedroom: [
        { type: 'bed', size: { width: 2, depth: 1.9, height: 0.6 } },
        { type: 'wardrobe', size: { width: 1.5, depth: 0.6, height: 2 } },
        { type: 'nightstand', size: { width: 0.5, depth: 0.4, height: 0.5 } }
      ],
      living: [
        { type: 'sofa', size: { width: 2, depth: 0.9, height: 0.8 } },
        { type: 'coffee-table', size: { width: 1.2, depth: 0.6, height: 0.4 } },
        { type: 'tv-stand', size: { width: 1.5, depth: 0.4, height: 0.5 } }
      ],
      kitchen: [
        { type: 'counter', size: { width: 2, depth: 0.6, height: 0.9 } },
        { type: 'refrigerator', size: { width: 0.7, depth: 0.7, height: 1.8 } },
        { type: 'stove', size: { width: 0.6, depth: 0.6, height: 0.9 } }
      ],
      dining: [
        { type: 'dining-table', size: { width: 1.5, depth: 0.9, height: 0.75 } },
        { type: 'chair', size: { width: 0.5, depth: 0.5, height: 0.9 }, count: 6 }
      ],
      office: [
        { type: 'desk', size: { width: 1.2, depth: 0.6, height: 0.75 } },
        { type: 'office-chair', size: { width: 0.6, depth: 0.6, height: 1 } },
        { type: 'bookshelf', size: { width: 0.8, depth: 0.3, height: 2 } }
      ]
    };

    const templates = furnitureMap[room.type] || [];
    
    for (const template of templates) {
      const count = template.count || 1;
      
      for (let i = 0; i < count; i++) {
        furniture.push({
          id: uuidv4(),
          ...template,
          position: this.calculateFurniturePosition(room, template, i),
          rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
          material: this.getFurnitureMaterial(template.type, options)
        });
      }
    }

    return furniture;
  }

  /**
   * Calculate furniture position within room
   */
  private calculateFurniturePosition(
    room: Room3D,
    furniture: any,
    index: number
  ): { x: number; y: number; z: number } {
    // Simplified placement - would use proper collision detection
    const margin = 0.5;
    const x = room.position.x + margin + (index * 1.5);
    const y = 0;
    const z = room.position.z + margin;

    return { x, y, z };
  }

  /**
   * Get furniture material
   */
  private getFurnitureMaterial(furnitureType: string, options: any): any {
    const materials: Record<string, any> = {
      modern: { type: 'leather', color: '#000000' },
      traditional: { type: 'fabric', color: '#8B4513' },
      rustic: { type: 'wood', color: '#654321' }
    };

    return materials[options.style || 'modern'] || materials.modern;
  }

  /**
   * Assign materials to room
   */
  private assignRoomMaterials(room: Room3D, options: any): any {
    const materials: Record<string, any> = {
      bedroom: {
        floor: { type: 'hardwood', color: '#8B4513' },
        walls: { type: 'paint', color: '#F0F0F0' },
        ceiling: { type: 'paint', color: '#FFFFFF' }
      },
      bathroom: {
        floor: { type: 'tile', color: '#E0E0E0' },
        walls: { type: 'tile', color: '#FFFFFF' },
        ceiling: { type: 'paint', color: '#FFFFFF' }
      },
      kitchen: {
        floor: { type: 'tile', color: '#D3D3D3' },
        walls: { type: 'paint', color: '#F8F8F8' },
        ceiling: { type: 'paint', color: '#FFFFFF' }
      }
    };

    return materials[room.type] || materials.bedroom;
  }

  /**
   * Calculate building metrics
   */
  private calculateBuildingMetrics(
    rooms: Room3D[],
    walls: WallSegment[],
    heights: Map<string, HeightInferenceResult>
  ): any {
    const totalArea = rooms.reduce((sum, room) => sum + room.area, 0);
    const totalVolume = rooms.reduce((sum, room) => sum + room.volume, 0);
    
    const heightValues = Array.from(heights.values());
    const maxHeight = Math.max(
      ...heightValues.map(h => h.ceilingHeight),
      2.7
    );

    return {
      totalArea,
      totalVolume,
      floors: 1, // Single floor for now
      buildingHeight: maxHeight,
      roomCount: rooms.length
    };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    cvData: any,
    heights: Map<string, HeightInferenceResult>
  ): number {
    let totalConfidence = 0;
    let count = 0;

    // Average CV confidence
    if (cvData.confidence) {
      totalConfidence += cvData.confidence;
      count++;
    }

    // Average height inference confidence
    heights.forEach(height => {
      totalConfidence += height.confidence;
      count++;
    });

    return count > 0 ? totalConfidence / count : 0.5;
  }

  /**
   * Export model to various formats
   */
  private async exportModel(
    model: FloorPlan3DModel,
    formats: string[]
  ): Promise<any> {
    const exports: any = {};

    for (const format of formats) {
      const filename = `${model.id}.${format}`;
      const filepath = path.join(this.storageBasePath, filename);

      // Generate export data based on format
      if (format === 'gltf' || format === 'glb') {
        // Generate GLTF/GLB data
        const gltfData = await this.generateGLTF(model);
        await fs.writeFile(filepath, gltfData);
        exports[format] = `/api/3d-models/${filename}`;
      } else if (format === 'obj') {
        // Generate OBJ data
        const objData = await this.generateOBJ(model);
        await fs.writeFile(filepath, objData);
        exports[format] = `/api/3d-models/${filename}`;
      } else if (format === 'ifc') {
        // Generate IFC data
        const ifcData = await this.generateIFC(model);
        await fs.writeFile(filepath, ifcData);
        exports[format] = `/api/3d-models/${filename}`;
      }
    }

    return exports;
  }

  /**
   * Generate GLTF data
   */
  private async generateGLTF(model: FloorPlan3DModel): Promise<Buffer> {
    // This would use the three.js GLTFExporter on the server
    // For now, return mock data
    const gltf = {
      asset: { version: '2.0' },
      scenes: [{ nodes: [0] }],
      nodes: model.rooms.map((room, i) => ({
        name: room.name,
        mesh: i
      })),
      meshes: model.rooms.map(room => ({
        primitives: [{
          attributes: {
            POSITION: 0,
            NORMAL: 1,
            TEXCOORD_0: 2
          }
        }]
      }))
    };

    return Buffer.from(JSON.stringify(gltf));
  }

  /**
   * Generate OBJ data
   */
  private async generateOBJ(model: FloorPlan3DModel): Promise<string> {
    let obj = '# HomeQuest 3D Model\n';
    obj += `# Generated: ${new Date().toISOString()}\n\n`;

    let vertexOffset = 1;

    for (const room of model.rooms) {
      obj += `o ${room.name}\n`;
      
      // Generate vertices for room (simplified box)
      const hw = room.area / 2;
      const hh = room.height / 2;
      
      // Bottom vertices
      obj += `v ${-hw} 0 ${-hw}\n`;
      obj += `v ${hw} 0 ${-hw}\n`;
      obj += `v ${hw} 0 ${hw}\n`;
      obj += `v ${-hw} 0 ${hw}\n`;
      
      // Top vertices  
      obj += `v ${-hw} ${room.height} ${-hw}\n`;
      obj += `v ${hw} ${room.height} ${-hw}\n`;
      obj += `v ${hw} ${room.height} ${hw}\n`;
      obj += `v ${-hw} ${room.height} ${hw}\n`;

      // Generate faces
      const v = vertexOffset;
      
      // Bottom face
      obj += `f ${v} ${v+1} ${v+2} ${v+3}\n`;
      // Top face
      obj += `f ${v+4} ${v+7} ${v+6} ${v+5}\n`;
      // Sides
      obj += `f ${v} ${v+4} ${v+5} ${v+1}\n`;
      obj += `f ${v+1} ${v+5} ${v+6} ${v+2}\n`;
      obj += `f ${v+2} ${v+6} ${v+7} ${v+3}\n`;
      obj += `f ${v+3} ${v+7} ${v+4} ${v}\n`;
      
      vertexOffset += 8;
      obj += '\n';
    }

    return obj;
  }

  /**
   * Generate IFC data
   */
  private async generateIFC(model: FloorPlan3DModel): Promise<string> {
    let ifc = 'ISO-10303-21;\n';
    ifc += 'HEADER;\n';
    ifc += `FILE_DESCRIPTION(('IFC4'),'2;1');\n`;
    ifc += `FILE_NAME('${model.id}.ifc','${new Date().toISOString()}',(),(),'HomeQuest','','');\n`;
    ifc += 'FILE_SCHEMA(("IFC4"));\n';
    ifc += 'ENDSEC;\n\n';
    
    ifc += 'DATA;\n';
    
    // Add IFC entities for rooms, walls, doors, windows
    let entityId = 1;
    
    for (const room of model.rooms) {
      ifc += `#${entityId++}=IFCSPACE('${uuidv4().replace(/-/g, '')}',#2,'${room.name}','','',$,$,$,.ELEMENT.,.INTERNAL.,$);\n`;
    }
    
    for (const wall of model.walls) {
      ifc += `#${entityId++}=IFCWALLSTANDARDCASE('${uuidv4().replace(/-/g, '')}',#2,'Wall','','',$,$,$);\n`;
    }
    
    ifc += 'ENDSEC;\n';
    ifc += 'END-ISO-10303-21;\n';
    
    return ifc;
  }

  /**
   * Generate thumbnail
   */
  private async generateThumbnail(model: FloorPlan3DModel): Promise<string> {
    // Generate a 2D preview image
    const width = 400;
    const height = 300;
    
    // Create a simple SVG representation
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${width}" height="${height}" fill="#f0f0f0"/>`;
    
    // Draw rooms
    for (const room of model.rooms) {
      const x = (room.position.x + 10) * 10;
      const y = (room.position.z + 10) * 10;
      const w = Math.sqrt(room.area) * 10;
      
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="#e0e0e0" stroke="#999" stroke-width="2"/>`;
      svg += `<text x="${x + w/2}" y="${y + w/2}" text-anchor="middle" font-size="12">${room.name}</text>`;
    }
    
    svg += '</svg>';
    
    // Convert SVG to PNG using sharp
    const buffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();
    
    // Save thumbnail
    const filename = `${model.id}_thumb.png`;
    const filepath = path.join(this.storageBasePath, 'thumbnails', filename);
    await fs.writeFile(filepath, buffer);
    
    return `/api/3d-models/thumbnails/${filename}`;
  }

  // Database operations
  
  private async getFloorPlan(floorPlanId: string): Promise<any> {
    if (!this.supabase) {
      // Mock data
      return {
        id: floorPlanId,
        project_id: 'mock-project',
        user_id: 'mock-user'
      };
    }

    const { data, error } = await this.supabase
      .from('floor_plans')
      .select('*')
      .eq('id', floorPlanId)
      .single();

    if (error) throw error;
    return data;
  }

  private async saveModel3D(model: FloorPlan3DModel): Promise<void> {
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from('floor_plan_3d_models')
      .insert({
        id: model.id,
        floor_plan_id: model.floorPlanId,
        project_id: model.projectId,
        user_id: model.userId,
        status: model.status,
        model_url: model.modelUrl,
        thumbnail_url: model.thumbnailUrl,
        metadata: model.metadata,
        export_formats: model.exportFormats,
        rooms: model.rooms,
        walls: model.walls,
        doors: model.doors,
        windows: model.windows,
        created_at: model.createdAt,
        updated_at: model.updatedAt
      });

    if (error) throw error;
  }

  // Alias for saveModel3D
  private async saveToDatabase(model: FloorPlan3DModel): Promise<void> {
    return this.saveModel3D(model);
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageBasePath, { recursive: true });
      await fs.mkdir(path.join(this.storageBasePath, 'thumbnails'), { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directories:', error);
    }
  }

  /**
   * Get processing status
   */
  getProcessingStatus(modelId: string): any {
    return this.processingQueue.get(modelId) || { status: 'not-found' };
  }

  /**
   * Get all models for a project
   */
  async getProjectModels(projectId: string): Promise<FloorPlan3DModel[]> {
    if (!this.supabase) return [];

    const { data, error } = await this.supabase
      .from('floor_plan_3d_models')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a specific model
   */
  async getModel(modelId: string): Promise<FloorPlan3DModel | null> {
    const model = this.models.get(modelId);
    if (model) return model;

    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from('floor_plan_3d_models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Update materials for a model
   */
  async updateMaterials(modelId: string, materials: any): Promise<FloorPlan3DModel | null> {
    const model = this.models.get(modelId);
    if (!model) return null;

    model.materials = materials;
    model.updatedAt = new Date().toISOString();

    await this.saveToDatabase(model);
    return model;
  }

  /**
   * Add furniture to a model
   */
  async addFurniture(modelId: string, furnitureData: any): Promise<FloorPlan3DModel | null> {
    const model = this.models.get(modelId);
    if (!model) return null;

    if (!model.furniture) model.furniture = [];
    model.furniture.push(furnitureData);
    model.updatedAt = new Date().toISOString();

    await this.saveToDatabase(model);
    return model;
  }

  /**
   * Update heights for a model
   */
  async updateHeights(modelId: string, heights: any): Promise<FloorPlan3DModel | null> {
    const model = this.models.get(modelId);
    if (!model) return null;

    model.metadata = { ...model.metadata, heights };
    model.updatedAt = new Date().toISOString();

    await this.saveToDatabase(model);
    return model;
  }

  /**
   * Delete a model
   */
  async deleteModel(modelId: string): Promise<boolean> {
    this.models.delete(modelId);

    if (!this.supabase) return true;

    const { error } = await this.supabase
      .from('floor_plan_3d_models')
      .delete()
      .eq('id', modelId);

    return !error;
  }
}

// Export singleton
export const floorPlan3DService = new FloorPlan3DService();