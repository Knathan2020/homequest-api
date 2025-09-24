// ========================================
// 3D MODEL GENERATOR - model-3d-generator.ts
// Generate Three.js compatible 3D data
// ========================================

import * as THREE from 'three';
import { Wall, Door, Window } from '../../types/floor-plan.types';
import { Room, RoomType } from '../../types/room.types';

// Define missing Point2D interface
interface Point2D {
  x: number;
  y: number;
}

interface Model3DOptions {
  wallHeight?: number;
  wallThickness?: number;
  floorThickness?: number;
  ceilingThickness?: number;
  doorHeight?: number;
  windowHeight?: number;
  windowSillHeight?: number;
  baseboardHeight?: number;
  crownMoldingHeight?: number;
  scale?: number;
  origin?: Point2D;
  materials?: MaterialOptions;
  generateTextures?: boolean;
  generateLighting?: boolean;
  optimizeMesh?: boolean;
}

interface MaterialOptions {
  wall?: THREE.MeshStandardMaterialParameters;
  floor?: THREE.MeshStandardMaterialParameters;
  ceiling?: THREE.MeshStandardMaterialParameters;
  door?: THREE.MeshStandardMaterialParameters;
  window?: THREE.MeshStandardMaterialParameters;
  baseboard?: THREE.MeshStandardMaterialParameters;
  crownMolding?: THREE.MeshStandardMaterialParameters;
}

interface Generated3DModel {
  scene: THREE.Scene;
  meshes: {
    walls: THREE.Mesh[];
    floors: THREE.Mesh[];
    ceilings: THREE.Mesh[];
    doors: THREE.Mesh[];
    windows: THREE.Mesh[];
    extras: THREE.Mesh[];
  };
  groups: {
    rooms: Map<string, THREE.Group>;
    walls: THREE.Group;
    openings: THREE.Group;
  };
  metadata: {
    bounds: THREE.Box3;
    center: THREE.Vector3;
    dimensions: THREE.Vector3;
    roomCount: number;
    wallCount: number;
    doorCount: number;
    windowCount: number;
    triangleCount: number;
    vertexCount: number;
  };
  materials: Map<string, THREE.Material>;
  lights?: THREE.Light[];
}

interface WallSegment3D {
  start: THREE.Vector3;
  end: THREE.Vector3;
  height: number;
  thickness: number;
  normal: THREE.Vector3;
  hasOpening: boolean;
  openings: Array<{
    type: 'door' | 'window';
    position: THREE.Vector3;
    width: number;
    height: number;
  }>;
}

export class Model3DGenerator {
  private defaultOptions: Model3DOptions = {
    wallHeight: 2.4, // 2.4 meters (8 feet)
    wallThickness: 0.15, // 15cm
    floorThickness: 0.1, // 10cm
    ceilingThickness: 0.1, // 10cm
    doorHeight: 2.1, // 2.1 meters
    windowHeight: 1.2, // 1.2 meters
    windowSillHeight: 0.9, // 90cm from floor
    baseboardHeight: 0.1, // 10cm
    crownMoldingHeight: 0.05, // 5cm
    scale: 1, // 1 unit = 1 meter
    origin: { x: 0, y: 0 },
    generateTextures: true,
    generateLighting: true,
    optimizeMesh: true
  };

  private materials: Map<string, THREE.Material>;
  // private textureLoader: THREE.TextureLoader; // Removed as unused

  constructor() {
    this.materials = new Map();
    // this.textureLoader = new THREE.TextureLoader(); // Removed as unused
    this.initializeDefaultMaterials();
  }

