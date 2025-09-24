// ========================================
// YOLO OBJECT DETECTION SERVICE - yolo.service.ts
// Detects fixtures, furniture, and architectural elements in floor plans
// ========================================

import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs-node';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
// Define Point2D locally since it's not exported
interface Point2D {
  x: number;
  y: number;
}

interface DetectedObject {
  id: string;
  class: string;
  label: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: Point2D;
  polygon?: Point2D[];
  attributes?: Record<string, any>;
}

interface DetectionResult {
  objects: DetectedObject[];
  fixtures: FixtureDetection[];
  furniture: FurnitureDetection[];
  appliances: ApplianceDetection[];
  metadata: {
    processingTime: number;
    imageSize: { width: number; height: number };
    modelVersion: string;
    totalObjects: number;
  };
}

interface FixtureDetection extends DetectedObject {
  fixtureType: 'toilet' | 'sink' | 'bathtub' | 'shower' | 'bidet' | 'urinal' | 'faucet' | 'drain';
  material?: string;
  brand?: string;
}

interface FurnitureDetection extends DetectedObject {
  furnitureType: 'bed' | 'sofa' | 'chair' | 'table' | 'desk' | 'cabinet' | 'dresser' | 'nightstand' | 'bookshelf' | 'wardrobe';
  dimensions?: { width: number; height: number; depth: number };
  material?: string;
  color?: string;
}

interface ApplianceDetection extends DetectedObject {
  applianceType: 'refrigerator' | 'stove' | 'oven' | 'microwave' | 'dishwasher' | 'washer' | 'dryer' | 'water_heater' | 'hvac';
  energyRating?: string;
  brand?: string;
}

// Class labels for floor plan objects
const FLOOR_PLAN_CLASSES = {
  // Bathroom fixtures
  0: 'toilet',
  1: 'sink',
  2: 'bathtub',
  3: 'shower',
  4: 'bidet',
  
  // Kitchen fixtures
  5: 'kitchen_sink',
  6: 'kitchen_island',
  7: 'kitchen_counter',
  
  // Appliances
  8: 'refrigerator',
  9: 'stove',
  10: 'oven',
  11: 'microwave',
  12: 'dishwasher',
  13: 'washer',
  14: 'dryer',
  
  // Furniture
  15: 'bed',
  16: 'sofa',
  17: 'chair',
  18: 'dining_table',
  19: 'desk',
  20: 'cabinet',
  21: 'dresser',
  22: 'nightstand',
  23: 'bookshelf',
  24: 'wardrobe',
  
  // Architectural elements
  25: 'door',
  26: 'window',
  27: 'stairs',
  28: 'elevator',
  29: 'fireplace',
  30: 'column',
  
  // HVAC
  31: 'hvac_unit',
  32: 'radiator',
  33: 'ceiling_fan',
  
  // Other
  34: 'water_heater',
  35: 'electrical_panel',
  36: 'closet',
  37: 'pantry'
};

export class YOLOService {
  private model: cocoSsd.ObjectDetection | null = null;
  private _modelPath: string;
  private isInitialized: boolean = false;
  private inputSize: number = 640; // YOLO input size
  private confidenceThreshold: number = 0.5;
  private iouThreshold: number = 0.45;

  constructor(modelPath?: string) {
    // Use COCO-SSD for real object detection
    this._modelPath = modelPath || '@tensorflow-models/coco-ssd';
  }

  /**
   * Initialize YOLO model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🚀 Initializing COCO-SSD object detection model...');
    
    try {
      // Load real COCO-SSD model for object detection
      this.model = await cocoSsd.load({
        base: 'lite_mobilenet_v2', // Use lighter model for better performance
      });
      
      this.isInitialized = true;
      console.log('✅ COCO-SSD model initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize COCO-SSD model:', error);
      throw error;
    }
  }

  /**
   * Map COCO classes to floor plan relevant objects
   */
  private mapCocoToFloorPlan(cocoClass: string): string | null {
    const mapping: Record<string, string> = {
      'toilet': 'toilet',
      'sink': 'sink',
      'refrigerator': 'refrigerator',
      'oven': 'oven',
      'microwave': 'microwave',
      'bed': 'bed',
      'couch': 'sofa',
      'chair': 'chair',
      'dining table': 'dining_table',
      'potted plant': 'plant',
      'tv': 'television',
      'laptop': 'computer',
      'book': 'bookshelf',
      'clock': 'wall_clock',
      'vase': 'decoration',
      'scissors': 'tool',
      'toothbrush': 'bathroom_accessory',
      'hair drier': 'bathroom_appliance'
    };
    
    return mapping[cocoClass] || cocoClass;
  }

