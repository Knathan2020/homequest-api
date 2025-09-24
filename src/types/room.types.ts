/**
 * Room Type Definitions
 * Comprehensive types for room detection, classification, and geometry
 */

/**
 * Standard room types in residential and commercial buildings
 */
export enum RoomType {
  // Living spaces
  LIVING_ROOM = 'living_room',
  FAMILY_ROOM = 'family_room',
  GREAT_ROOM = 'great_room',
  DEN = 'den',
  STUDY = 'study',
  LIBRARY = 'library',
  OFFICE = 'office',
  SUNROOM = 'sunroom',
  
  // Bedrooms
  MASTER_BEDROOM = 'master_bedroom',
  BEDROOM = 'bedroom',
  GUEST_ROOM = 'guest_room',
  NURSERY = 'nursery',
  
  // Kitchens and Dining
  KITCHEN = 'kitchen',
  DINING_ROOM = 'dining_room',
  BREAKFAST_NOOK = 'breakfast_nook',
  PANTRY = 'pantry',
  BUTLER_PANTRY = 'butler_pantry',
  
  // Bathrooms
  MASTER_BATHROOM = 'master_bathroom',
  BATHROOM = 'bathroom',
  HALF_BATH = 'half_bath',
  POWDER_ROOM = 'powder_room',
  
  // Utility spaces
  LAUNDRY_ROOM = 'laundry_room',
  UTILITY_ROOM = 'utility_room',
  MUDROOM = 'mudroom',
  STORAGE = 'storage',
  CLOSET = 'closet',
  WALK_IN_CLOSET = 'walk_in_closet',
  MECHANICAL_ROOM = 'mechanical_room',
  
  // Circulation
  HALLWAY = 'hallway',
  CORRIDOR = 'corridor',
  FOYER = 'foyer',
  ENTRYWAY = 'entryway',
  VESTIBULE = 'vestibule',
  STAIRWAY = 'stairway',
  LANDING = 'landing',
  
  // Garage and Exterior
  GARAGE = 'garage',
  CARPORT = 'carport',
  WORKSHOP = 'workshop',
  SHED = 'shed',
  
  // Outdoor
  BALCONY = 'balcony',
  PATIO = 'patio',
  DECK = 'deck',
  PORCH = 'porch',
  TERRACE = 'terrace',
  
  // Specialized
  GYM = 'gym',
  HOME_THEATER = 'home_theater',
  GAME_ROOM = 'game_room',
  BAR = 'bar',
  WINE_CELLAR = 'wine_cellar',
  SAUNA = 'sauna',
  POOL_HOUSE = 'pool_house',
  
  // Commercial
  CONFERENCE_ROOM = 'conference_room',
  RECEPTION = 'reception',
  LOBBY = 'lobby',
  BREAK_ROOM = 'break_room',
  SERVER_ROOM = 'server_room',
  
  // Basement/Attic
  BASEMENT = 'basement',
  ATTIC = 'attic',
  CRAWL_SPACE = 'crawl_space',
  
  // Other
  UNIDENTIFIED = 'unidentified',
  MIXED_USE = 'mixed_use',
  OPEN_SPACE = 'open_space'
}

/**
 * 2D Coordinates
 */
export interface Coordinates {
  x: number;
  y: number;
}

/**
 * 3D Coordinates
 */
export interface Coordinates3D extends Coordinates {
  z: number;
}

/**
 * Polygon definition for room boundaries
 */
export interface Polygon {
  vertices: Coordinates[];
  holes?: Coordinates[][]; // For rooms with internal voids
  isClosed: boolean;
  isClockwise: boolean;
}

/**
 * Enhanced polygon with additional geometric properties
 */
export interface EnhancedPolygon extends Polygon {
  area: number;
  perimeter: number;
  centroid: Coordinates;
  boundingBox: {
    min: Coordinates;
    max: Coordinates;
    width: number;
    height: number;
  };
  convexHull?: Coordinates[];
  isConvex: boolean;
  isSimple: boolean; // No self-intersections
}

/**
 * Dimension measurement
 */
