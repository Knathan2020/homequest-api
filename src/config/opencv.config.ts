/**
 * OpenCV Configuration
 * Image processing settings, algorithms, and performance tuning
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Image processing modes
 */
export enum ProcessingMode {
  FAST = 'fast',
  BALANCED = 'balanced',
  QUALITY = 'quality',
  MAXIMUM = 'maximum'
}

/**
 * Detection algorithms
 */
export enum DetectionAlgorithm {
  HOUGH_LINES = 'hough_lines',
  CONTOUR_DETECTION = 'contour_detection',
  EDGE_DETECTION = 'edge_detection',
  CORNER_DETECTION = 'corner_detection',
  TEMPLATE_MATCHING = 'template_matching',
  FEATURE_MATCHING = 'feature_matching',
  NEURAL_NETWORK = 'neural_network'
}

/**
 * Image formats
 */
export enum ImageFormat {
  PNG = 'png',
  JPEG = 'jpeg',
  TIFF = 'tiff',
  BMP = 'bmp',
  WEBP = 'webp',
  PDF = 'pdf',
  DWG = 'dwg',
  DXF = 'dxf'
}

/**
 * Color spaces
 */
export enum ColorSpace {
  RGB = 'rgb',
  BGR = 'bgr',
  GRAY = 'gray',
  HSV = 'hsv',
  LAB = 'lab',
  YCrCb = 'ycrcb'
}

/**
 * Morphological operations
 */
export enum MorphOperation {
  ERODE = 'erode',
  DILATE = 'dilate',
  OPEN = 'open',
  CLOSE = 'close',
  GRADIENT = 'gradient',
  TOPHAT = 'tophat',
  BLACKHAT = 'blackhat'
}

/**
 * Main OpenCV configuration interface
 */
export interface OpenCVConfig {
  mode: ProcessingMode;
  preprocessing: PreprocessingConfig;
  detection: DetectionConfig;
  extraction: ExtractionConfig;
  optimization: OptimizationConfig;
  output: OutputConfig;
  performance: PerformanceConfig;
  debug: DebugConfig;
}

/**
 * Preprocessing configuration
 */
export interface PreprocessingConfig {
  // Noise reduction
  denoise: {
    enabled: boolean;
    method: 'gaussian' | 'bilateral' | 'median' | 'nlmeans';
    strength: number; // 0-10
    preserveEdges: boolean;
  };
  
  // Image enhancement
  enhancement: {
    enabled: boolean;
    contrast: number; // 0.5-3.0
    brightness: number; // -100 to 100
    gamma: number; // 0.5-2.0
    histogram: {
      equalization: boolean;
      adaptive: boolean;
      clipLimit: number; // 1.0-10.0
    };
  };
  
  // Geometric corrections
  geometry: {
    deskew: boolean;
    deskewThreshold: number; // Degrees
    perspective: boolean;
    rotation: 'auto' | 'none' | number; // Degrees
    scaling: 'auto' | 'none' | number; // Factor
  };
  
  // Color processing
  color: {
    convertToGrayscale: boolean;
    colorSpace: ColorSpace;
    whiteBalance: boolean;
    colorCorrection: boolean;
  };
  
  // Morphological operations
  morphology: {
    enabled: boolean;
    operations: Array<{
      type: MorphOperation;
      kernelSize: number;
      iterations: number;
    }>;
  };
  
  // Resolution
  resolution: {
    targetDPI: number;
    upscaling: boolean;
    upscalingMethod: 'linear' | 'cubic' | 'lanczos' | 'super_resolution';
    downscaling: boolean;
    maxWidth: number;
    maxHeight: number;
  };
}

/**
 * Detection configuration
 */
export interface DetectionConfig {
  // Wall detection
  walls: {
    enabled: boolean;
    algorithm: DetectionAlgorithm;
    minLength: number; // Pixels
    maxGap: number; // Pixels
    thickness: number; // Expected wall thickness
    angleThreshold: number; // Degrees
    mergeThreshold: number; // Pixels
  };
  
  // Door detection
  doors: {
    enabled: boolean;
    minWidth: number; // Pixels
    maxWidth: number; // Pixels
    minHeight: number; // Pixels
    arcDetection: boolean;
    swingDetection: boolean;
  };
  
  // Window detection
  windows: {
    enabled: boolean;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    parallelLineThreshold: number;
  };
  