  /**
   * Initialize default materials
   */
  private initializeDefaultMaterials(): void {
    // Wall material
    this.materials.set('wall', new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide
    }));

    // Floor material
    this.materials.set('floor', new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
      metalness: 0.0
    }));

    // Ceiling material
    this.materials.set('ceiling', new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0
    }));

    // Door material
    this.materials.set('door', new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.6,
      metalness: 0.1
    }));

    // Window material (glass)
    this.materials.set('window', new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
      metalness: 0.0,
      transmission: 0.9,
      thickness: 0.01
    }));

    // Baseboard material
    this.materials.set('baseboard', new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.0
    }));

    // Crown molding material
    this.materials.set('crownMolding', new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.0
    }));
  }

  /**
   * Generate 3D model from floor plan data
   */
  async generate3DModel(
    rooms: Room[],
    walls: Wall[],
    doors: Door[],
    windows: Window[],
    options: Model3DOptions = {}
  ): Promise<Generated3DModel> {
    const opts = { ...this.defaultOptions, ...options };
    
    // Apply custom materials if provided
    if (opts.materials) {
      this.applyCustomMaterials(opts.materials);
    }

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Create groups
    const roomGroups = new Map<string, THREE.Group>();
    const wallGroup = new THREE.Group();
    wallGroup.name = 'walls';
    const openingGroup = new THREE.Group();
    openingGroup.name = 'openings';

    // Collections for meshes
    const meshes = {
      walls: [] as THREE.Mesh[],
      floors: [] as THREE.Mesh[],
      ceilings: [] as THREE.Mesh[],
      doors: [] as THREE.Mesh[],
      windows: [] as THREE.Mesh[],
      extras: [] as THREE.Mesh[]
    };

    // Process each room
    for (const room of rooms) {
      const roomGroup = await this.generateRoom3D(room, opts);
      roomGroups.set(room.id, roomGroup);
      scene.add(roomGroup);

      // Collect meshes
      roomGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.name.includes('floor')) {
            meshes.floors.push(child);
          } else if (child.name.includes('ceiling')) {
            meshes.ceilings.push(child);
          } else if (child.name.includes('wall')) {
            meshes.walls.push(child);
          }
        }
      });
    }

    // Process walls (shared walls between rooms)
    const wallMeshes = await this.generateWalls3D(walls, doors, windows, opts);
    wallMeshes.forEach(mesh => {
      wallGroup.add(mesh);
      meshes.walls.push(mesh);
    });
    scene.add(wallGroup);

    // Process doors
    const doorMeshes = await this.generateDoors3D(doors, opts);
    doorMeshes.forEach(mesh => {
      openingGroup.add(mesh);
      meshes.doors.push(mesh);
    });

    // Process windows
    const windowMeshes = await this.generateWindows3D(windows, opts);
    windowMeshes.forEach(mesh => {
      openingGroup.add(mesh);
      meshes.windows.push(mesh);
    });
    scene.add(openingGroup);

    // Add lighting if requested
    let lights: THREE.Light[] = [];
    if (opts.generateLighting) {
      lights = this.generateLighting(scene, rooms);
    }

    // Optimize meshes if requested
    if (opts.optimizeMesh) {
      this.optimizeMeshes(meshes);
    }

    // Calculate metadata
    const metadata = this.calculateMetadata(scene, meshes);

    return {
      scene,
      meshes,
      groups: {
        rooms: roomGroups,
        walls: wallGroup,
        openings: openingGroup
      },
      metadata,
      materials: this.materials,
      lights
    };
  }

  /**
   * Generate 3D geometry for a room
   */
  private async generateRoom3D(room: Room, options: Model3DOptions): Promise<THREE.Group> {
    const group = new THREE.Group();
    group.name = `room_${room.id}`;

    if (!room.polygon || (room.polygon as any).length < 3) {
      return group;
    }

    // Convert 2D polygon to 3D
    const vertices3D = this.convertPolygonTo3D(room.polygon as any, options);

    // Generate floor
    const floor = this.generateFloor(vertices3D, options);
    floor.name = `floor_${room.id}`;
    group.add(floor);

    // Generate ceiling
    const ceiling = this.generateCeiling(vertices3D, options);
    ceiling.name = `ceiling_${room.id}`;
    group.add(ceiling);

    // Generate room walls (if not handled globally)
    if ((room as any).walls) {
      for (const wall of (room as any).walls) {
        const wallMesh = this.generateWallMesh(
          this.convertPointTo3D((wall as any).start || { x: 0, y: 0 }, options),
          this.convertPointTo3D((wall as any).end || { x: 0, y: 0 }, options),
          options.wallHeight!,
          options.wallThickness!,
          wall.hasDoor,
          wall.hasWindow
        );
        wallMesh.name = `wall_${wall.id}`;
        group.add(wallMesh);
      }
    }

    // Add room-specific features based on type
    const features = this.generateRoomFeatures(room, options);
    features.forEach(feature => group.add(feature));

    return group;
  }

  /**
   * Generate walls with openings
   */
  private async generateWalls3D(
    walls: Wall[],
    doors: Door[],
    windows: Window[],
    options: Model3DOptions
  ): Promise<THREE.Mesh[]> {
    const wallMeshes: THREE.Mesh[] = [];

    for (const wall of walls) {
      // Convert to 3D coordinates
      const start3D = this.convertPointTo3D((wall as any).start || { x: 0, y: 0 }, options);
      const end3D = this.convertPointTo3D((wall as any).end || { x: 0, y: 0 }, options);

      // Find openings on this wall
      const wallOpenings = this.findOpeningsOnWall(wall, doors, windows, options);

      // Generate wall with openings
      let wallMesh: THREE.Mesh;
      
      if (wallOpenings.length > 0) {
        wallMesh = this.generateWallWithOpenings(
          start3D,
          end3D,
          options.wallHeight!,
          options.wallThickness!,
          wallOpenings
        );
      } else {
        wallMesh = this.generateWallMesh(
          start3D,
          end3D,
          options.wallHeight!,
          options.wallThickness!,
          false,
          false
        );
      }

      wallMesh.name = `wall_${wall.id}`;
      wallMeshes.push(wallMesh);
    }

    return wallMeshes;
  }

  /**
   * Generate a wall mesh
   */
  private generateWallMesh(
    start: THREE.Vector3,
    end: THREE.Vector3,
    height: number,
    thickness: number,
    hasDoor: boolean,
    hasWindow: boolean
  ): THREE.Mesh {
    // Calculate wall direction and normal
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x);
    const length = start.distanceTo(end);

    // Create wall geometry
    const geometry = new THREE.BoxGeometry(length, height, thickness);
    
    // Position wall
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    center.y = height / 2;

    const mesh = new THREE.Mesh(geometry, this.materials.get('wall'));
    mesh.position.copy(center);
    
    // Rotate to align with wall direction
    const angle = Math.atan2(direction.z, direction.x);
    mesh.rotation.y = -angle;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Generate wall with openings (doors/windows)
   */
  private generateWallWithOpenings(
    start: THREE.Vector3,
    end: THREE.Vector3,
    height: number,
    thickness: number,
    openings: Array<{
      type: 'door' | 'window';
      position: THREE.Vector3;
      width: number;
      height: number;
    }>
  ): THREE.Mesh {
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const length = start.distanceTo(end);

    // Create wall shape with holes for openings
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, height);
    shape.lineTo(0, height);
    shape.closePath();

    // Add holes for openings
    for (const opening of openings) {
      const hole = new THREE.Path();
      const localPos = this.worldToLocalPosition(opening.position, start, direction);
      
      if (opening.type === 'door') {
        // Door hole (from floor)
        hole.moveTo(localPos - opening.width / 2, 0);
        hole.lineTo(localPos + opening.width / 2, 0);
        hole.lineTo(localPos + opening.width / 2, opening.height);
        hole.lineTo(localPos - opening.width / 2, opening.height);
        hole.closePath();
      } else {
        // Window hole (elevated)
        const sillHeight = 0.9; // Window sill height
        hole.moveTo(localPos - opening.width / 2, sillHeight);
        hole.lineTo(localPos + opening.width / 2, sillHeight);
        hole.lineTo(localPos + opening.width / 2, sillHeight + opening.height);
        hole.lineTo(localPos - opening.width / 2, sillHeight + opening.height);
        hole.closePath();
      }
      
      shape.holes.push(hole);
    }

    // Extrude to create wall
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: thickness,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const mesh = new THREE.Mesh(geometry, this.materials.get('wall'));

    // Position and rotate wall
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mesh.position.copy(start);
    
    const angle = Math.atan2(direction.z, direction.x);
    mesh.rotation.y = -angle;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Generate doors
   */
  private async generateDoors3D(doors: Door[], options: Model3DOptions): Promise<THREE.Mesh[]> {
    const doorMeshes: THREE.Mesh[] = [];

    for (const door of doors) {
      const position3D = this.convertPointTo3D(door.position, options);
      
      // Create door geometry
      const doorGeometry = new THREE.BoxGeometry(
        door.width * options.scale!,
        options.doorHeight!,
        0.05 // Door thickness
      );

      const doorMesh = new THREE.Mesh(doorGeometry, this.materials.get('door'));
      doorMesh.position.set(
        position3D.x,
        options.doorHeight! / 2,
        position3D.z
      );

      // Add door frame
      const frame = this.generateDoorFrame(door, options);
      doorMesh.add(frame);

      // Add door handle
      const handle = this.generateDoorHandle(door, options);
      doorMesh.add(handle);

      doorMesh.name = `door_${door.id}`;
      doorMesh.castShadow = true;
      doorMesh.receiveShadow = true;

      doorMeshes.push(doorMesh);
    }

    return doorMeshes;
  }

  /**
   * Generate windows
   */
  private async generateWindows3D(windows: Window[], options: Model3DOptions): Promise<THREE.Mesh[]> {
    const windowMeshes: THREE.Mesh[] = [];

    for (const window of windows) {
      const position3D = this.convertPointTo3D(window.position, options);
      
      // Create window glass
      const glassGeometry = new THREE.BoxGeometry(
        window.width * options.scale!,
        options.windowHeight!,
        0.01 // Glass thickness
      );

      const glassMesh = new THREE.Mesh(glassGeometry, this.materials.get('window'));
      glassMesh.position.set(
        position3D.x,
        options.windowSillHeight! + options.windowHeight! / 2,
        position3D.z
      );

      // Add window frame
      const frame = this.generateWindowFrame(window, options);
      glassMesh.add(frame);

      glassMesh.name = `window_${window.id}`;
      glassMesh.castShadow = true;
      glassMesh.receiveShadow = true;

      windowMeshes.push(glassMesh);
    }

    return windowMeshes;
  }

  /**
   * Generate floor mesh
   */
  private generateFloor(vertices: THREE.Vector3[], options: Model3DOptions): THREE.Mesh {
    const shape = new THREE.Shape();
    
    // Create shape from vertices
    vertices.forEach((vertex, index) => {
      if (index === 0) {
        shape.moveTo(vertex.x, vertex.z);
      } else {
        shape.lineTo(vertex.x, vertex.z);
      }
    });
    shape.closePath();

    // Extrude to create floor thickness
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: options.floorThickness!,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2); // Rotate to horizontal

    const mesh = new THREE.Mesh(geometry, this.materials.get('floor'));
    mesh.position.y = -options.floorThickness!;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Generate ceiling mesh
   */
  private generateCeiling(vertices: THREE.Vector3[], options: Model3DOptions): THREE.Mesh {
    const shape = new THREE.Shape();
    
    // Create shape from vertices
    vertices.forEach((vertex, index) => {
      if (index === 0) {
        shape.moveTo(vertex.x, vertex.z);
      } else {
        shape.lineTo(vertex.x, vertex.z);
      }
    });
    shape.closePath();

    // Extrude to create ceiling thickness
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: options.ceilingThickness!,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2); // Rotate to horizontal

    const mesh = new THREE.Mesh(geometry, this.materials.get('ceiling'));
    mesh.position.y = options.wallHeight!;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Generate room-specific features
   */
  private generateRoomFeatures(room: Room, options: Model3DOptions): THREE.Object3D[] {
    const features: THREE.Object3D[] = [];

    switch (room.type) {
      case RoomType.BATHROOM:
        features.push(...this.generateBathroomFixtures(room, options));
        break;
      
      case RoomType.KITCHEN:
        features.push(...this.generateKitchenFixtures(room, options));
        break;
      
      case RoomType.BEDROOM:
      case RoomType.MASTER_BEDROOM:
        features.push(...this.generateBedroomFurniture(room, options));
        break;
    }

    // Add baseboards
    if (options.baseboardHeight! > 0) {
      features.push(this.generateBaseboard(room, options));
    }

    // Add crown molding
    if (options.crownMoldingHeight! > 0) {
      features.push(this.generateCrownMolding(room, options));
    }

    return features;
  }

  /**
   * Generate bathroom fixtures
   */
  private generateBathroomFixtures(room: Room, options: Model3DOptions): THREE.Object3D[] {
    const fixtures: THREE.Object3D[] = [];

    // Simplified toilet
    const toiletGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.6);
    const toilet = new THREE.Mesh(toiletGeometry, this.materials.get('wall'));
    toilet.position.set(1, 0.2, 1);
    toilet.name = 'toilet';
    fixtures.push(toilet);

    // Simplified sink
    const sinkGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.4);
    const sink = new THREE.Mesh(sinkGeometry, this.materials.get('wall'));
    sink.position.set(2, 0.8, 0.5);
    sink.name = 'sink';
    fixtures.push(sink);

    return fixtures;
  }

  /**
   * Generate kitchen fixtures
   */
  private generateKitchenFixtures(room: Room, options: Model3DOptions): THREE.Object3D[] {
    const fixtures: THREE.Object3D[] = [];

    // Simplified counter
    const counterGeometry = new THREE.BoxGeometry(2, 0.05, 0.6);
    const counter = new THREE.Mesh(counterGeometry, this.materials.get('floor'));
    counter.position.set(1, 0.9, 0.3);
    counter.name = 'counter';
    fixtures.push(counter);

    // Simplified cabinets
    const cabinetGeometry = new THREE.BoxGeometry(2, 0.8, 0.6);
    const cabinet = new THREE.Mesh(cabinetGeometry, this.materials.get('door'));
    cabinet.position.set(1, 0.4, 0.3);
    cabinet.name = 'cabinet';
    fixtures.push(cabinet);

    return fixtures;
  }

  /**
   * Generate bedroom furniture
   */
  private generateBedroomFurniture(room: Room, options: Model3DOptions): THREE.Object3D[] {
    const furniture: THREE.Object3D[] = [];

    // Simplified bed
    const bedGeometry = new THREE.BoxGeometry(1.5, 0.3, 2);
    const bed = new THREE.Mesh(bedGeometry, this.materials.get('floor'));
    
    // Position bed in center of room if possible
    if (room.polygon && (room.polygon as any).length > 0) {
      const center = this.calculatePolygonCenter(room.polygon as any);
      const center3D = this.convertPointTo3D(center, options);
      bed.position.set(center3D.x, 0.15, center3D.z);
    } else {
      bed.position.set(2, 0.15, 2);
    }
    
    bed.name = 'bed';
    furniture.push(bed);

    return furniture;
  }

  /**
   * Generate baseboard
   */
  private generateBaseboard(room: Room, options: Model3DOptions): THREE.Group {
    const baseboardGroup = new THREE.Group();
    baseboardGroup.name = 'baseboard';

    if (!room.polygon) return baseboardGroup;

    const height = options.baseboardHeight!;
    const thickness = 0.01;

    for (let i = 0; i < (room.polygon as any).length; i++) {
      const j = (i + 1) % (room.polygon as any).length;
      const start = this.convertPointTo3D((room.polygon as any)[i], options);
      const end = this.convertPointTo3D((room.polygon as any)[j], options);
      
      const length = start.distanceTo(end);
      const geometry = new THREE.BoxGeometry(length, height, thickness);
      
      const mesh = new THREE.Mesh(geometry, this.materials.get('baseboard'));
      
      const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      center.y = height / 2;
      mesh.position.copy(center);
      
      const direction = new THREE.Vector3().subVectors(end, start).normalize();
      const angle = Math.atan2(direction.z, direction.x);
      mesh.rotation.y = -angle;
      
      baseboardGroup.add(mesh);
    }

    return baseboardGroup;
  }

  /**
   * Generate crown molding
   */
  private generateCrownMolding(room: Room, options: Model3DOptions): THREE.Group {
    const moldingGroup = new THREE.Group();
    moldingGroup.name = 'crownMolding';

    if (!room.polygon) return moldingGroup;

    const height = options.crownMoldingHeight!;
    const thickness = 0.01;
    const wallHeight = options.wallHeight!;

    for (let i = 0; i < (room.polygon as any).length; i++) {
      const j = (i + 1) % (room.polygon as any).length;
      const start = this.convertPointTo3D((room.polygon as any)[i], options);
      const end = this.convertPointTo3D((room.polygon as any)[j], options);
      
      const length = start.distanceTo(end);
      const geometry = new THREE.BoxGeometry(length, height, thickness);
      
      const mesh = new THREE.Mesh(geometry, this.materials.get('crownMolding'));
      
      const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      center.y = wallHeight - height / 2;
      mesh.position.copy(center);
      
      const direction = new THREE.Vector3().subVectors(end, start).normalize();
      const angle = Math.atan2(direction.z, direction.x);
      mesh.rotation.y = -angle;
      
      moldingGroup.add(mesh);
    }

    return moldingGroup;
  }

  /**
   * Generate door frame
   */
  private generateDoorFrame(door: Door, options: Model3DOptions): THREE.Group {
    const frameGroup = new THREE.Group();
    frameGroup.name = 'doorFrame';

    const frameWidth = 0.1;
    const frameDepth = 0.02;

    // Top frame
    const topGeometry = new THREE.BoxGeometry(door.width + frameWidth * 2, frameWidth, frameDepth);
    const topFrame = new THREE.Mesh(topGeometry, this.materials.get('door'));
    topFrame.position.y = options.doorHeight! / 2 + frameWidth / 2;
    frameGroup.add(topFrame);

    // Side frames
    const sideGeometry = new THREE.BoxGeometry(frameWidth, options.doorHeight! + frameWidth, frameDepth);
    
    const leftFrame = new THREE.Mesh(sideGeometry, this.materials.get('door'));
    leftFrame.position.x = -(door.width / 2 + frameWidth / 2);
    frameGroup.add(leftFrame);

    const rightFrame = new THREE.Mesh(sideGeometry, this.materials.get('door'));
    rightFrame.position.x = door.width / 2 + frameWidth / 2;
    frameGroup.add(rightFrame);

    return frameGroup;
  }

  /**
   * Generate door handle
   */
  private generateDoorHandle(door: Door, options: Model3DOptions): THREE.Group {
    const handleGroup = new THREE.Group();
    handleGroup.name = 'doorHandle';

    const handleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.1);
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2
    });

    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(door.width / 2 - 0.1, 0, 0.03);
    
    handleGroup.add(handle);

    return handleGroup;
  }

  /**
   * Generate window frame
   */
  private generateWindowFrame(window: Window, options: Model3DOptions): THREE.Group {
    const frameGroup = new THREE.Group();
    frameGroup.name = 'windowFrame';

    const frameWidth = 0.05;
    const frameDepth = 0.02;

    // Create frame pieces
    const material = this.materials.get('wall');

    // Top and bottom frames
    const horizontalGeometry = new THREE.BoxGeometry(window.width + frameWidth * 2, frameWidth, frameDepth);
    
    const topFrame = new THREE.Mesh(horizontalGeometry, material);
    topFrame.position.y = options.windowHeight! / 2 + frameWidth / 2;
    frameGroup.add(topFrame);

    const bottomFrame = new THREE.Mesh(horizontalGeometry, material);
    bottomFrame.position.y = -(options.windowHeight! / 2 + frameWidth / 2);
    frameGroup.add(bottomFrame);

    // Side frames
    const verticalGeometry = new THREE.BoxGeometry(frameWidth, options.windowHeight! + frameWidth * 2, frameDepth);
    
    const leftFrame = new THREE.Mesh(verticalGeometry, material);
    leftFrame.position.x = -(window.width / 2 + frameWidth / 2);
    frameGroup.add(leftFrame);

    const rightFrame = new THREE.Mesh(verticalGeometry, material);
    rightFrame.position.x = window.width / 2 + frameWidth / 2;
    frameGroup.add(rightFrame);

    // Add mullions for multi-pane window
    if ((window.type as any) === 'double-hung' || window.type === 'sliding') {
      const mullionGeometry = new THREE.BoxGeometry(frameWidth / 2, options.windowHeight!, frameDepth);
      const mullion = new THREE.Mesh(mullionGeometry, material);
      frameGroup.add(mullion);
    }

    return frameGroup;
  }

  /**
   * Generate lighting for the scene
   */
  private generateLighting(scene: THREE.Scene, rooms: Room[]): THREE.Light[] {
    const lights: THREE.Light[] = [];

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    lights.push(ambientLight);

    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    lights.push(directionalLight);

    // Add point lights for each room
    for (const room of rooms) {
      if (room.polygon && (room.polygon as any).length > 0) {
        const center = this.calculatePolygonCenter(room.polygon as any);
        const pointLight = new THREE.PointLight(0xffffff, 0.3, 10);
        pointLight.position.set(center.x, 2, center.y);
        scene.add(pointLight);
        lights.push(pointLight);
      }
    }

    return lights;
  }

  /**
   * Helper methods
   */

  private convertPolygonTo3D(polygon: Point2D[], options: Model3DOptions): THREE.Vector3[] {
    return polygon.map(point => this.convertPointTo3D(point, options));
  }

  private convertPointTo3D(point: Point2D, options: Model3DOptions): THREE.Vector3 {
    return new THREE.Vector3(
      (point.x - options.origin!.x) * options.scale!,
      0,
      (point.y - options.origin!.y) * options.scale!
    );
  }

  private calculatePolygonCenter(polygon: Point2D[]): Point2D {
    const sum = polygon.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / (polygon as any).length,
      y: sum.y / (polygon as any).length
    };
  }

  private findOpeningsOnWall(
    wall: Wall,
    doors: Door[],
    windows: Window[],
    options: Model3DOptions
  ): Array<{
    type: 'door' | 'window';
    position: THREE.Vector3;
    width: number;
    height: number;
  }> {
    const openings: Array<{
      type: 'door' | 'window';
      position: THREE.Vector3;
      width: number;
      height: number;
    }> = [];

    // Check doors
    for (const door of doors) {
      if (this.isPointOnWall(door.position, wall)) {
        openings.push({
          type: 'door',
          position: this.convertPointTo3D(door.position, options),
          width: door.width * options.scale!,
          height: options.doorHeight!
        });
      }
    }

    // Check windows
    for (const window of windows) {
      if (this.isPointOnWall(window.position, wall)) {
        openings.push({
          type: 'window',
          position: this.convertPointTo3D(window.position, options),
          width: window.width * options.scale!,
          height: options.windowHeight!
        });
      }
    }

    return openings;
  }

  private isPointOnWall(point: Point2D, wall: Wall): boolean {
    const tolerance = 0.5; // 50cm tolerance
    const distance = this.pointToLineDistance(point, (wall as any).start || { x: 0, y: 0 }, (wall as any).end || { x: 0, y: 0 });
    return distance < tolerance;
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

  private worldToLocalPosition(
    worldPos: THREE.Vector3,
    wallStart: THREE.Vector3,
    wallDirection: THREE.Vector3
  ): number {
    const toPoint = new THREE.Vector3().subVectors(worldPos, wallStart);
    return toPoint.dot(wallDirection);
  }

  private applyCustomMaterials(materials: MaterialOptions): void {
    if (materials.wall) {
      this.materials.set('wall', new THREE.MeshStandardMaterial(materials.wall));
    }
    if (materials.floor) {
      this.materials.set('floor', new THREE.MeshStandardMaterial(materials.floor));
    }
    if (materials.ceiling) {
      this.materials.set('ceiling', new THREE.MeshStandardMaterial(materials.ceiling));
    }
    if (materials.door) {
      this.materials.set('door', new THREE.MeshStandardMaterial(materials.door));
    }
    if (materials.window) {
      this.materials.set('window', new THREE.MeshStandardMaterial(materials.window));
    }
  }

  private optimizeMeshes(meshes: any): void {
    // Merge geometries where possible
    const geometriesToMerge: THREE.BufferGeometry[] = [];
    
    // Merge static meshes with same material
    for (const category of Object.values(meshes)) {
      if (Array.isArray(category)) {
        for (const mesh of category) {
          if (mesh instanceof THREE.Mesh) {
            // Optimize geometry
            mesh.geometry.computeBoundingBox();
            mesh.geometry.computeBoundingSphere();
          }
        }
      }
    }
  }

  private calculateMetadata(scene: THREE.Scene, meshes: any): any {
    const bounds = new THREE.Box3().setFromObject(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const dimensions = bounds.getSize(new THREE.Vector3());

    let triangleCount = 0;
    let vertexCount = 0;

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry;
        if (geometry.index) {
          triangleCount += geometry.index.count / 3;
        }
        vertexCount += geometry.attributes.position.count;
      }
    });

    return {
      bounds,
      center,
      dimensions,
      roomCount: meshes.floors.length,
      wallCount: meshes.walls.length,
      doorCount: meshes.doors.length,
      windowCount: meshes.windows.length,
      triangleCount,
      vertexCount
    };
  }
}

// Export singleton instance
export const model3DGenerator = new Model3DGenerator();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { model3DGenerator } from './services/3d/model-3d-generator';

// Generate 3D model from floor plan
const model3D = await model3DGenerator.generate3DModel(
  rooms,
  walls,
  doors,
  windows,
  {
    wallHeight: 2.7, // 9 feet
    wallThickness: 0.2, // 20cm
    scale: 0.01, // Convert from pixels to meters
    generateLighting: true,
    materials: {
      wall: { color: 0xeeeeee, roughness: 0.8 },
      floor: { color: 0x8b7355, roughness: 0.6 }
    }
  }
);

// Access the Three.js scene
const scene = model3D.scene;

// Get metadata
console.log(`Generated 3D model with:`);
console.log(`  Rooms: ${model3D.metadata.roomCount}`);
console.log(`  Walls: ${model3D.metadata.wallCount}`);
console.log(`  Triangles: ${model3D.metadata.triangleCount}`);
console.log(`  Vertices: ${model3D.metadata.vertexCount}`);

// Access specific meshes
const wallMeshes = model3D.meshes.walls;
const floorMeshes = model3D.meshes.floors;

// Access room groups
const livingRoom = model3D.groups.rooms.get('room_living');
*/