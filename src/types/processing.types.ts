/**
 * Processing Type Definitions
 * Types for job processing, queuing, and workflow management
 */

import { ProcessingStatus } from './floor-plan.types';

/**
 * Processing stages for floor plan analysis
 */
export enum ProcessingStage {
  // Initial stages
  INITIALIZATION = 'initialization',
  VALIDATION = 'validation',
  
  // Preprocessing
  IMAGE_ENHANCEMENT = 'image_enhancement',
  NOISE_REDUCTION = 'noise_reduction',
  ROTATION_CORRECTION = 'rotation_correction',
  SCALE_DETECTION = 'scale_detection',
  
  // Core processing
  EDGE_DETECTION = 'edge_detection',
  LINE_EXTRACTION = 'line_extraction',
  WALL_DETECTION = 'wall_detection',
  ROOM_SEGMENTATION = 'room_segmentation',
  
  // Feature extraction
  DOOR_DETECTION = 'door_detection',
  WINDOW_DETECTION = 'window_detection',
  FIXTURE_DETECTION = 'fixture_detection',
  TEXT_EXTRACTION = 'text_extraction',
  
  // Analysis
  ROOM_CLASSIFICATION = 'room_classification',
  DIMENSION_CALCULATION = 'dimension_calculation',
  AREA_MEASUREMENT = 'area_measurement',
  CONNECTIVITY_ANALYSIS = 'connectivity_analysis',
  
  // 3D Generation
  MODEL_GENERATION = 'model_generation',
  TEXTURE_MAPPING = 'texture_mapping',
  LIGHTING_SETUP = 'lighting_setup',
  RENDERING = 'rendering',
  
  // Finalization
  QUALITY_CHECK = 'quality_check',
  OUTPUT_GENERATION = 'output_generation',
  REPORT_CREATION = 'report_creation',
  ARCHIVING = 'archiving'
}

/**
 * Processing job priority levels
 */
export enum ProcessingPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
  DEFERRED = 'deferred'
}

/**
 * Processing job definition
 */
export interface ProcessingJob {
  id: string;
  type: 'floor_plan' | 'room_detection' | '3d_generation' | 'ocr' | 'custom';
  
  // Job identification
  resourceId: string; // ID of the resource being processed
  resourceType: string; // Type of resource
  projectId: string;
  userId: string;
  organizationId?: string;
  
  // Status and progress
  status: ProcessingStatus;
  currentStage?: ProcessingStage;
  progress: ProcessingProgress;
  
  // Priority and scheduling
  priority: ProcessingPriority;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Processing configuration
  config: ProcessingConfig;
  pipeline: ProcessingPipeline;
  
  // Results and errors
  result?: ProcessingResult;
  errors: ProcessingError[];
  warnings: ProcessingWarning[];
  
  // Performance metrics
  metrics: ProcessingMetrics;
  
  // Retry information
  retryCount: number;
  maxRetries: number;
  lastRetryAt?: Date;
  
  // Dependencies
  dependsOn?: string[]; // Job IDs this job depends on
  blocks?: string[]; // Job IDs that depend on this job
  