export interface Dimension {
  value: number;
  unit: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  precision: number; // Decimal places
  confidence: number; // 0-1
  measured: boolean; // True if measured, false if estimated
}

/**
 * Extended dimension with direction
 */
export interface DirectionalDimension extends Dimension {
  direction: 'width' | 'height' | 'depth' | 'diagonal';
  startPoint: Coordinates;
  endPoint: Coordinates;
}

/**
 * Room dimensions
 */
export interface RoomDimensions {
  width: Dimension;
  height: Dimension;
  depth?: Dimension; // For 3D representations
  ceilingHeight?: Dimension;
  area: Dimension;
  perimeter: Dimension;
  volume?: Dimension;
  diagonals?: DirectionalDimension[];
}

/**
 * Complete room definition
 */
export interface Room {
  id: string;
  floorPlanId: string;
  
  // Classification
  type: RoomType;
  subType?: string;
  customType?: string;
  confidence: number; // Classification confidence 0-1
  
  // Naming
  name: string;
  displayName?: string;
  number?: string; // e.g., "101", "2A"
  
  // Geometry
  polygon: EnhancedPolygon;
  dimensions: RoomDimensions;
  shape: RoomShape;
  
  // Position
  floor: number;
  zone?: string; // e.g., "private", "public", "service"
  wing?: string; // e.g., "east", "west"
  
  // Connections
  adjacentRooms: string[]; // IDs of adjacent rooms
  connectedRooms: ConnectedRoom[]; // Rooms connected by doors
  openings: Opening[];
  
  // Features
  features: RoomFeatures;
  
  // Properties
  properties: RoomProperties;
  
  // Validation
  validation: RoomValidation;
  
  // Metadata
  metadata?: Record<string, any>;
  tags?: string[];
  notes?: string;
  
  // Timestamps
  detectedAt: Date;
  modifiedAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
}

/**
 * Room shape classification
 */
export interface RoomShape {
  type: 'rectangular' | 'L-shaped' | 'T-shaped' | 'irregular' | 'circular' | 'polygonal';
  regularity: number; // 0-1, how regular the shape is
  aspectRatio?: number; // Width/height ratio
  complexity: 'simple' | 'moderate' | 'complex';
}

/**
 * Connected room information
 */
export interface ConnectedRoom {
  roomId: string;
  connectionType: 'door' | 'opening' | 'archway' | 'stairs';
  doorId?: string;
  accessibility: 'full' | 'partial' | 'restricted';
}

/**
 * Opening in room (door, window, archway)
 */
export interface Opening {
  id: string;
  type: 'door' | 'window' | 'archway' | 'opening';
  position: WallPosition;
  dimensions: {
    width: Dimension;
    height: Dimension;
  };
  connectedTo?: string; // Room ID or 'exterior'
}

/**
 * Position on wall
 */
export interface WallPosition {
  wall: 'north' | 'south' | 'east' | 'west' | string;
  offset: number; // Distance from wall start
  percentage: number; // Position as percentage of wall length
  coordinates: Coordinates;
}

/**
 * Room features
 */
export interface RoomFeatures {
  windows: WindowFeature[];
  doors: DoorFeature[];
  fixtures: FixtureFeature[];
  builtIns: BuiltInFeature[];
  flooring?: FlooringType;
  ceiling?: CeilingType;
  lighting?: LightingFeature[];
  hvac?: HVACFeature[];
  electrical?: ElectricalFeature[];
  plumbing?: PlumbingFeature[];
}

/**
 * Window feature
 */
export interface WindowFeature {
  id: string;
  position: WallPosition;
  dimensions: { width: Dimension; height: Dimension };
  type: 'single' | 'double' | 'bay' | 'bow' | 'skylight';
  operability: 'fixed' | 'operable';
}

/**
 * Door feature
 */
export interface DoorFeature {
  id: string;
  position: WallPosition;
  dimensions: { width: Dimension; height: Dimension };
  type: 'single' | 'double' | 'sliding' | 'pocket' | 'barn' | 'french';
  swingDirection?: 'inward' | 'outward' | 'both';
  material?: string;
}

/**
 * Fixture feature
 */