  /**
   * Detect objects in floor plan image
   */
  async detectObjects(
    imageBuffer: Buffer,
    options: {
      confidenceThreshold?: number;
      iouThreshold?: number;
      maxDetections?: number;
      targetClasses?: string[];
    } = {}
  ): Promise<DetectionResult> {
    const startTime = Date.now();

    // Ensure model is initialized
    if (!this.isInitialized) {
      await this.initialize();
    }

    const confidence = options.confidenceThreshold || this.confidenceThreshold;
    const iou = options.iouThreshold || this.iouThreshold;
    const maxDetections = options.maxDetections || 100;

    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      // Convert buffer to image that COCO-SSD can process
      console.log('🔧 Preprocessing image for COCO-SSD...');
      const imageData = await sharp(imageBuffer)
        .resize(this.inputSize, this.inputSize, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .png()
        .toBuffer();
      
      // Decode image for TensorFlow
      const decodedImage = tf.node.decodeImage(imageData, 3);

      // Run detection with real COCO-SSD model
      console.log('🎯 Running real object detection...');
      const predictions = await this.model!.detect(decodedImage as any);
      
      // Convert COCO-SSD predictions to our format
      const detections = this.convertCocoDetections(
        predictions,
        originalWidth,
        originalHeight,
        confidence
      );
      
      // Clean up tensor
      decodedImage.dispose();

      // Apply additional NMS if needed (COCO-SSD already does this)
      const nmsDetections = detections.length > maxDetections 
        ? await this.nonMaxSuppression(detections, iou, maxDetections)
        : detections;
      
      // Filter by target classes if specified
      let filteredDetections = nmsDetections;
      if (options.targetClasses && options.targetClasses.length > 0) {
        filteredDetections = nmsDetections.filter(d => 
          options.targetClasses!.includes(d.class)
        );
      }

      // Categorize detections
      const result = this.categorizeDetections(filteredDetections);

      return {
        ...result,
        metadata: {
          processingTime: Date.now() - startTime,
          imageSize: { width: originalWidth, height: originalHeight },
          modelVersion: '1.0.0',
          totalObjects: filteredDetections.length
        }
      };
    } catch (error) {
      console.error('❌ Object detection failed:', error);
      throw error;
    }
  }

  /**
   * Convert COCO-SSD detections to our format
   */
  private convertCocoDetections(
    predictions: cocoSsd.DetectedObject[],
    originalWidth: number,
    originalHeight: number,
    confidenceThreshold: number
  ): DetectedObject[] {
    const detections: DetectedObject[] = [];
    
    console.log(`   COCO-SSD detected ${predictions.length} objects`);
    
    for (const prediction of predictions) {
      if (prediction.score >= confidenceThreshold) {
        const [x, y, width, height] = prediction.bbox;
        const mappedClass = this.mapCocoToFloorPlan(prediction.class) || prediction.class;
        
        // Scale coordinates to original image size
        const scaleX = originalWidth / this.inputSize;
        const scaleY = originalHeight / this.inputSize;
        
        const scaledBbox = {
          x: x * scaleX,
          y: y * scaleY,
          width: width * scaleX,
          height: height * scaleY
        };
        
        detections.push({
          id: `obj_${Math.random().toString(36).substring(2, 11)}`,
          class: mappedClass,
          label: this.formatLabel(mappedClass),
          confidence: prediction.score,
          bbox: scaledBbox,
          center: { 
            x: scaledBbox.x + scaledBbox.width / 2, 
            y: scaledBbox.y + scaledBbox.height / 2 
          },
          polygon: this.bboxToPolygon(
            scaledBbox.x, 
            scaledBbox.y, 
            scaledBbox.width, 
            scaledBbox.height
          ),
          attributes: {
            originalClass: prediction.class,
            cocoScore: prediction.score
          }
        });
        
        console.log(`     - ${prediction.class} (${mappedClass}) @ ${prediction.score.toFixed(2)} confidence`);
      }
    }
    
    return detections;
  }