  // Metadata
  metadata?: Record<string, any>;
  tags?: string[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

/**
 * Processing progress tracking
 */
export interface ProcessingProgress {
  percentage: number; // 0-100
  currentStep: number;
  totalSteps: number;
  estimatedTimeRemaining?: number; // Seconds
  message?: string;
  details?: ProgressDetails;
}

/**
 * Detailed progress information
 */
export interface ProgressDetails {
  stagesCompleted: ProcessingStage[];
  currentStageProgress?: number;
  processedItems?: number;
  totalItems?: number;
  throughput?: number; // Items per second
}

/**
 * Processing configuration
 */
export interface ProcessingConfig {
  // Quality settings
  quality: 'draft' | 'standard' | 'high' | 'maximum';
  accuracy: 'fast' | 'balanced' | 'accurate';
  
  // Processing options
  enableOCR: boolean;
  enable3D: boolean;
  enableMeasurements: boolean;
  enableValidation: boolean;
  
  // Advanced options
  aiModel?: string;
  customPipeline?: string;
  preprocessingOptions?: PreprocessingOptions;
  extractionOptions?: ExtractionOptions;
  outputOptions?: OutputOptions;
  
  // Resource limits
  maxProcessingTime?: number; // Seconds
  maxMemoryUsage?: number; // MB
  maxCPUUsage?: number; // Percentage
  
  // Feature flags
  features?: Record<string, boolean>;
}

/**
 * Preprocessing options
 */
export interface PreprocessingOptions {
  denoise: boolean;
  denoiseLevel?: number;
  enhance: boolean;
  enhancementLevel?: number;
  deskew: boolean;
  removeWatermarks: boolean;
  colorCorrection: boolean;
  resolutionUpscaling: boolean;
  targetResolution?: number;
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  extractWalls: boolean;
  extractDoors: boolean;
  extractWindows: boolean;
  extractFixtures: boolean;
  extractText: boolean;
  extractDimensions: boolean;
  extractFurniture: boolean;
  minFeatureSize?: number;
  confidenceThreshold?: number;
}

/**
 * Output options
 */
export interface OutputOptions {
  formats: string[];
  resolution?: number;
  compression?: 'none' | 'low' | 'medium' | 'high';
  includeMetadata: boolean;
  includeReport: boolean;
  watermark?: boolean;
}

/**
 * Processing pipeline definition
 */
export interface ProcessingPipeline {
  id: string;
  name: string;
  version: string;
  stages: PipelineStage[];
  parallel?: boolean;
  timeout?: number;
}

/**
 * Pipeline stage definition
 */
export interface PipelineStage {
  id: string;
  type: ProcessingStage;
  order: number;
  
  // Execution
  handler: string; // Function or service name
  params?: Record<string, any>;
  
  // Control flow
  condition?: StageCondition;
  onSuccess?: string; // Next stage ID
  onFailure?: string; // Fallback stage ID
  
  // Configuration
  timeout?: number;
  retryable: boolean;
  optional: boolean;
  parallel?: boolean;
  
  // Validation
  inputValidation?: ValidationRule[];
  outputValidation?: ValidationRule[];
}

/**
 * Stage execution condition
 */
export interface StageCondition {
  type: 'always' | 'conditional' | 'threshold';
  expression?: string;
  threshold?: number;
  field?: string;
}

/**
 * Validation rule
 */
export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'range' | 'pattern' | 'custom';
  value?: any;
  message?: string;
}

/**
 * Processing result
 */
export interface ProcessingResult {
  success: boolean;
  outputId?: string;
  outputUrl?: string;
  outputs?: ProcessingOutput[];
  summary?: ResultSummary;
  data?: Record<string, any>;
  confidence?: ConfidenceScore;
}

/**
 * Processing output
 */
export interface ProcessingOutput {
  id: string;
  type: string;
  format: string;
  url?: string;
  data?: any;
  size?: number;
  metadata?: Record<string, any>;
}

/**
 * Result summary
 */
export interface ResultSummary {
  itemsProcessed: number;
  itemsSkipped: number;
  itemsFailed: number;
  successRate: number;
  averageConfidence: number;
  processingTime: number;
  highlights?: string[];
}

/**
 * Confidence score breakdown
 */
export interface ConfidenceScore {
  overall: number; // 0-1
  breakdown: {
    detection: number;
    classification: number;
    measurement: number;
    extraction: number;
  };
  factors: ConfidenceFactor[];
}

/**
 * Confidence factor
 */
export interface ConfidenceFactor {
  name: string;
  value: number;
  weight: number;
  impact: 'positive' | 'negative' | 'neutral';
}

/**
 * Processing error
 */
export interface ProcessingError {
  code: string;
  message: string;
  stage?: ProcessingStage;
  timestamp: Date;
  details?: any;
  stack?: string;
  recoverable: boolean;
}

/**
 * Processing warning
 */
export interface ProcessingWarning {
  code: string;
  message: string;
  stage?: ProcessingStage;
  severity: 'high' | 'medium' | 'low';
  impact?: string;
  suggestion?: string;
}

/**
 * Processing metrics
 */
export interface ProcessingMetrics {
  // Time metrics
  queueTime: number; // ms
  processingTime: number; // ms
  totalTime: number; // ms
  stageTimings: Record<string, number>;
  