  // Room detection
  rooms: {
    enabled: boolean;
    minArea: number; // Square pixels
    maxArea: number;
    convexityThreshold: number; // 0-1
    rectangularityThreshold: number; // 0-1
    closureThreshold: number; // Pixels
  };
  
  // Text detection
  text: {
    enabled: boolean;
    languages: string[]; // OCR languages
    minConfidence: number; // 0-100
    dictionaryPath?: string;
    customPatterns?: string[]; // Regex patterns
  };
  
  // Symbol detection
  symbols: {
    enabled: boolean;
    templatePath?: string;
    symbolTypes: string[]; // Types to detect
    scaleTolerance: number; // Percentage
    rotationTolerance: number; // Degrees
  };
  
  // Edge detection
  edges: {
    algorithm: 'canny' | 'sobel' | 'laplacian' | 'scharr';
    lowThreshold: number;
    highThreshold: number;
    kernelSize: number;
    L2gradient: boolean;
  };
  
  // Line detection
  lines: {
    algorithm: 'hough' | 'houghp' | 'lsd';
    threshold: number;
    minLineLength: number;
    maxLineGap: number;
    rhoResolution: number;
    thetaResolution: number;
  };
}

/**
 * Feature extraction configuration
 */
export interface ExtractionConfig {
  // Dimension extraction
  dimensions: {
    enabled: boolean;
    unit: 'pixel' | 'meter' | 'feet' | 'auto';
    scale: number; // Pixels per unit
    autoScale: boolean;
    precision: number; // Decimal places
  };
  
  // Area calculation
  areas: {
    enabled: boolean;
    includeWalls: boolean;
    includeOpenings: boolean;
    method: 'polygon' | 'grid' | 'monte_carlo';
  };
  
  // Contour extraction
  contours: {
    mode: 'external' | 'list' | 'tree' | 'ccomp';
    method: 'none' | 'simple' | 'l1' | 'kcos';
    minArea: number;
    maxArea: number;
    approximation: boolean;
    epsilon: number; // Approximation accuracy
  };
  
  // Feature points
  features: {
    detector: 'orb' | 'sift' | 'surf' | 'fast' | 'brisk';
    maxFeatures: number;
    qualityLevel: number;
    minDistance: number;
  };
  
  // Connectivity analysis
  connectivity: {
    enabled: boolean;
    neighborhoodSize: 4 | 8;
    minComponentSize: number;
  };
}

/**
 * Optimization configuration
 */
export interface OptimizationConfig {
  // Parallel processing
  parallel: {
    enabled: boolean;
    threads: number;
    tileSize: number; // For tiled processing
    overlap: number; // Tile overlap in pixels
  };
  
  // GPU acceleration
  gpu: {
    enabled: boolean;
    deviceId: number;
    memoryLimit: number; // MB
    fallbackToCPU: boolean;
  };
  
  // Caching
  cache: {
    enabled: boolean;
    preprocessedImages: boolean;
    detectionResults: boolean;
    maxCacheSize: number; // MB
    ttl: number; // Seconds
  };
  
  // Memory management
  memory: {
    maxImageSize: number; // Pixels
    maxMemoryUsage: number; // MB
    enableSwap: boolean;
    compressionLevel: number; // 0-9
  };
  
  // Batch processing
  batch: {
    enabled: boolean;
    size: number;
    prefetch: number;
    timeout: number; // Milliseconds
  };
}

/**
 * Output configuration
 */
export interface OutputConfig {
  // Image output
  image: {
    format: ImageFormat;
    quality: number; // 0-100 for lossy formats
    compression: 'none' | 'lzw' | 'zip' | 'jpeg';
    colorDepth: 8 | 16 | 24 | 32;
    dpi: number;
  };
  
  // Vector output
  vector: {
    enabled: boolean;
    format: 'svg' | 'dxf' | 'dwg';
    precision: number;
    units: 'pixel' | 'mm' | 'inch';
    layers: boolean;
  };
  
  // Annotation
  annotation: {
    enabled: boolean;
    drawWalls: boolean;
    drawDoors: boolean;
    drawWindows: boolean;
    drawRooms: boolean;
    drawDimensions: boolean;
    drawLabels: boolean;
    fontSize: number;
    lineWidth: number;
    colors: {
      walls: string;
      doors: string;
      windows: string;
      rooms: string;
      dimensions: string;
      labels: string;
    };
  };
  