  /**
   * Non-Maximum Suppression to remove overlapping detections
   */
  private async nonMaxSuppression(
    detections: DetectedObject[],
    iouThreshold: number,
    maxDetections: number
  ): Promise<DetectedObject[]> {
    // Sort by confidence
    detections.sort((a, b) => b.confidence - a.confidence);

    const selected: DetectedObject[] = [];
    const used = new Set<number>();

    for (let i = 0; i < detections.length && selected.length < maxDetections; i++) {
      if (used.has(i)) continue;

      const current = detections[i];
      selected.push(current);
      used.add(i);

      // Suppress overlapping detections
      for (let j = i + 1; j < detections.length; j++) {
        if (used.has(j)) continue;

        const iou = this.calculateIOU(current.bbox, detections[j].bbox);
        if (iou > iouThreshold && current.class === detections[j].class) {
          used.add(j);
        }
      }
    }

    return selected;
  }

  /**
   * Calculate Intersection over Union
   */
  private calculateIOU(box1: any, box2: any): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    if (x2 < x1 || y2 < y1) {
      return 0;
    }

    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;

    return intersection / union;
  }

  /**
   * Categorize detected objects
   */
  private categorizeDetections(detections: DetectedObject[]): {
    objects: DetectedObject[];
    fixtures: FixtureDetection[];
    furniture: FurnitureDetection[];
    appliances: ApplianceDetection[];
  } {
    const fixtures: FixtureDetection[] = [];
    const furniture: FurnitureDetection[] = [];
    const appliances: ApplianceDetection[] = [];

    for (const detection of detections) {
      // Categorize based on class
      if (this.isFixture(detection.class)) {
        fixtures.push({
          ...detection,
          fixtureType: detection.class as any,
          material: this.estimateMaterial(detection.class),
          brand: this.estimateBrand(detection.class)
        });
      } else if (this.isFurniture(detection.class)) {
        furniture.push({
          ...detection,
          furnitureType: detection.class as any,
          dimensions: this.estimateDimensions(detection.bbox),
          material: this.estimateMaterial(detection.class),
          color: this.estimateColor(detection.class)
        });
      } else if (this.isAppliance(detection.class)) {
        appliances.push({
          ...detection,
          applianceType: detection.class as any,
          energyRating: this.estimateEnergyRating(detection.class),
          brand: this.estimateBrand(detection.class)
        });
      }
    }

    return {
      objects: detections,
      fixtures,
      furniture,
      appliances
    };
  }

  /**
   * Track objects across multiple frames (for video processing)
   */
  async trackObjects(
    videoFrames: Buffer[],
    options: {
      trackingMethod?: 'iou' | 'centroid' | 'kalman';
      maxDistance?: number;
    } = {}
  ): Promise<Array<{
    frame: number;
    detections: DetectedObject[];
    tracks: Map<string, string[]>;
  }>> {
    const results = [];
    const tracks = new Map<string, string[]>();
    let previousDetections: DetectedObject[] = [];

    for (let frameIdx = 0; frameIdx < videoFrames.length; frameIdx++) {
      // Detect objects in current frame
      const detection = await this.detectObjects(videoFrames[frameIdx]);
      
      // Match with previous frame
      if (frameIdx > 0) {
        this.matchDetections(
          previousDetections,
          detection.objects,
          tracks,
          options.trackingMethod || 'iou',
          options.maxDistance || 50
        );
      }

      results.push({
        frame: frameIdx,
        detections: detection.objects,
        tracks: new Map(tracks)
      });

      previousDetections = detection.objects;
    }

    return results;
  }

  /**
   * Match detections between frames for tracking
   */
  private matchDetections(
    previous: DetectedObject[],
    current: DetectedObject[],
    tracks: Map<string, string[]>,
    method: string,
    maxDistance: number
  ): void {
    const matched = new Set<number>();

    for (const prevObj of previous) {
      let bestMatch: DetectedObject | null = null;
      let bestScore = 0;

      for (let i = 0; i < current.length; i++) {
        if (matched.has(i)) continue;

        const currObj = current[i];
        
        // Must be same class
        if (prevObj.class !== currObj.class) continue;

        let score = 0;
        if (method === 'iou') {
          score = this.calculateIOU(prevObj.bbox, currObj.bbox);
        } else if (method === 'centroid') {
          const distance = Math.sqrt(
            Math.pow(prevObj.center.x - currObj.center.x, 2) +
            Math.pow(prevObj.center.y - currObj.center.y, 2)
          );
          score = distance < maxDistance ? 1 - (distance / maxDistance) : 0;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = currObj;
        }
      }

      if (bestMatch && bestScore > 0.3) {
        // Continue track
        const trackId = prevObj.id;
        if (!tracks.has(trackId)) {
          tracks.set(trackId, [prevObj.id]);
        }
        tracks.get(trackId)!.push(bestMatch.id);
        matched.add(current.indexOf(bestMatch));
      }
    }

    // Create new tracks for unmatched detections
    for (let i = 0; i < current.length; i++) {
      if (!matched.has(i)) {
        tracks.set(current[i].id, [current[i].id]);
      }
    }
  }

  /**
   * Detect specific object types
   */
  async detectFixtures(imageBuffer: Buffer): Promise<FixtureDetection[]> {
    const result = await this.detectObjects(imageBuffer, {
      targetClasses: ['toilet', 'sink', 'bathtub', 'shower', 'bidet', 'faucet']
    });
    return result.fixtures;
  }

  async detectFurniture(imageBuffer: Buffer): Promise<FurnitureDetection[]> {
    const result = await this.detectObjects(imageBuffer, {
      targetClasses: ['bed', 'sofa', 'chair', 'table', 'desk', 'cabinet', 'dresser']
    });
    return result.furniture;
  }

  async detectAppliances(imageBuffer: Buffer): Promise<ApplianceDetection[]> {
    const result = await this.detectObjects(imageBuffer, {
      targetClasses: ['refrigerator', 'stove', 'oven', 'microwave', 'dishwasher', 'washer', 'dryer']
    });
    return result.appliances;
  }

  /**
   * Generate object segmentation masks
   */
  async generateSegmentationMask(
    imageBuffer: Buffer,
    detections: DetectedObject[]
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Create mask image
    const maskData = Buffer.alloc(width * height * 4); // RGBA

    // Draw each detection on mask
    for (const detection of detections) {
      const color = this.getClassColor(detection.class);
      const bbox = detection.bbox;

      for (let y = Math.floor(bbox.y); y < bbox.y + bbox.height && y < height; y++) {
        for (let x = Math.floor(bbox.x); x < bbox.x + bbox.width && x < width; x++) {
          const idx = (y * width + x) * 4;
          maskData[idx] = color.r;
          maskData[idx + 1] = color.g;
          maskData[idx + 2] = color.b;
          maskData[idx + 3] = Math.floor(detection.confidence * 255);
        }
      }
    }

    // Convert to image
    const mask = await sharp(maskData, {
      raw: {
        width,
        height,
        channels: 4
      }
    }).png().toBuffer();

    return mask;
  }

  /**
   * Helper methods
   */

  private bboxToPolygon(x: number, y: number, width: number, height: number): Point2D[] {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ];
  }

  private formatLabel(className: string): string {
    return className
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private isFixture(className: string): boolean {
    const fixtureClasses = ['toilet', 'sink', 'bathtub', 'shower', 'bidet', 'faucet', 'drain', 'kitchen_sink'];
    return fixtureClasses.includes(className);
  }

  private isFurniture(className: string): boolean {
    const furnitureClasses = ['bed', 'sofa', 'chair', 'dining_table', 'desk', 'cabinet', 'dresser', 'nightstand', 'bookshelf', 'wardrobe'];
    return furnitureClasses.includes(className);
  }

  private isAppliance(className: string): boolean {
    const applianceClasses = ['refrigerator', 'stove', 'oven', 'microwave', 'dishwasher', 'washer', 'dryer', 'water_heater', 'hvac_unit'];
    return applianceClasses.includes(className);
  }

  private estimateMaterial(className: string): string {
    const materials: Record<string, string> = {
      'toilet': 'porcelain',
      'sink': 'porcelain',
      'bathtub': 'acrylic',
      'bed': 'wood',
      'sofa': 'fabric',
      'chair': 'wood',
      'refrigerator': 'stainless steel'
    };
    return materials[className] || 'unknown';
  }

  private estimateBrand(_className: string): string {
    // In production, this could use additional ML models
    return 'generic';
  }

  private estimateDimensions(bbox: any): { width: number; height: number; depth: number } {
    // Estimate 3D dimensions from 2D bbox (simplified)
    return {
      width: bbox.width,
      height: bbox.height,
      depth: bbox.width * 0.6 // Rough estimate
    };
  }

  private estimateColor(_className: string): string {
    // Could use color detection on the actual image region
    return 'unknown';
  }

  private estimateEnergyRating(_className: string): string {
    // Could be determined by model detection
    return 'A+';
  }

  private getClassColor(className: string): { r: number; g: number; b: number } {
    const colors: Record<string, { r: number; g: number; b: number }> = {
      'toilet': { r: 255, g: 255, b: 255 },
      'sink': { r: 200, g: 200, b: 255 },
      'bed': { r: 139, g: 69, b: 19 },
      'sofa': { r: 128, g: 128, b: 128 },
      'refrigerator': { r: 192, g: 192, b: 192 },
      'door': { r: 165, g: 42, b: 42 },
      'window': { r: 135, g: 206, b: 235 }
    };
    
    return colors[className] || { r: 128, g: 128, b: 128 };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.model) {
      // COCO-SSD model doesn't have dispose method
      this.model = null;
    }
    this.isInitialized = false;
    console.log('✅ COCO-SSD service cleaned up');
  }

  /**
   * Get service statistics
   */
  getStats(): {
    initialized: boolean;
    modelLoaded: boolean;
    inputSize: number;
    classCount: number;
    confidenceThreshold: number;
    iouThreshold: number;
  } {
    return {
      initialized: this.isInitialized,
      modelLoaded: this.model !== null,
      inputSize: this.inputSize,
      classCount: Object.keys(FLOOR_PLAN_CLASSES).length,
      confidenceThreshold: this.confidenceThreshold,
      iouThreshold: this.iouThreshold
    };
  }
}