  // Resource metrics
  cpuUsage: number; // Average percentage
  memoryUsage: number; // Peak MB
  diskIO: number; // MB read/written
  networkIO?: number; // MB transferred
  
  // Quality metrics
  accuracy?: number;
  completeness?: number;
  validationScore?: number;
  
  // Performance metrics
  throughput?: number; // Items per second
  efficiency?: number; // 0-1
}

/**
 * Queue job definition
 */
export interface QueueJob {
  id: string;
  queue: string;
  
  // Job data
  data: any;
  type: string;
  
  // Queue position
  position?: number;
  estimatedStartTime?: Date;
  
  // Scheduling
  scheduledFor?: Date;
  delay?: number; // Milliseconds
  repeat?: RepeatOptions;
  
  // Priority
  priority: number; // Higher number = higher priority
  
  // Attempts
  attempts: number;
  maxAttempts: number;
  backoff?: BackoffOptions;
  
  // Status
  status: QueueJobStatus;
  progress?: number;
  
  // Results
  result?: any;
  error?: string;
  failedReason?: string;
  
  // Timestamps
  addedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  
  // Metadata
  metadata?: Record<string, any>;
}

/**
 * Queue job status
 */
export enum QueueJobStatus {
  WAITING = 'waiting',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
  STUCK = 'stuck'
}

/**
 * Repeat options for recurring jobs
 */
export interface RepeatOptions {
  pattern?: string; // Cron pattern
  every?: number; // Milliseconds
  limit?: number; // Max repetitions
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
}

/**
 * Backoff options for retries
 */
export interface BackoffOptions {
  type: 'fixed' | 'exponential' | 'linear';
  delay: number; // Base delay in ms
  maxDelay?: number;
  factor?: number; // For exponential backoff
}

/**
 * Worker status
 */
export interface WorkerStatus {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'paused' | 'stopped';
  currentJob?: string;
  jobsProcessed: number;
  jobsFailed: number;
  uptime: number;
  lastActivity: Date;
  resources: WorkerResources;
}

/**
 * Worker resource usage
 */
export interface WorkerResources {
  cpu: number;
  memory: number;
  disk: number;
  network?: number;
}

/**
 * Batch processing job
 */
export interface BatchJob {
  id: string;
  name: string;
  jobs: string[]; // Individual job IDs
  
  status: BatchJobStatus;
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  
  options: {
    parallel?: boolean;
    maxConcurrency?: number;
    stopOnError?: boolean;
    timeout?: number;
  };
  
  results?: BatchJobResult[];
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Batch job status
 */
export enum BatchJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PARTIAL = 'partial'
}

/**
 * Batch job result
 */
export interface BatchJobResult {
  jobId: string;
  success: boolean;
  result?: any;
  error?: string;
  processingTime: number;
}

/**
 * Processing statistics
 */
export interface ProcessingStatistics {
  period: {
    start: Date;
    end: Date;
  };
  
  jobs: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    averageTime: number;
    medianTime: number;
  };
  
  throughput: {
    jobsPerHour: number;
    itemsPerHour: number;
    peakThroughput: number;
  };
  
  reliability: {
    successRate: number;
    errorRate: number;
    retryRate: number;
  };
  
  resources: {
    averageCPU: number;
    peakCPU: number;
    averageMemory: number;
    peakMemory: number;
  };
}