/**
 * Floor Plan Type Definitions
 * Comprehensive types for floor plan upload, processing, and management
 */

import { Room } from './room.types';
import { ProcessingJob } from './processing.types';

// Re-export Room for external use
export { Room } from './room.types';

// Point2D type definition
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Supported file formats for floor plan uploads
 */
export enum FloorPlanFormat {
  PDF = 'pdf',
  PNG = 'png',
  JPG = 'jpg',
  JPEG = 'jpeg',
  DWG = 'dwg',
  DXF = 'dxf',
  SVG = 'svg',
  BMP = 'bmp',
  TIFF = 'tiff'
}

/**
 * Processing status for floor plans
 */
export enum ProcessingStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PREPROCESSING = 'preprocessing',
  ANALYZING = 'analyzing',
  EXTRACTING_ROOMS = 'extracting_rooms',
  MEASURING = 'measuring',
  VALIDATING = 'validating',
  GENERATING_3D = 'generating_3d',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived'
}

/**
 * Floor plan upload metadata
 */
export interface FloorPlanUpload {
  id: string;
  projectId: string;
  userId: string;
  originalFileName: string;
  fileFormat: FloorPlanFormat;
  fileSizeBytes: number;
  fileUrl: string;
  thumbnailUrl?: string;
  mimeType: string;
  uploadedAt: Date;
  metadata?: FloorPlanMetadata;
  tags?: string[];
  checksum?: string;
  source?: UploadSource;
}

/**
 * Upload source information
 */
export interface UploadSource {
  type: 'web' | 'api' | 'mobile' | 'scanner' | 'integration';
  userAgent?: string;
  ipAddress?: string;
  integrationName?: string;
}

/**
 * Floor plan metadata
 */
export interface FloorPlanMetadata {
  title?: string;
  description?: string;
  floorNumber?: number;
  buildingName?: string;
  architect?: string;
  drawingDate?: Date;
  scale?: string;
  units?: 'metric' | 'imperial';
  northDirection?: number; // Degrees from top
  customFields?: Record<string, any>;
}

/**
 * Processed floor plan with extracted data
 */
export interface ProcessedFloorPlan {
  id: string;
  uploadId: string;
  projectId: string;
  status: ProcessingStatus;
  version: number;
  
  // Processing information
  processingJob?: ProcessingJob;
  processedAt?: Date;
  processingDurationMs?: number;
  
  // Extracted data
  rooms: Room[];
  dimensions: FloorPlanDimensions;
  features: ExtractedFeatures;
  
  // Analysis results
  analysis: FloorPlanAnalysis;
  
  // Generated outputs
  outputs: ProcessingOutputs;
  
  // Quality metrics
  quality: QualityMetrics;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
}

/**
 * Overall floor plan dimensions
 */
export interface FloorPlanDimensions {
  width: number;
  height: number;
  depth?: number;
  totalArea: number;
  livingArea: number;
  perimeter: number;
  units: 'metric' | 'imperial';
  boundingBox: BoundingBox;
}

/**
 * Bounding box definition
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

/**
 * Extracted architectural features
 */
export interface ExtractedFeatures {
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  stairs?: Stair[];
  fixtures?: Fixture[];
  annotations?: Annotation[];
  electricalOutlets?: ElectricalOutlet[];
  plumbingFixtures?: PlumbingFixture[];
}

/**
 * Wall definition
 */
export interface Wall {
  id: string;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  thickness: number;
  height?: number;
  type: 'exterior' | 'interior' | 'partition';
  material?: string;
  loadBearing?: boolean;
}

/**
 * Door definition
 */
export interface Door {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  orientation: number; // Degrees
  type: 'single' | 'double' | 'sliding' | 'folding' | 'garage';
  swingDirection?: 'left' | 'right' | 'both';
  connectedRooms?: string[];
}

/**
 * Window definition
 */
export interface Window {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  sillHeight?: number;
  type: 'fixed' | 'sliding' | 'casement' | 'awning' | 'hopper';
  glazing?: 'single' | 'double' | 'triple';
}

/**
 * Stair definition
 */
export interface Stair {
  id: string;
  position: { x: number; y: number };
  type: 'straight' | 'L-shaped' | 'U-shaped' | 'spiral' | 'curved';
  numberOfSteps?: number;
  direction: 'up' | 'down' | 'both';
  width: number;
}

/**
 * Fixture definition
 */
export interface Fixture {
  id: string;
  type: string;
  position: { x: number; y: number };
  dimensions?: { width: number; height: number };
  roomId?: string;
  category?: 'kitchen' | 'bathroom' | 'electrical' | 'hvac' | 'other';
}

/**
 * Annotation on floor plan
 */
export interface Annotation {
  id: string;
  text: string;
  position: { x: number; y: number };
  fontSize?: number;
  category?: 'dimension' | 'label' | 'note' | 'title';
  associatedElement?: string;
}

/**
 * Electrical outlet
 */
export interface ElectricalOutlet {
  id: string;
  position: { x: number; y: number };
  type: 'standard' | '240v' | 'usb' | 'gfci';
  roomId?: string;
}

/**
 * Plumbing fixture
 */
export interface PlumbingFixture {
  id: string;
  position: { x: number; y: number };
  type: 'sink' | 'toilet' | 'shower' | 'bathtub' | 'water_heater';
  roomId?: string;
}