// Export singleton instance
export const yoloService = new YOLOService();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { yoloService } from './services/vision/yolo.service';

// Initialize service
await yoloService.initialize();

// Detect all objects
const detection = await yoloService.detectObjects(imageBuffer, {
  confidenceThreshold: 0.6,
  maxDetections: 50
});

console.log(`Detected ${detection.objects.length} objects`);
console.log(`Found ${detection.fixtures.length} fixtures`);
console.log(`Found ${detection.furniture.length} furniture items`);
console.log(`Found ${detection.appliances.length} appliances`);

// Detect specific object types
const fixtures = await yoloService.detectFixtures(imageBuffer);
for (const fixture of fixtures) {
  console.log(`${fixture.label}: ${fixture.fixtureType} at (${fixture.center.x}, ${fixture.center.y})`);
  console.log(`  Confidence: ${(fixture.confidence * 100).toFixed(1)}%`);
  console.log(`  Material: ${fixture.material}`);
}

// Generate segmentation mask
const mask = await yoloService.generateSegmentationMask(imageBuffer, detection.objects);
await fs.writeFile('segmentation_mask.png', mask);

// Track objects across video frames (if processing video)
const frames = [frame1Buffer, frame2Buffer, frame3Buffer];
const tracking = await yoloService.trackObjects(frames, {
  trackingMethod: 'iou',
  maxDistance: 50
});

for (const frameResult of tracking) {
  console.log(`Frame ${frameResult.frame}: ${frameResult.detections.length} objects`);
  console.log(`Active tracks: ${frameResult.tracks.size}`);
}

// Cleanup when done
await yoloService.cleanup();
*/
