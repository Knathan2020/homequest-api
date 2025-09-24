/**
 * Image Preprocessing Service
 * Image enhancement using Sharp for better OCR accuracy
 */

import sharp from 'sharp';
import { Buffer } from 'buffer';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Preprocessing operations
 */
export enum PreprocessOperation {
  DENOISE = 'denoise',
  SHARPEN = 'sharpen',
  THRESHOLD = 'threshold',
  CONTRAST = 'contrast',
  BRIGHTNESS = 'brightness',
  GAMMA = 'gamma',
  GRAYSCALE = 'grayscale',
  INVERT = 'invert',
  DESKEW = 'deskew',
  MORPHOLOGY = 'morphology',
  EDGE_ENHANCE = 'edge_enhance',
  BLUR = 'blur',
  MEDIAN = 'median'
}

/**
 * Morphological operations
 */
export enum MorphologyOperation {
  ERODE = 'erode',
  DILATE = 'dilate',
  OPEN = 'open',
  CLOSE = 'close',
  GRADIENT = 'gradient',
  TOPHAT = 'tophat',
  BLACKHAT = 'blackhat'
}

/**
 * Threshold methods
 */
export enum ThresholdMethod {
  BINARY = 'binary',
  OTSU = 'otsu',
  ADAPTIVE_MEAN = 'adaptive_mean',
  ADAPTIVE_GAUSSIAN = 'adaptive_gaussian',
  SAUVOLA = 'sauvola',
  NIBLACK = 'niblack'
}

/**
 * Image format
 */
export enum ImageFormat {
  PNG = 'png',
  JPEG = 'jpeg',
  WEBP = 'webp',
  TIFF = 'tiff',
  RAW = 'raw'
}

/**
 * Preprocessing configuration
 */
export interface PreprocessConfig {
  operations: PreprocessOperation[];
  denoise?: DenoiseConfig;
  sharpen?: SharpenConfig;
  threshold?: ThresholdConfig;
  contrast?: ContrastConfig;
  brightness?: number; // -100 to 100
  gamma?: number; // 0.1 to 3.0
  grayscale?: boolean;
  invert?: boolean;
  deskew?: DeskewConfig;
  morphology?: MorphologyConfig;
  edgeEnhance?: EdgeEnhanceConfig;
  blur?: BlurConfig;
  median?: number; // Kernel size
  outputFormat?: ImageFormat;
  quality?: number; // 1-100 for JPEG/WEBP
}

/**
 * Denoise configuration
 */
export interface DenoiseConfig {
  strength?: number; // 0-10
  preserveEdges?: boolean;
  colorSpace?: 'srgb' | 'lab' | 'xyz';
}

/**
 * Sharpen configuration
 */
export interface SharpenConfig {
  sigma?: number; // 0.5-10
  m1?: number; // Flat areas threshold
  m2?: number; // Jagged areas threshold
  x1?: number; // Flat areas amplification
  y2?: number; // Maximum amplification
  y3?: number; // Jagged areas amplification
}

/**
 * Threshold configuration
 */
export interface ThresholdConfig {
  method: ThresholdMethod;
  value?: number; // For binary threshold
  maxValue?: number;
  blockSize?: number; // For adaptive methods
  constant?: number; // For adaptive methods
  radius?: number; // For Sauvola/Niblack
  k?: number; // For Sauvola/Niblack
}

/**
 * Contrast configuration
 */
export interface ContrastConfig {
  factor?: number; // 0-2
  brightness?: number; // -1 to 1
  method?: 'linear' | 'sigmoid' | 'clahe';
  clipLimit?: number; // For CLAHE
  tileSize?: number; // For CLAHE
}

/**
 * Deskew configuration
 */
export interface DeskewConfig {
  threshold?: number; // Angle threshold in degrees
  background?: string; // Background color
  autoCrop?: boolean;
}

/**
 * Morphology configuration
 */
export interface MorphologyConfig {
  operation: MorphologyOperation;
  kernel?: 'square' | 'cross' | 'disk';
  size?: number; // Kernel size
  iterations?: number;
}

/**
 * Edge enhancement configuration
 */
export interface EdgeEnhanceConfig {
  method?: 'sobel' | 'scharr' | 'roberts' | 'prewitt' | 'canny';
  lowThreshold?: number;
  highThreshold?: number;
  aperture?: number;
}

/**
 * Blur configuration
 */