  // Metadata
  metadata: {
    includeExif: boolean;
    includeProcessingInfo: boolean;
    includeTimestamp: boolean;
    customFields?: Record<string, any>;
  };
}

/**
 * Performance configuration
 */
export interface PerformanceConfig {
  // Timeouts
  timeouts: {
    preprocessing: number; // ms
    detection: number;
    extraction: number;
    total: number;
  };
  
  // Quality levels
  quality: {
    mode: ProcessingMode;
    adaptiveQuality: boolean;
    minQuality: number; // 0-100
    targetSpeed: number; // ms
  };
  
  // Resource limits
  limits: {
    maxCPU: number; // Percentage
    maxMemory: number; // MB
    maxDisk: number; // MB
    maxNetworkBandwidth?: number; // Mbps
  };
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // ms
    profileEnabled: boolean;
    tracingEnabled: boolean;
  };
}

/**
 * Debug configuration
 */
export interface DebugConfig {
  enabled: boolean;
  saveIntermediateImages: boolean;
  outputPath: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  
  visualization: {
    showEdges: boolean;
    showContours: boolean;
    showLines: boolean;
    showFeatures: boolean;
    showGrid: boolean;
    gridSize: number;
  };
  
  timing: {
    measureSteps: boolean;
    logSlowOperations: boolean;
    slowThreshold: number; // ms
  };
  
  validation: {
    checkInputs: boolean;
    checkOutputs: boolean;
    validateGeometry: boolean;
    strictMode: boolean;
  };
}

/**
 * Get processing mode from environment or default
 */
const getProcessingMode = (): ProcessingMode => {
  const mode = process.env.OPENCV_PROCESSING_MODE?.toLowerCase();
  switch (mode) {
    case 'fast':
      return ProcessingMode.FAST;
    case 'quality':
      return ProcessingMode.QUALITY;
    case 'maximum':
      return ProcessingMode.MAXIMUM;
    default:
      return ProcessingMode.BALANCED;
  }
};

/**
 * OpenCV configuration based on processing mode
 */
