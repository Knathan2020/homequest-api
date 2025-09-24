import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  density?: number;
  hasAlpha?: boolean;
  orientation?: number;
  colorSpace?: string;
}

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff';
  background?: string;
  withoutEnlargement?: boolean;
  progressive?: boolean;
  compressionLevel?: number;
}

export interface ThumbnailOptions {
  width: number;
  height: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export const SUPPORTED_IMAGE_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/avif',
] as const;

export const IMAGE_SIZE_LIMITS = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxDimension: 10000, // 10000x10000 pixels
  minDimension: 10, // 10x10 pixels
  thumbnailSize: { width: 300, height: 300 },
  previewSize: { width: 800, height: 800 },
  fullSize: { width: 2048, height: 2048 },
} as const;

export class ImageUtils {
  static async validateImage(filePath: string): Promise<{ valid: boolean; error?: string; metadata?: ImageMetadata }> {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > IMAGE_SIZE_LIMITS.maxFileSize) {
        return { 
          valid: false, 
          error: `File size ${stats.size} exceeds maximum allowed size of ${IMAGE_SIZE_LIMITS.maxFileSize} bytes` 
        };
      }

      const metadata = await sharp(filePath).metadata();
      
      if (!metadata.width || !metadata.height) {
        return { valid: false, error: 'Unable to determine image dimensions' };
      }

      if (metadata.width > IMAGE_SIZE_LIMITS.maxDimension || metadata.height > IMAGE_SIZE_LIMITS.maxDimension) {
        return { 
          valid: false, 
          error: `Image dimensions ${metadata.width}x${metadata.height} exceed maximum allowed ${IMAGE_SIZE_LIMITS.maxDimension}x${IMAGE_SIZE_LIMITS.maxDimension}` 
        };
      }

      if (metadata.width < IMAGE_SIZE_LIMITS.minDimension || metadata.height < IMAGE_SIZE_LIMITS.minDimension) {
        return { 
          valid: false, 
          error: `Image dimensions ${metadata.width}x${metadata.height} are below minimum required ${IMAGE_SIZE_LIMITS.minDimension}x${IMAGE_SIZE_LIMITS.minDimension}` 
        };
      }