/**
 * Floor plan entity for database storage
 */
export interface FloorPlan {
  id?: string;
  originalUrl?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  status?: ProcessingStatus | 'uploaded' | 'processing' | 'completed' | 'failed' | 'cancelled';
  uploadedAt?: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  metadata?: any;
}

/**
 * Processing result
 */
export interface ProcessingResult {
  rooms?: Room[];
  walls?: Wall[];
  doors?: Door[];
  windows?: Window[];
  fixtures?: Fixture[];
  dimensions?: any;
  area?: number;
  scale?: number;
  confidence?: {
    overall: number;
    rooms?: number;
    walls?: number;
    doors?: number;
    windows?: number;
  };
}

/**
 * Processing options
 */
export interface ProcessingOptions {
  enableOCR?: boolean;
  enableObjectDetection?: boolean;
  enableAI?: boolean;
  enableGeometry?: boolean;
  enable3D?: boolean;
  outputFormats?: string[];
  language?: string;
  units?: 'imperial' | 'metric';
  scale?: number;
  confidence?: {
    min?: number;
    required?: number;
  };
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Floor plan analysis results
 */
export interface FloorPlanAnalysis {
  spaceEfficiency: number; // Percentage
  naturalLightScore: number; // 0-100
  flowScore: number; // 0-100
  privacyScore: number; // 0-100
  
  roomProportions: {
    balanced: boolean;
    issues: string[];
    recommendations: string[];
  };
  
  accessibility: {
    wheelchairAccessible: boolean;
    doorWidthsAdequate: boolean;
    pathwaysAdequate: boolean;
    issues: string[];
  };
  
  buildingCode: {
    compliant: boolean;
    violations: CodeViolation[];
    warnings: string[];
  };
  
  energyEfficiency: {
    estimatedRating: string;
    recommendations: string[];
  };
}

/**
 * Building code violation
 */
export interface CodeViolation {
  code: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  location?: { x: number; y: number };
  suggestedFix?: string;
}

/**
 * Processing outputs
 */
export interface ProcessingOutputs {
  floorPlan2D?: {
    url: string;
    format: string;
    resolution: { width: number; height: number };
  };
  
  floorPlan3D?: {
    url: string;
    format: '3d-model' | 'interactive-view';
    modelFormat?: 'gltf' | 'obj' | 'fbx';
  };
  
  measurements?: {
    url: string;
    format: 'pdf' | 'csv' | 'json';
  };
  
  report?: {
    url: string;
    format: 'pdf' | 'html';
    generatedAt: Date;
  };
  
  thumbnail?: {
    url: string;
    width: number;
    height: number;
  };
}

/**
 * Quality metrics for processed floor plan
 */
export interface QualityMetrics {
  overallScore: number; // 0-100
  confidence: number; // 0-1
  
  accuracy: {
    roomDetection: number;
    wallDetection: number;
    measurementAccuracy: number;
    featureDetection: number;
  };
  
  completeness: {
    missingRooms: number;
    missingDoors: number;
    missingWindows: number;
    unprocessedAreas: number;
  };
  
  warnings: QualityWarning[];
  requiresManualReview: boolean;
  reviewNotes?: string[];
}

/**
 * Quality warning
 */
export interface QualityWarning {
  type: 'low_confidence' | 'ambiguous_boundary' | 'missing_data' | 'scale_issue';
  message: string;
  location?: { x: number; y: number };
  severity: 'high' | 'medium' | 'low';
}

/**
 * Floor plan comparison result
 */
export interface FloorPlanComparison {
  id: string;
  baseFloorPlanId: string;
  comparedFloorPlanId: string;
  
  differences: {
    structural: StructuralDifference[];
    dimensional: DimensionalDifference[];
    features: FeatureDifference[];
  };
  
  similarity: {
    overall: number; // 0-100
    layout: number;
    dimensions: number;
    features: number;
  };
  
  timestamp: Date;
}

/**
 * Structural difference between floor plans
 */
export interface StructuralDifference {
  type: 'wall_added' | 'wall_removed' | 'wall_modified' | 'room_added' | 'room_removed';
  description: string;
  location?: { x: number; y: number };
  severity: 'major' | 'minor';
}

/**
 * Dimensional difference
 */
export interface DimensionalDifference {
  element: string;
  originalValue: number;
  newValue: number;
  difference: number;
  percentageChange: number;
}

/**
 * Feature difference
 */
export interface FeatureDifference {
  type: 'added' | 'removed' | 'modified';
  featureType: string;
  description: string;
  location?: { x: number; y: number };
}

/**
 * Floor plan revision history
 */
export interface FloorPlanRevision {
  id: string;
  floorPlanId: string;
  version: number;
  changes: string[];
  changedBy: string;
  changeReason?: string;
  timestamp: Date;
  snapshot?: ProcessedFloorPlan;
}

/**
 * Export options for floor plans
 */
export interface FloorPlanExportOptions {
  format: 'pdf' | 'dwg' | 'dxf' | 'svg' | 'png' | 'jpg';
  scale?: number;
  resolution?: number;
  includeAnnotations?: boolean;
  includeMeasurements?: boolean;
  include3D?: boolean;
  layers?: string[];
  colorScheme?: 'color' | 'grayscale' | 'blueprint';
}