export const opencvConfig: OpenCVConfig = {
  mode: getProcessingMode(),
  
  preprocessing: {
    denoise: {
      enabled: process.env.OPENCV_DENOISE_ENABLED !== 'false',
      method: (process.env.OPENCV_DENOISE_METHOD as any) || 'bilateral',
      strength: parseFloat(process.env.OPENCV_DENOISE_STRENGTH || '5'),
      preserveEdges: process.env.OPENCV_PRESERVE_EDGES !== 'false'
    },
    enhancement: {
      enabled: process.env.OPENCV_ENHANCEMENT_ENABLED !== 'false',
      contrast: parseFloat(process.env.OPENCV_CONTRAST || '1.2'),
      brightness: parseFloat(process.env.OPENCV_BRIGHTNESS || '0'),
      gamma: parseFloat(process.env.OPENCV_GAMMA || '1.0'),
      histogram: {
        equalization: process.env.OPENCV_HISTOGRAM_EQ === 'true',
        adaptive: process.env.OPENCV_ADAPTIVE_HISTOGRAM === 'true',
        clipLimit: parseFloat(process.env.OPENCV_CLIP_LIMIT || '2.0')
      }
    },
    geometry: {
      deskew: process.env.OPENCV_DESKEW !== 'false',
      deskewThreshold: parseFloat(process.env.OPENCV_DESKEW_THRESHOLD || '5'),
      perspective: process.env.OPENCV_PERSPECTIVE === 'true',
      rotation: process.env.OPENCV_ROTATION === 'auto' ? 'auto' : 
               process.env.OPENCV_ROTATION === 'none' ? 'none' :
               parseFloat(process.env.OPENCV_ROTATION || '0'),
      scaling: process.env.OPENCV_SCALING === 'auto' ? 'auto' :
              process.env.OPENCV_SCALING === 'none' ? 'none' :
              parseFloat(process.env.OPENCV_SCALING || '1')
    },
    color: {
      convertToGrayscale: process.env.OPENCV_GRAYSCALE !== 'false',
      colorSpace: (process.env.OPENCV_COLOR_SPACE as ColorSpace) || ColorSpace.RGB,
      whiteBalance: process.env.OPENCV_WHITE_BALANCE === 'true',
      colorCorrection: process.env.OPENCV_COLOR_CORRECTION === 'true'
    },
    morphology: {
      enabled: process.env.OPENCV_MORPHOLOGY === 'true',
      operations: [
        {
          type: MorphOperation.CLOSE,
          kernelSize: 3,
          iterations: 1
        },
        {
          type: MorphOperation.OPEN,
          kernelSize: 3,
          iterations: 1
        }
      ]
    },
    resolution: {
      targetDPI: parseInt(process.env.OPENCV_TARGET_DPI || '300'),
      upscaling: process.env.OPENCV_UPSCALING === 'true',
      upscalingMethod: (process.env.OPENCV_UPSCALING_METHOD as any) || 'cubic',
      downscaling: process.env.OPENCV_DOWNSCALING !== 'false',
      maxWidth: parseInt(process.env.OPENCV_MAX_WIDTH || '4096'),
      maxHeight: parseInt(process.env.OPENCV_MAX_HEIGHT || '4096')
    }
  },
  
  detection: {
    walls: {
      enabled: true,
      algorithm: DetectionAlgorithm.HOUGH_LINES,
      minLength: parseInt(process.env.OPENCV_WALL_MIN_LENGTH || '50'),
      maxGap: parseInt(process.env.OPENCV_WALL_MAX_GAP || '10'),
      thickness: parseInt(process.env.OPENCV_WALL_THICKNESS || '10'),
      angleThreshold: parseFloat(process.env.OPENCV_ANGLE_THRESHOLD || '5'),
      mergeThreshold: parseInt(process.env.OPENCV_MERGE_THRESHOLD || '20')
    },
    doors: {
      enabled: true,
      minWidth: parseInt(process.env.OPENCV_DOOR_MIN_WIDTH || '60'),
      maxWidth: parseInt(process.env.OPENCV_DOOR_MAX_WIDTH || '120'),
      minHeight: parseInt(process.env.OPENCV_DOOR_MIN_HEIGHT || '180'),
      arcDetection: process.env.OPENCV_ARC_DETECTION !== 'false',
      swingDetection: process.env.OPENCV_SWING_DETECTION === 'true'
    },
    windows: {
      enabled: true,
      minWidth: parseInt(process.env.OPENCV_WINDOW_MIN_WIDTH || '40'),
      maxWidth: parseInt(process.env.OPENCV_WINDOW_MAX_WIDTH || '200'),
      minHeight: parseInt(process.env.OPENCV_WINDOW_MIN_HEIGHT || '40'),
      parallelLineThreshold: parseInt(process.env.OPENCV_PARALLEL_THRESHOLD || '10')
    },
    rooms: {
      enabled: true,
      minArea: parseInt(process.env.OPENCV_ROOM_MIN_AREA || '1000'),
      maxArea: parseInt(process.env.OPENCV_ROOM_MAX_AREA || '100000'),
      convexityThreshold: parseFloat(process.env.OPENCV_CONVEXITY || '0.8'),
      rectangularityThreshold: parseFloat(process.env.OPENCV_RECTANGULARITY || '0.7'),
      closureThreshold: parseInt(process.env.OPENCV_CLOSURE_THRESHOLD || '20')
    },
    text: {
      enabled: process.env.OPENCV_OCR_ENABLED !== 'false',
      languages: (process.env.OPENCV_OCR_LANGUAGES || 'eng').split(','),
      minConfidence: parseInt(process.env.OPENCV_OCR_CONFIDENCE || '70'),
      dictionaryPath: process.env.OPENCV_DICTIONARY_PATH,
      customPatterns: process.env.OPENCV_CUSTOM_PATTERNS?.split(',')
    },
    symbols: {
      enabled: process.env.OPENCV_SYMBOL_DETECTION === 'true',
      templatePath: process.env.OPENCV_TEMPLATE_PATH,
      symbolTypes: (process.env.OPENCV_SYMBOL_TYPES || 'door,window,stairs').split(','),
      scaleTolerance: parseFloat(process.env.OPENCV_SCALE_TOLERANCE || '20'),
      rotationTolerance: parseFloat(process.env.OPENCV_ROTATION_TOLERANCE || '15')
    },
    edges: {
      algorithm: (process.env.OPENCV_EDGE_ALGORITHM as any) || 'canny',
      lowThreshold: parseInt(process.env.OPENCV_EDGE_LOW || '50'),
      highThreshold: parseInt(process.env.OPENCV_EDGE_HIGH || '150'),
      kernelSize: parseInt(process.env.OPENCV_EDGE_KERNEL || '3'),
      L2gradient: process.env.OPENCV_L2_GRADIENT === 'true'
    },
    lines: {
      algorithm: (process.env.OPENCV_LINE_ALGORITHM as any) || 'houghp',
      threshold: parseInt(process.env.OPENCV_LINE_THRESHOLD || '80'),
      minLineLength: parseInt(process.env.OPENCV_MIN_LINE_LENGTH || '30'),
      maxLineGap: parseInt(process.env.OPENCV_MAX_LINE_GAP || '10'),
      rhoResolution: parseFloat(process.env.OPENCV_RHO_RESOLUTION || '1'),
      thetaResolution: parseFloat(process.env.OPENCV_THETA_RESOLUTION || '0.017453') // 1 degree in radians
    }
  },
  
  extraction: {
    dimensions: {
      enabled: true,
      unit: (process.env.OPENCV_DIMENSION_UNIT as any) || 'auto',
      scale: parseFloat(process.env.OPENCV_SCALE || '1'),
      autoScale: process.env.OPENCV_AUTO_SCALE !== 'false',
      precision: parseInt(process.env.OPENCV_PRECISION || '2')
    },
    areas: {
      enabled: true,
      includeWalls: process.env.OPENCV_INCLUDE_WALLS === 'true',
      includeOpenings: process.env.OPENCV_INCLUDE_OPENINGS === 'true',
      method: (process.env.OPENCV_AREA_METHOD as any) || 'polygon'
    },
    contours: {
      mode: (process.env.OPENCV_CONTOUR_MODE as any) || 'tree',
      method: (process.env.OPENCV_CONTOUR_METHOD as any) || 'simple',
      minArea: parseInt(process.env.OPENCV_CONTOUR_MIN_AREA || '100'),
      maxArea: parseInt(process.env.OPENCV_CONTOUR_MAX_AREA || '1000000'),
      approximation: process.env.OPENCV_CONTOUR_APPROX !== 'false',
      epsilon: parseFloat(process.env.OPENCV_EPSILON || '0.01')
    },
    features: {
      detector: (process.env.OPENCV_FEATURE_DETECTOR as any) || 'orb',
      maxFeatures: parseInt(process.env.OPENCV_MAX_FEATURES || '500'),
      qualityLevel: parseFloat(process.env.OPENCV_QUALITY_LEVEL || '0.01'),
      minDistance: parseInt(process.env.OPENCV_MIN_DISTANCE || '10')
    },
    connectivity: {
      enabled: process.env.OPENCV_CONNECTIVITY === 'true',
      neighborhoodSize: (parseInt(process.env.OPENCV_NEIGHBORHOOD || '8') as 4 | 8),
      minComponentSize: parseInt(process.env.OPENCV_MIN_COMPONENT || '50')
    }
  },
  
  optimization: {
    parallel: {
      enabled: process.env.OPENCV_PARALLEL !== 'false',
      threads: parseInt(process.env.OPENCV_THREADS || '0') || 0, // 0 = auto
      tileSize: parseInt(process.env.OPENCV_TILE_SIZE || '512'),
      overlap: parseInt(process.env.OPENCV_TILE_OVERLAP || '50')
    },
    gpu: {
      enabled: process.env.OPENCV_GPU === 'true',
      deviceId: parseInt(process.env.OPENCV_GPU_DEVICE || '0'),
      memoryLimit: parseInt(process.env.OPENCV_GPU_MEMORY || '2048'),
      fallbackToCPU: process.env.OPENCV_GPU_FALLBACK !== 'false'
    },
    cache: {
      enabled: process.env.OPENCV_CACHE !== 'false',
      preprocessedImages: true,
      detectionResults: true,
      maxCacheSize: parseInt(process.env.OPENCV_CACHE_SIZE || '1024'),
      ttl: parseInt(process.env.OPENCV_CACHE_TTL || '3600')
    },
    memory: {
      maxImageSize: parseInt(process.env.OPENCV_MAX_IMAGE_SIZE || '16777216'), // 4096x4096
      maxMemoryUsage: parseInt(process.env.OPENCV_MAX_MEMORY || '2048'),
      enableSwap: process.env.OPENCV_ENABLE_SWAP === 'true',
      compressionLevel: parseInt(process.env.OPENCV_COMPRESSION || '6')
    },
    batch: {
      enabled: process.env.OPENCV_BATCH === 'true',
      size: parseInt(process.env.OPENCV_BATCH_SIZE || '10'),
      prefetch: parseInt(process.env.OPENCV_PREFETCH || '2'),
      timeout: parseInt(process.env.OPENCV_BATCH_TIMEOUT || '30000')
    }
  },
  
  output: {
    image: {
      format: (process.env.OPENCV_OUTPUT_FORMAT as ImageFormat) || ImageFormat.PNG,
      quality: parseInt(process.env.OPENCV_OUTPUT_QUALITY || '90'),
      compression: (process.env.OPENCV_OUTPUT_COMPRESSION as any) || 'none',
      colorDepth: (parseInt(process.env.OPENCV_COLOR_DEPTH || '24') as any),
      dpi: parseInt(process.env.OPENCV_OUTPUT_DPI || '300')
    },
    vector: {
      enabled: process.env.OPENCV_VECTOR_OUTPUT === 'true',
      format: (process.env.OPENCV_VECTOR_FORMAT as any) || 'svg',
      precision: parseInt(process.env.OPENCV_VECTOR_PRECISION || '2'),
      units: (process.env.OPENCV_VECTOR_UNITS as any) || 'mm',
      layers: process.env.OPENCV_VECTOR_LAYERS !== 'false'
    },
    annotation: {
      enabled: process.env.OPENCV_ANNOTATION !== 'false',
      drawWalls: true,
      drawDoors: true,
      drawWindows: true,
      drawRooms: true,
      drawDimensions: process.env.OPENCV_DRAW_DIMENSIONS === 'true',
      drawLabels: true,
      fontSize: parseInt(process.env.OPENCV_FONT_SIZE || '12'),
      lineWidth: parseInt(process.env.OPENCV_LINE_WIDTH || '2'),
      colors: {
        walls: process.env.OPENCV_COLOR_WALLS || '#000000',
        doors: process.env.OPENCV_COLOR_DOORS || '#FF0000',
        windows: process.env.OPENCV_COLOR_WINDOWS || '#0000FF',
        rooms: process.env.OPENCV_COLOR_ROOMS || '#00FF00',
        dimensions: process.env.OPENCV_COLOR_DIMENSIONS || '#FF00FF',
        labels: process.env.OPENCV_COLOR_LABELS || '#000000'
      }
    },
    metadata: {
      includeExif: true,
      includeProcessingInfo: true,
      includeTimestamp: true,
      customFields: {}
    }
  },
  
  performance: {
    timeouts: {
      preprocessing: parseInt(process.env.OPENCV_TIMEOUT_PREPROCESS || '30000'),
      detection: parseInt(process.env.OPENCV_TIMEOUT_DETECTION || '60000'),
      extraction: parseInt(process.env.OPENCV_TIMEOUT_EXTRACTION || '30000'),
      total: parseInt(process.env.OPENCV_TIMEOUT_TOTAL || '180000')
    },
    quality: {
      mode: getProcessingMode(),
      adaptiveQuality: process.env.OPENCV_ADAPTIVE_QUALITY === 'true',
      minQuality: parseInt(process.env.OPENCV_MIN_QUALITY || '70'),
      targetSpeed: parseInt(process.env.OPENCV_TARGET_SPEED || '5000')
    },
    limits: {
      maxCPU: parseInt(process.env.OPENCV_MAX_CPU || '80'),
      maxMemory: parseInt(process.env.OPENCV_MAX_MEM || '2048'),
      maxDisk: parseInt(process.env.OPENCV_MAX_DISK || '5120'),
      maxNetworkBandwidth: process.env.OPENCV_MAX_BANDWIDTH ? 
        parseInt(process.env.OPENCV_MAX_BANDWIDTH) : undefined
    },
    monitoring: {
      enabled: process.env.OPENCV_MONITORING === 'true',
      metricsInterval: parseInt(process.env.OPENCV_METRICS_INTERVAL || '1000'),
      profileEnabled: process.env.OPENCV_PROFILING === 'true',
      tracingEnabled: process.env.OPENCV_TRACING === 'true'
    }
  },
  
  debug: {
    enabled: process.env.OPENCV_DEBUG === 'true' || process.env.NODE_ENV === 'development',
    saveIntermediateImages: process.env.OPENCV_SAVE_INTERMEDIATE === 'true',
    outputPath: process.env.OPENCV_DEBUG_PATH || './debug/opencv',
    logLevel: (process.env.OPENCV_LOG_LEVEL as any) || 'info',
    visualization: {
      showEdges: process.env.OPENCV_SHOW_EDGES === 'true',
      showContours: process.env.OPENCV_SHOW_CONTOURS === 'true',
      showLines: process.env.OPENCV_SHOW_LINES === 'true',
      showFeatures: process.env.OPENCV_SHOW_FEATURES === 'true',
      showGrid: process.env.OPENCV_SHOW_GRID === 'true',
      gridSize: parseInt(process.env.OPENCV_GRID_SIZE || '50')
    },
    timing: {
      measureSteps: process.env.OPENCV_MEASURE_TIMING === 'true',
      logSlowOperations: process.env.OPENCV_LOG_SLOW === 'true',
      slowThreshold: parseInt(process.env.OPENCV_SLOW_THRESHOLD || '1000')
    },
    validation: {
      checkInputs: process.env.OPENCV_CHECK_INPUTS !== 'false',
      checkOutputs: process.env.OPENCV_CHECK_OUTPUTS !== 'false',
      validateGeometry: process.env.OPENCV_VALIDATE_GEOMETRY === 'true',
      strictMode: process.env.OPENCV_STRICT_MODE === 'true'
    }
  }
};