export interface BlurConfig {
  method?: 'gaussian' | 'box' | 'median' | 'bilateral';
  sigma?: number;
  radius?: number;
  preserveEdges?: boolean;
}

/**
 * Preprocessing result
 */
export interface PreprocessResult {
  buffer: Buffer;
  metadata: {
    width: number;
    height: number;
    channels: number;
    format: string;
    size: number;
    density?: number;
  };
  operations: string[];
  processingTime: number;
  improvements?: {
    contrast?: number;
    sharpness?: number;
    noise?: number;
  };
}

/**
 * Image analysis result
 */
export interface ImageAnalysis {
  brightness: number;
  contrast: number;
  sharpness: number;
  noise: number;
  skew?: number;
  histogram?: {
    red?: number[];
    green?: number[];
    blue?: number[];
    luminance: number[];
  };
  dominantColors?: Array<{ color: string; percentage: number }>;
  hasText: boolean;
  textRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

/**
 * Preprocessing Service
 */
export class PreprocessingService {
  private defaultConfig: PreprocessConfig;
  private tempDir: string;

  constructor() {
    this.defaultConfig = this.getDefaultConfig();
    this.tempDir = process.env.PREPROCESSING_TEMP_DIR || './temp/preprocessing';
    this.ensureTempDir();
  }

  /**
   * Preprocess image for OCR
   */
  async preprocessForOCR(input: string | Buffer): Promise<Buffer> {
    const config: PreprocessConfig = {
      operations: [
        PreprocessOperation.GRAYSCALE,
        PreprocessOperation.DENOISE,
        PreprocessOperation.CONTRAST,
        PreprocessOperation.SHARPEN,
        PreprocessOperation.THRESHOLD
      ],
      denoise: { strength: 3, preserveEdges: true },
      contrast: { factor: 1.3, method: 'linear' },
      sharpen: { sigma: 1.0 },
      threshold: { method: ThresholdMethod.OTSU },
      outputFormat: ImageFormat.PNG
    };

    const result = await this.preprocessImage(input, config);
    return result.buffer;
  }

  /**
   * Preprocess floor plan specifically
   */
  async preprocessFloorPlan(input: string | Buffer): Promise<Buffer> {
    const config: PreprocessConfig = {
      operations: [
        PreprocessOperation.GRAYSCALE,
        PreprocessOperation.DENOISE,
        PreprocessOperation.DESKEW,
        PreprocessOperation.CONTRAST,
        PreprocessOperation.MORPHOLOGY,
        PreprocessOperation.SHARPEN,
        PreprocessOperation.THRESHOLD
      ],
      denoise: { strength: 2, preserveEdges: true },
      deskew: { threshold: 0.5, autoCrop: true },
      contrast: { factor: 1.5, method: 'clahe' },
      morphology: { 
        operation: MorphologyOperation.CLOSE, 
        size: 2, 
        iterations: 1 
      },
      sharpen: { sigma: 0.8 },
      threshold: { 
        method: ThresholdMethod.ADAPTIVE_GAUSSIAN,
        blockSize: 11,
        constant: 2
      },
      outputFormat: ImageFormat.PNG
    };

    const result = await this.preprocessImage(input, config);
    return result.buffer;
  }