export interface FixtureFeature {
  id: string;
  type: string;
  position: Coordinates;
  dimensions?: { width: number; height: number; depth?: number };
  category: 'kitchen' | 'bathroom' | 'lighting' | 'hvac' | 'other';
}

/**
 * Built-in feature
 */
export interface BuiltInFeature {
  id: string;
  type: 'closet' | 'shelving' | 'cabinet' | 'fireplace' | 'niche' | 'other';
  position: Coordinates;
  dimensions: { width: number; height: number; depth?: number };
}

/**
 * Flooring type
 */
export interface FlooringType {
  material: 'hardwood' | 'tile' | 'carpet' | 'vinyl' | 'concrete' | 'laminate' | 'other';
  pattern?: string;
  color?: string;
}

/**
 * Ceiling type
 */
export interface CeilingType {
  type: 'flat' | 'vaulted' | 'cathedral' | 'tray' | 'coffered' | 'beam';
  height: Dimension;
  material?: string;
}

/**
 * Lighting feature
 */
export interface LightingFeature {
  id: string;
  type: 'recessed' | 'pendant' | 'chandelier' | 'track' | 'sconce' | 'floor' | 'table';
  position: Coordinates;
  controlled: boolean;
}

/**
 * HVAC feature
 */
export interface HVACFeature {
  id: string;
  type: 'vent' | 'return' | 'radiator' | 'mini-split' | 'thermostat';
  position: Coordinates;
}

/**
 * Electrical feature
 */
export interface ElectricalFeature {
  id: string;
  type: 'outlet' | 'switch' | 'junction' | 'panel';
  position: Coordinates;
  voltage?: '110v' | '220v';
}

/**
 * Plumbing feature
 */
export interface PlumbingFeature {
  id: string;
  type: 'sink' | 'toilet' | 'shower' | 'bathtub' | 'drain' | 'water_line';
  position: Coordinates;
}

/**
 * Room properties
 */
export interface RoomProperties {
  isAccessible: boolean;
  hasNaturalLight: boolean;
  hasVentilation: boolean;
  isPrivate: boolean;
  occupancyLimit?: number;
  fireRating?: string;
  acousticRating?: string;
  energyEfficiency?: string;
  usage?: RoomUsage;
}

/**
 * Room usage information
 */
export interface RoomUsage {
  primary: string;
  secondary?: string[];
  frequency: 'constant' | 'frequent' | 'occasional' | 'rare';
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | 'all_day';
  capacity?: number;
}

/**
 * Room validation results
 */
export interface RoomValidation {
  isValid: boolean;
  hasMinimumSize: boolean;
  hasRequiredFeatures: boolean;
  meetsCodeRequirements: boolean;
  issues: ValidationIssue[];
  warnings: ValidationWarning[];
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: 'size' | 'safety' | 'accessibility' | 'code' | 'design';
  suggestedFix?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  code: string;
  message: string;
  impact: 'high' | 'medium' | 'low';
}

/**
 * Room comparison result
 */
export interface RoomComparison {
  similarity: number; // 0-1
  sizeDifference: number; // Percentage
  shapeSimilarity: number; // 0-1
  featureMatches: number;
  typeMatch: boolean;
}

/**
 * Room adjacency matrix
 */
export interface RoomAdjacencyMatrix {
  rooms: string[]; // Room IDs
  matrix: boolean[][]; // True if rooms are adjacent
  connections: RoomConnection[];
}

/**
 * Room connection
 */
export interface RoomConnection {
  room1Id: string;
  room2Id: string;
  connectionType: 'adjacent' | 'connected' | 'nearby';
  sharedWallLength?: number;
  doorConnection?: boolean;
}

/**
 * Room clustering result
 */
export interface RoomCluster {
  id: string;
  type: 'bedroom_cluster' | 'service_cluster' | 'living_cluster' | 'custom';
  rooms: string[];
  centroid: Coordinates;
  purpose?: string;
}

/**
 * Room statistics
 */
export interface RoomStatistics {
  totalRooms: number;
  byType: Record<RoomType, number>;
  averageSize: number;
  medianSize: number;
  totalArea: number;
  largestRoom: string;
  smallestRoom: string;
  mostCommonType: RoomType;
}