/**
 * Get configuration for specific processing mode
 */
export const getModeConfig = (mode: ProcessingMode): Partial<OpenCVConfig> => {
  switch (mode) {
    case ProcessingMode.FAST:
      return {
        preprocessing: {
          ...opencvConfig.preprocessing,
          denoise: { ...opencvConfig.preprocessing.denoise, enabled: false },
          enhancement: { ...opencvConfig.preprocessing.enhancement, enabled: false },
          morphology: { ...opencvConfig.preprocessing.morphology, enabled: false }
        },
        detection: {
          ...opencvConfig.detection,
          text: { ...opencvConfig.detection.text, enabled: false },
          symbols: { ...opencvConfig.detection.symbols, enabled: false }
        },
        optimization: {
          ...opencvConfig.optimization,
          parallel: { ...opencvConfig.optimization.parallel, enabled: true },
          cache: { ...opencvConfig.optimization.cache, enabled: true }
        }
      };
      
    case ProcessingMode.QUALITY:
      return {
        preprocessing: {
          ...opencvConfig.preprocessing,
          denoise: { ...opencvConfig.preprocessing.denoise, enabled: true, strength: 7 },
          enhancement: { ...opencvConfig.preprocessing.enhancement, enabled: true },
          morphology: { ...opencvConfig.preprocessing.morphology, enabled: true }
        },
        detection: {
          ...opencvConfig.detection,
          walls: { ...opencvConfig.detection.walls, algorithm: DetectionAlgorithm.NEURAL_NETWORK }
        }
      };
      
    case ProcessingMode.MAXIMUM:
      return {
        preprocessing: {
          ...opencvConfig.preprocessing,
          denoise: { ...opencvConfig.preprocessing.denoise, enabled: true, strength: 10 },
          enhancement: { ...opencvConfig.preprocessing.enhancement, enabled: true },
          geometry: { ...opencvConfig.preprocessing.geometry, perspective: true },
          morphology: { ...opencvConfig.preprocessing.morphology, enabled: true },
          resolution: { ...opencvConfig.preprocessing.resolution, upscaling: true }
        },
        detection: {
          ...opencvConfig.detection,
          text: { ...opencvConfig.detection.text, enabled: true },
          symbols: { ...opencvConfig.detection.symbols, enabled: true }
        },
        extraction: {
          ...opencvConfig.extraction,
          connectivity: { ...opencvConfig.extraction.connectivity, enabled: true }
        },
        optimization: {
          ...opencvConfig.optimization,
          gpu: { ...opencvConfig.optimization.gpu, enabled: true }
        }
      };
      
    default:
      return {};
  }
};

/**
 * Export default configuration
 */
export default opencvConfig;