  /**
   * Preprocess image with custom configuration
   */
  async preprocessImage(
    input: string | Buffer,
    config?: Partial<PreprocessConfig>
  ): Promise<PreprocessResult> {
    const startTime = Date.now();
    const mergedConfig = { ...this.defaultConfig, ...config };
    const operations: string[] = [];

    try {
      // Load image
      let pipeline = sharp(input);

      // Get original metadata
      const originalMetadata = await pipeline.metadata();

      // Apply preprocessing operations in order
      for (const operation of mergedConfig.operations) {
        pipeline = await this.applyOperation(pipeline, operation, mergedConfig);
        operations.push(operation);
      }

      // Convert to specified format
      if (mergedConfig.outputFormat) {
        pipeline = this.convertFormat(pipeline, mergedConfig.outputFormat, mergedConfig.quality);
      }

      // Get processed buffer and metadata
      const buffer = await pipeline.toBuffer();
      const metadata = await sharp(buffer).metadata();

      // Calculate improvements
      const improvements = await this.calculateImprovements(input, buffer);

      const processingTime = Date.now() - startTime;

      return {
        buffer,
        metadata: {
          width: metadata.width!,
          height: metadata.height!,
          channels: metadata.channels!,
          format: metadata.format!,
          size: buffer.length,
          density: metadata.density
        },
        operations,
        processingTime,
        improvements
      };

    } catch (error) {
      console.error('Preprocessing error:', error);
      throw new Error(`Image preprocessing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Batch preprocess images
   */
  async preprocessBatch(
    inputs: Array<string | Buffer>,
    config?: Partial<PreprocessConfig>
  ): Promise<PreprocessResult[]> {
    const results: PreprocessResult[] = [];
    const promises: Promise<PreprocessResult>[] = [];

    // Process in parallel
    for (const input of inputs) {
      promises.push(this.preprocessImage(input, config));
    }

    const batchResults = await Promise.allSettled(promises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('Batch preprocessing error:', result.reason);
        // Return error result
        results.push({
          buffer: Buffer.alloc(0),
          metadata: {
            width: 0,
            height: 0,
            channels: 0,
            format: 'unknown',
            size: 0
          },
          operations: [],
          processingTime: 0
        });
      }
    }

    return results;
  }

  /**
   * Analyze image for optimal preprocessing
   */
  async analyzeImage(input: string | Buffer): Promise<ImageAnalysis> {
    try {
      const image = sharp(input);
      const metadata = await image.metadata();
      const stats = await image.stats();

      // Calculate brightness (mean of all channels)
      const brightness = stats.channels.reduce((sum: number, ch: any) => sum + ch.mean, 0) / stats.channels.length;

      // Calculate contrast (standard deviation)
      const contrast = stats.channels.reduce((sum: number, ch: any) => sum + ch.stdev, 0) / stats.channels.length;

      // Estimate sharpness using edge detection
      const sharpness = await this.estimateSharpness(input);

      // Estimate noise
      const noise = await this.estimateNoise(input);

      // Detect skew angle
      const skew = await this.detectSkew(input);

      // Get histogram
      const histogram = await this.getHistogram(input);

      // Detect dominant colors
      const dominantColors = await this.getDominantColors(input);

      // Detect text regions
      const hasText = await this.detectTextRegions(input);

      return {
        brightness: brightness / 255 * 100,
        contrast: contrast / 128 * 100,
        sharpness,
        noise,
        skew,
        histogram,
        dominantColors,
        hasText
      };

    } catch (error) {
      console.error('Image analysis error:', error);
      throw new Error(`Image analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Auto-preprocess based on analysis
   */
  async autoPreprocess(input: string | Buffer): Promise<PreprocessResult> {
    try {
      // Analyze image
      const analysis = await this.analyzeImage(input);

      // Build optimal configuration
      const config = this.buildOptimalConfig(analysis);

      // Apply preprocessing
      return await this.preprocessImage(input, config);

    } catch (error) {
      console.error('Auto-preprocessing error:', error);
      throw new Error(`Auto-preprocessing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Denoise image
   */
  async denoise(
    input: string | Buffer,
    config?: DenoiseConfig
  ): Promise<Buffer> {
    try {
      const pipeline = sharp(input);
      
      // Apply median filter for noise reduction
      const medianSize = Math.round((config?.strength || 5) / 2);
      if (medianSize > 0) {
        pipeline.median(medianSize);
      }

      // Apply slight blur if needed
      if (config?.strength && config.strength > 5) {
        pipeline.blur(0.5);
      }

      return await pipeline.toBuffer();

    } catch (error) {
      console.error('Denoise error:', error);
      throw error;
    }
  }

  /**
   * Apply threshold
   */
  async threshold(
    input: string | Buffer,
    config: ThresholdConfig
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(input);

      // Convert to grayscale first
      pipeline = pipeline.grayscale();

      // Apply threshold based on method
      switch (config.method) {
        case ThresholdMethod.BINARY:
          pipeline = pipeline.threshold(config.value || 128);
          break;

        case ThresholdMethod.OTSU:
          // Otsu's method - auto threshold
          const metadata = await sharp(input).metadata();
          const stats = await sharp(input).stats();
          const otsuValue = this.calculateOtsuThreshold(stats);
          pipeline = pipeline.threshold(otsuValue);
          break;

        case ThresholdMethod.ADAPTIVE_MEAN:
        case ThresholdMethod.ADAPTIVE_GAUSSIAN:
          // Adaptive thresholding requires custom implementation
          return await this.adaptiveThreshold(input, config);

        default:
          pipeline = pipeline.threshold(128);
      }

      return await pipeline.toBuffer();

    } catch (error) {
      console.error('Threshold error:', error);
      throw error;
    }
  }

  /**
   * Enhance contrast
   */
  async enhanceContrast(
    input: string | Buffer,
    config?: ContrastConfig
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(input);

      // Apply linear contrast
      if (config?.method === 'linear' || !config?.method) {
        pipeline = pipeline.linear(
          config?.factor || 1.2,
          -(128 * (config?.factor || 1.2 - 1))
        );
      }

      // Apply normalize for auto contrast
      if (config?.method === 'clahe') {
        pipeline = pipeline.normalize();
      }

      // Apply gamma correction if needed
      if (config?.method === 'sigmoid') {
        pipeline = pipeline.gamma(2.2);
      }

      return await pipeline.toBuffer();

    } catch (error) {
      console.error('Contrast enhancement error:', error);
      throw error;
    }
  }

  /**
   * Deskew image
   */
  async deskew(
    input: string | Buffer,
    config?: DeskewConfig
  ): Promise<Buffer> {
    try {
      // Detect skew angle
      const angle = await this.detectSkew(input);

      if (Math.abs(angle) < (config?.threshold || 0.5)) {
        // No significant skew
        return Buffer.isBuffer(input) ? input : await sharp(input).toBuffer();
      }

      // Apply rotation
      let pipeline = sharp(input).rotate(-angle, {
        background: config?.background || '#ffffff'
      });

      // Auto crop if requested
      if (config?.autoCrop) {
        pipeline = pipeline.trim();
      }

      return await pipeline.toBuffer();

    } catch (error) {
      console.error('Deskew error:', error);
      throw error;
    }
  }

  /**
   * Apply morphological operations
   */
  async applyMorphology(
    input: string | Buffer,
    config: MorphologyConfig
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(input);

      // Convert to grayscale for morphology
      pipeline = pipeline.grayscale();

      // Apply operation
      switch (config.operation) {
        case MorphologyOperation.ERODE:
          // Erosion - minimum filter
          pipeline = pipeline.median(config.size || 3);
          break;

        case MorphologyOperation.DILATE:
          // Dilation - maximum filter
          pipeline = pipeline.blur(config.size || 1);
          break;

        case MorphologyOperation.OPEN:
          // Opening - erosion followed by dilation
          pipeline = pipeline.median(config.size || 3).blur(config.size || 1);
          break;

        case MorphologyOperation.CLOSE:
          // Closing - dilation followed by erosion
          pipeline = pipeline.blur(config.size || 1).median(config.size || 3);
          break;

        default:
          break;
      }

      return await pipeline.toBuffer();

    } catch (error) {
      console.error('Morphology error:', error);
      throw error;
    }
  }

  // ============================
  // Private Methods
  // ============================

  /**
   * Get default preprocessing configuration
   */
  private getDefaultConfig(): PreprocessConfig {
    return {
      operations: [
        PreprocessOperation.GRAYSCALE,
        PreprocessOperation.DENOISE,
        PreprocessOperation.CONTRAST,
        PreprocessOperation.THRESHOLD
      ],
      denoise: {
        strength: 3,
        preserveEdges: true
      },
      sharpen: {
        sigma: 1.0
      },
      threshold: {
        method: ThresholdMethod.OTSU
      },
      contrast: {
        factor: 1.2,
        method: 'linear'
      },
      brightness: 0,
      gamma: 1.0,
      grayscale: true,
      invert: false,
      outputFormat: ImageFormat.PNG,
      quality: 95
    };
  }

  /**
   * Apply preprocessing operation
   */
  private async applyOperation(
    pipeline: sharp.Sharp,
    operation: PreprocessOperation,
    config: PreprocessConfig
  ): Promise<sharp.Sharp> {
    switch (operation) {
      case PreprocessOperation.GRAYSCALE:
        if (config.grayscale !== false) {
          pipeline = pipeline.grayscale();
        }
        break;

      case PreprocessOperation.DENOISE:
        if (config.denoise) {
          const buffer = await pipeline.toBuffer();
          const denoised = await this.denoise(buffer, config.denoise);
          pipeline = sharp(denoised);
        }
        break;

      case PreprocessOperation.SHARPEN:
        if (config.sharpen) {
          pipeline = pipeline.sharpen(
            config.sharpen.sigma,
            config.sharpen.m1,
            config.sharpen.m2
          );
        }
        break;

      case PreprocessOperation.THRESHOLD:
        if (config.threshold) {
          const buffer = await pipeline.toBuffer();
          const thresholded = await this.threshold(buffer, config.threshold);
          pipeline = sharp(thresholded);
        }
        break;

      case PreprocessOperation.CONTRAST:
        if (config.contrast) {
          const buffer = await pipeline.toBuffer();
          const enhanced = await this.enhanceContrast(buffer, config.contrast);
          pipeline = sharp(enhanced);
        }
        break;

      case PreprocessOperation.BRIGHTNESS:
        if (config.brightness !== undefined && config.brightness !== 0) {
          pipeline = pipeline.modulate({
            brightness: 1 + (config.brightness / 100)
          });
        }
        break;

      case PreprocessOperation.GAMMA:
        if (config.gamma && config.gamma !== 1.0) {
          pipeline = pipeline.gamma(config.gamma);
        }
        break;

      case PreprocessOperation.INVERT:
        if (config.invert) {
          pipeline = pipeline.negate();
        }
        break;

      case PreprocessOperation.DESKEW:
        if (config.deskew) {
          const buffer = await pipeline.toBuffer();
          const deskewed = await this.deskew(buffer, config.deskew);
          pipeline = sharp(deskewed);
        }
        break;

      case PreprocessOperation.MORPHOLOGY:
        if (config.morphology) {
          const buffer = await pipeline.toBuffer();
          const morphed = await this.applyMorphology(buffer, config.morphology);
          pipeline = sharp(morphed);
        }
        break;

      case PreprocessOperation.BLUR:
        if (config.blur) {
          pipeline = pipeline.blur(config.blur.sigma || 1);
        }
        break;

      case PreprocessOperation.MEDIAN:
        if (config.median) {
          pipeline = pipeline.median(config.median);
        }
        break;
    }

    return pipeline;
  }

  /**
   * Convert image format
   */
  private convertFormat(
    pipeline: sharp.Sharp,
    format: ImageFormat,
    quality?: number
  ): sharp.Sharp {
    switch (format) {
      case ImageFormat.PNG:
        return pipeline.png({
          quality: quality || 95,
          compressionLevel: 6
        });

      case ImageFormat.JPEG:
        return pipeline.jpeg({
          quality: quality || 85,
          progressive: true
        });

      case ImageFormat.WEBP:
        return pipeline.webp({
          quality: quality || 85,
          lossless: false
        });

      case ImageFormat.TIFF:
        return pipeline.tiff({
          quality: quality || 95,
          compression: 'lzw'
        });

      default:
        return pipeline;
    }
  }

  /**
   * Calculate Otsu threshold value
   */
  private calculateOtsuThreshold(stats: any): number {
    // Simplified Otsu's method
    // In production, would implement full algorithm
    const mean = stats.channels[0].mean;
    return Math.round(mean * 0.8);
  }

  /**
   * Adaptive threshold implementation
   */
  private async adaptiveThreshold(
    input: string | Buffer,
    config: ThresholdConfig
  ): Promise<Buffer> {
    // Simplified adaptive thresholding
    // In production, would implement proper adaptive methods
    const pipeline = sharp(input)
      .grayscale()
      .normalize()
      .threshold(config.value || 128);

    return await pipeline.toBuffer();
  }

  /**
   * Detect skew angle
   */
  private async detectSkew(input: string | Buffer): Promise<number> {
    try {
      // This would use Hough transform or similar
      // For now, return 0 (no skew)
      return 0;

    } catch (error) {
      console.error('Skew detection error:', error);
      return 0;
    }
  }

  /**
   * Estimate image sharpness
   */
  private async estimateSharpness(input: string | Buffer): Promise<number> {
    try {
      // Apply Laplacian operator and calculate variance
      // Higher variance = sharper image
      const edges = await sharp(input)
        .grayscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0]
        })
        .toBuffer();

      const stats = await sharp(edges).stats();
      const variance = stats.channels[0].stdev;

      // Normalize to 0-100 scale
      return Math.min(100, variance / 128 * 100);

    } catch (error) {
      console.error('Sharpness estimation error:', error);
      return 50;
    }
  }

  /**
   * Estimate noise level
   */
  private async estimateNoise(input: string | Buffer): Promise<number> {
    try {
      // Apply median filter and calculate difference
      const original = sharp(input);
      const filtered = sharp(input).median(3);

      const [origBuffer, filtBuffer] = await Promise.all([
        original.toBuffer(),
        filtered.toBuffer()
      ]);

      // Calculate mean squared error
      let mse = 0;
      const length = Math.min(origBuffer.length, filtBuffer.length);
      
      for (let i = 0; i < length; i++) {
        const diff = origBuffer[i] - filtBuffer[i];
        mse += diff * diff;
      }

      mse /= length;

      // Normalize to 0-100 scale
      return Math.min(100, Math.sqrt(mse) / 255 * 100);

    } catch (error) {
      console.error('Noise estimation error:', error);
      return 10;
    }
  }

  /**
   * Get image histogram
   */
  private async getHistogram(input: string | Buffer): Promise<any> {
    try {
      const stats = await sharp(input).stats();
      
      // Build histogram from stats
      // This is simplified - real implementation would be more detailed
      return {
        luminance: Array(256).fill(0)
      };

    } catch (error) {
      console.error('Histogram error:', error);
      return null;
    }
  }

  /**
   * Get dominant colors
   */
  private async getDominantColors(input: string | Buffer): Promise<Array<{ color: string; percentage: number }>> {
    try {
      const stats = await sharp(input).stats();
      
      // Extract dominant color from stats
      const dominant = stats.dominant;
      
      return [{
        color: `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`,
        percentage: 100
      }];

    } catch (error) {
      console.error('Dominant colors error:', error);
      return [];
    }
  }

  /**
   * Detect text regions
   */
  private async detectTextRegions(input: string | Buffer): Promise<boolean> {
    try {
      // This would use edge detection and connected components
      // For now, assume text is present
      return true;

    } catch (error) {
      console.error('Text region detection error:', error);
      return false;
    }
  }

  /**
   * Calculate improvements
   */
  private async calculateImprovements(
    original: string | Buffer,
    processed: Buffer
  ): Promise<any> {
    try {
      const [origAnalysis, procAnalysis] = await Promise.all([
        this.analyzeImage(original),
        this.analyzeImage(processed)
      ]);

      return {
        contrast: procAnalysis.contrast - origAnalysis.contrast,
        sharpness: procAnalysis.sharpness - origAnalysis.sharpness,
        noise: origAnalysis.noise - procAnalysis.noise
      };

    } catch (error) {
      console.error('Improvement calculation error:', error);
      return {};
    }
  }

  /**
   * Build optimal configuration based on analysis
   */
  private buildOptimalConfig(analysis: ImageAnalysis): Partial<PreprocessConfig> {
    const config: Partial<PreprocessConfig> = {
      operations: []
    };

    // Always convert to grayscale for OCR
    config.operations!.push(PreprocessOperation.GRAYSCALE);

    // Add denoise if needed
    if (analysis.noise > 20) {
      config.operations!.push(PreprocessOperation.DENOISE);
      config.denoise = {
        strength: Math.min(10, analysis.noise / 10),
        preserveEdges: true
      };
    }

    // Add contrast enhancement if needed
    if (analysis.contrast < 50) {
      config.operations!.push(PreprocessOperation.CONTRAST);
      config.contrast = {
        factor: 1.5,
        method: 'linear'
      };
    }

    // Add brightness adjustment if needed
    if (analysis.brightness < 40 || analysis.brightness > 60) {
      config.operations!.push(PreprocessOperation.BRIGHTNESS);
      config.brightness = 50 - analysis.brightness;
    }

    // Add sharpening if needed
    if (analysis.sharpness < 40) {
      config.operations!.push(PreprocessOperation.SHARPEN);
      config.sharpen = {
        sigma: 1.5
      };
    }

    // Add deskew if needed
    if (analysis.skew && Math.abs(analysis.skew) > 1) {
      config.operations!.push(PreprocessOperation.DESKEW);
      config.deskew = {
        threshold: 0.5,
        autoCrop: true
      };
    }

    // Always add threshold for OCR
    config.operations!.push(PreprocessOperation.THRESHOLD);
    config.threshold = {
      method: ThresholdMethod.OTSU
    };

    return config;
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }
}

// Export singleton instance
export default new PreprocessingService();