      const imageMetadata: ImageMetadata = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        size: stats.size,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        colorSpace: metadata.space,
      };

      return { valid: true, metadata: imageMetadata };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown error validating image' 
      };
    }
  }

  static async getMetadata(filePath: string): Promise<ImageMetadata> {
    const [metadata, stats] = await Promise.all([
      sharp(filePath).metadata(),
      fs.stat(filePath),
    ]);

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: stats.size,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation,
      colorSpace: metadata.space,
    };
  }

  static async resize(
    inputPath: string,
    outputPath: string,
    options: ImageProcessingOptions
  ): Promise<ImageMetadata> {
    const pipeline = sharp(inputPath);

    if (options.width || options.height) {
      pipeline.resize({
        width: options.width,
        height: options.height,
        fit: options.fit || 'inside',
        withoutEnlargement: options.withoutEnlargement ?? true,
        background: options.background || { r: 255, g: 255, b: 255, alpha: 0 },
      });
    }

    if (options.format) {
      switch (options.format) {
        case 'jpeg':
          pipeline.jpeg({
            quality: options.quality || 80,
            progressive: options.progressive ?? true,
          });
          break;
        case 'png':
          pipeline.png({
            quality: options.quality || 90,
            compressionLevel: options.compressionLevel || 6,
            progressive: options.progressive ?? true,
          });
          break;
        case 'webp':
          pipeline.webp({
            quality: options.quality || 80,
          });
          break;
        case 'avif':
          pipeline.avif({
            quality: options.quality || 50,
          });
          break;
        case 'tiff':
          pipeline.tiff({
            quality: options.quality || 80,
            compression: 'lzw',
          });
          break;
      }
    }

    await pipeline.toFile(outputPath);
    return this.getMetadata(outputPath);
  }

  static async createThumbnail(
    inputPath: string,
    outputPath: string,
    options: ThumbnailOptions
  ): Promise<ImageMetadata> {
    return this.resize(inputPath, outputPath, {
      width: options.width,
      height: options.height,
      fit: 'inside',
      quality: options.quality || 75,
      format: options.format || 'jpeg',
      withoutEnlargement: true,
    });
  }

  static async createVariants(
    inputPath: string,
    outputDir: string,
    basename: string
  ): Promise<{ thumbnail: string; preview: string; full: string }> {
    await fs.mkdir(outputDir, { recursive: true });

    const ext = path.extname(inputPath);
    const name = basename || path.basename(inputPath, ext);

    const variants = {
      thumbnail: path.join(outputDir, `${name}_thumb.jpg`),
      preview: path.join(outputDir, `${name}_preview.jpg`),
      full: path.join(outputDir, `${name}_full.jpg`),
    };

    await Promise.all([
      this.createThumbnail(inputPath, variants.thumbnail, IMAGE_SIZE_LIMITS.thumbnailSize),
      this.resize(inputPath, variants.preview, {
        ...IMAGE_SIZE_LIMITS.previewSize,
        quality: 85,
        format: 'jpeg',
      }),
      this.resize(inputPath, variants.full, {
        ...IMAGE_SIZE_LIMITS.fullSize,
        quality: 90,
        format: 'jpeg',
      }),
    ]);

    return variants;
  }

  static async convertFormat(
    inputPath: string,
    outputPath: string,
    format: 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff',
    quality: number = 80
  ): Promise<ImageMetadata> {
    return this.resize(inputPath, outputPath, { format, quality });
  }

  static async optimize(
    inputPath: string,
    outputPath: string,
    targetSizeKB?: number
  ): Promise<ImageMetadata> {
    const metadata = await this.getMetadata(inputPath);
    let quality = 85;

    if (targetSizeKB && metadata.size > targetSizeKB * 1024) {
      quality = Math.max(30, Math.min(95, (targetSizeKB * 1024 / metadata.size) * 100));
    }

    const format = metadata.format === 'png' && !metadata.hasAlpha ? 'jpeg' : metadata.format as any;

    return this.resize(inputPath, outputPath, {
      quality,
      format,
      progressive: true,
    });
  }

  static async extractRegion(
    inputPath: string,
    outputPath: string,
    region: { left: number; top: number; width: number; height: number }
  ): Promise<ImageMetadata> {
    await sharp(inputPath)
      .extract(region)
      .toFile(outputPath);

    return this.getMetadata(outputPath);
  }

  static async rotate(
    inputPath: string,
    outputPath: string,
    angle: number
  ): Promise<ImageMetadata> {
    await sharp(inputPath)
      .rotate(angle)
      .toFile(outputPath);

    return this.getMetadata(outputPath);
  }

  static async flip(
    inputPath: string,
    outputPath: string,
    horizontal: boolean = false,
    vertical: boolean = false
  ): Promise<ImageMetadata> {
    let pipeline = sharp(inputPath);
    
    if (horizontal) pipeline = pipeline.flop();
    if (vertical) pipeline = pipeline.flip();

    await pipeline.toFile(outputPath);
    return this.getMetadata(outputPath);
  }

  static async addWatermark(
    inputPath: string,
    watermarkPath: string,
    outputPath: string,
    position: 'center' | 'northwest' | 'northeast' | 'southwest' | 'southeast' = 'southeast'
  ): Promise<ImageMetadata> {
    const gravity = position === 'center' ? 'center' : position;

    await sharp(inputPath)
      .composite([
        {
          input: watermarkPath,
          gravity: gravity as any,
        },
      ])
      .toFile(outputPath);

    return this.getMetadata(outputPath);
  }

  static async grayscale(
    inputPath: string,
    outputPath: string
  ): Promise<ImageMetadata> {
    await sharp(inputPath)
      .grayscale()
      .toFile(outputPath);

    return this.getMetadata(outputPath);
  }

  static async blur(
    inputPath: string,
    outputPath: string,
    sigma: number = 5
  ): Promise<ImageMetadata> {
    await sharp(inputPath)
      .blur(sigma)
      .toFile(outputPath);

    return this.getMetadata(outputPath);
  }

  static async sharpen(
    inputPath: string,
    outputPath: string,
    sigma?: number
  ): Promise<ImageMetadata> {
    await sharp(inputPath)
      .sharpen(sigma)
      .toFile(outputPath);

    return this.getMetadata(outputPath);
  }

  static generateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static async generateFileHash(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return this.generateHash(buffer);
  }

  static isValidMimeType(mimeType: string): boolean {
    return SUPPORTED_IMAGE_FORMATS.includes(mimeType as any);
  }

  static getMimeTypeFromExtension(extension: string): string | null {
    const ext = extension.toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      avif: 'image/avif',
    };
    return mimeMap[ext] || null;
  }

  static getExtensionFromMimeType(mimeType: string): string | null {
    const mimeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/avif': 'avif',
    };
    return mimeMap[mimeType] || null;
  }

  static async toBuffer(filePath: string): Promise<Buffer> {
    return sharp(filePath).toBuffer();
  }

  static async fromBuffer(
    buffer: Buffer,
    outputPath: string,
    options?: ImageProcessingOptions
  ): Promise<ImageMetadata> {
    let pipeline = sharp(buffer);

    if (options?.width || options?.height) {
      pipeline = pipeline.resize({
        width: options.width,
        height: options.height,
        fit: options.fit || 'inside',
      });
    }

    await pipeline.toFile(outputPath);
    return this.getMetadata(outputPath);
  }

  static async getBase64(filePath: string, mimeType?: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const mime = mimeType || this.getMimeTypeFromExtension(path.extname(filePath)) || 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  static async fromBase64(
    base64String: string,
    outputPath: string
  ): Promise<ImageMetadata> {
    const matches = base64String.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 string');
    }

    const buffer = Buffer.from(matches[2], 'base64');
    await sharp(buffer).toFile(outputPath);
    return this.getMetadata(outputPath);
  }
}

export default ImageUtils;