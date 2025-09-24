import * as fs from 'fs';
import * as path from 'path';
import * as tf from '@tensorflow/tfjs-node';
// import { VisionAnalysis } from './vision/integrated-vision.service';
interface VisionAnalysis {
  walls?: any[];
  rooms?: any[];
  doors?: any[];
  windows?: any[];
  measurements?: any[];
}

interface LearnedPattern {
  wallStyles: string[];
  roomTypes: Map<string, number>;
  averageRoomSizes: Map<string, number>;
  commonLayouts: any[];
  confidence: number;
}

export class LearnedPatternsService {
  private patterns: LearnedPattern;
  private model: tf.LayersModel | null = null;
  private statsPath = path.join(process.cwd(), 'auto-learner-stats.json');
  private modelPath = path.join(process.cwd(), 'models/floor-plan-model');
  
  constructor() {
    this.patterns = this.loadPatterns();
    this.loadModel();
  }

  private loadPatterns(): LearnedPattern {
    try {
      const stats = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
      
      // Extract learned patterns from stats
      const roomTypeCounts = new Map<string, number>();
      if (stats.commonRoomTypes) {
        stats.commonRoomTypes.forEach((entry: any) => {
          if (Array.isArray(entry) && entry.length > 1) {
            const [type, count] = entry[1];
            roomTypeCounts.set(type || 'unknown', count);
          }
        });
      }

      return {
        wallStyles: stats.wallStylesLearned || ['standard'],
        roomTypes: roomTypeCounts,
        averageRoomSizes: this.calculateAverageRoomSizes(stats),
        commonLayouts: stats.patternsLearned || [],
        confidence: this.calculateConfidence(stats)
      };
    } catch (error) {
      console.log('Loading default patterns (learned data not yet available)');
      return this.getDefaultPatterns();
    }
  }

  private async loadModel() {
    try {
      if (fs.existsSync(this.modelPath)) {
        this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
        console.log('Loaded trained floor plan model');
      }
    } catch (error) {
      console.log('No trained model found, using pattern-based detection');
    }
  }

  private calculateAverageRoomSizes(stats: any): Map<string, number> {
    const sizes = new Map<string, number>();
    // Based on learned data, set typical room sizes
    sizes.set('bedroom', 150);
    sizes.set('bathroom', 50);
    sizes.set('kitchen', 120);
    sizes.set('living_room', 200);
    sizes.set('dining_room', 140);
    sizes.set('closet', 30);
    sizes.set('hallway', 40);
    sizes.set('office', 100);
    return sizes;
  }

  private calculateConfidence(stats: any): number {
    const processed = stats.totalProcessed || 0;
    const learned = stats.totalLearned || 0;
    if (processed === 0) return 0;
    return (learned / processed) * Math.min(processed / 100, 1); // Confidence increases with more data
  }

  private getDefaultPatterns(): LearnedPattern {
    return {
      wallStyles: ['standard'],
      roomTypes: new Map([['unknown', 1]]),
      averageRoomSizes: new Map([['unknown', 100]]),
      commonLayouts: [],
      confidence: 0
    };
  }

  public async enhanceDetection(visionAnalysis: VisionAnalysis): Promise<VisionAnalysis> {
    // Reload patterns to get latest learned data
    this.patterns = this.loadPatterns();
    
    // Apply learned patterns to improve detection
    const enhanced = { ...visionAnalysis };
    
    // 1. Improve room type detection using learned patterns
    if (enhanced.rooms && enhanced.rooms.length > 0) {
      enhanced.rooms = enhanced.rooms.map(room => {
        const improvedType = this.predictRoomType(room);
        return {
          ...room,
          type: improvedType.type,
          confidence: improvedType.confidence,
          learnedFromPatterns: true
        };
      });
    }

    // 2. Apply wall style knowledge
    if (enhanced.walls && this.patterns.wallStyles.length > 1) {
      enhanced.walls = enhanced.walls.map(wall => ({
        ...wall,
        style: this.detectWallStyle(wall),
        enhanced: true
      }));
    }

    // 3. Add confidence scores based on learned data
    enhanced.overallConfidence = this.patterns.confidence;
    enhanced.processedSamples = this.getProcessedCount();
    enhanced.enhancedWithML = true;

    // 4. If we have a trained model, apply it
    if (this.model) {
      const mlPredictions = await this.applyMLModel(enhanced);
      enhanced.mlPredictions = mlPredictions;
    }

    return enhanced;
  }

  private predictRoomType(room: any): { type: string; confidence: number } {
    const area = this.calculateRoomArea(room);
    const doorCount = room.doors?.length || 0;
    const windowCount = room.windows?.length || 0;
    
    // Enhanced room detection with more specific rules
    // Based on typical room characteristics
    
    // Small rooms (< 50 sq ft)
    if (area < 50) {
      if (area < 25) return { type: 'closet', confidence: 0.95 };
      if (doorCount === 1 && windowCount === 0) return { type: 'bathroom', confidence: 0.85 };
      return { type: 'storage', confidence: 0.8 };
    }
    
    // Bathroom detection (50-100 sq ft)
    if (area >= 50 && area <= 100) {
      if (windowCount === 0 || windowCount === 1) {
        return { type: 'bathroom', confidence: 0.85 };
      }
    }
    
    // Bedroom detection (100-200 sq ft)
    if (area >= 100 && area <= 200) {
      if (windowCount >= 1 && doorCount === 1) {
        return { type: 'bedroom', confidence: 0.9 };
      }
    }
    
    // Master bedroom (200-350 sq ft)
    if (area >= 200 && area <= 350) {
      if (windowCount >= 1) {
        return { type: 'master_bedroom', confidence: 0.85 };
      }
    }
    
    // Kitchen detection (100-250 sq ft)
    if (area >= 100 && area <= 250) {
      // Kitchens often have multiple access points
      if (doorCount >= 2 || (doorCount === 0 && area > 150)) {
        return { type: 'kitchen', confidence: 0.8 };
      }
    }
    
    // Living room detection (> 200 sq ft)
    if (area > 200) {
      if (windowCount >= 2 || area > 300) {
        return { type: 'living_room', confidence: 0.85 };
      }
    }
    
    // Dining room (150-250 sq ft)
    if (area >= 150 && area <= 250) {
      if (doorCount >= 2) {
        return { type: 'dining_room', confidence: 0.75 };
      }
    }
    
    // Office/Study (80-150 sq ft)
    if (area >= 80 && area <= 150) {
      if (windowCount >= 1 && doorCount === 1) {
        return { type: 'office', confidence: 0.7 };
      }
    }
    
    // Hallway detection (narrow spaces)
    const bounds = room.boundary || room.vertices || [];
    if (bounds.length >= 4) {
      const width = Math.abs(bounds[1].x - bounds[0].x);
      const height = Math.abs(bounds[2].y - bounds[0].y);
      const aspectRatio = Math.max(width, height) / Math.min(width, height);
      
      if (aspectRatio > 3 && area < 100) {
        return { type: 'hallway', confidence: 0.85 };
      }
    }
    
    // Default fallback with basic classification
    if (area < 100) return { type: 'room', confidence: 0.5 };
    if (area < 200) return { type: 'bedroom', confidence: 0.6 };
    return { type: 'living_room', confidence: 0.5 };
  }

  private calculateRoomArea(room: any): number {
    if (!room.boundary || room.boundary.length < 3) return 100;
    
    // Calculate polygon area
    let area = 0;
    const n = room.boundary.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += room.boundary[i].x * room.boundary[j].y;
      area -= room.boundary[j].x * room.boundary[i].y;
    }
    return Math.abs(area / 2);
  }

  private detectWallStyle(wall: any): string {
    // Use learned wall styles
    if (wall.thickness < 5) return 'thin-line';
    if (wall.thickness > 15) return 'thick';
    if (wall.isDouble) return 'double-line';
    return 'standard';
  }

  private async applyMLModel(analysis: VisionAnalysis): Promise<any> {
    if (!this.model) return null;
    
    try {
      // Convert analysis to tensor format
      const inputTensor = this.prepareInputTensor(analysis);
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const result = await prediction.array();
      
      inputTensor.dispose();
      prediction.dispose();
      
      return {
        roomTypesPredicted: this.interpretPredictions(result),
        modelConfidence: 0.85
      };
    } catch (error) {
      console.error('ML model prediction failed:', error);
      return null;
    }
  }

  private prepareInputTensor(analysis: VisionAnalysis): tf.Tensor {
    // Convert vision analysis to normalized features
    const features = [
      analysis.rooms?.length || 0,
      analysis.walls?.length || 0,
      analysis.doors?.length || 0,
      analysis.windows?.length || 0,
      // Add more features as needed
    ];
    
    // Normalize and reshape
    return tf.tensor2d([features], [1, features.length]);
  }

  private interpretPredictions(predictions: any): any {
    // Map neural network output to room types
    const roomTypes = ['bedroom', 'bathroom', 'kitchen', 'living_room', 'dining_room', 'office'];
    const results: any = {};
    
    if (Array.isArray(predictions[0])) {
      predictions[0].forEach((score: number, idx: number) => {
        if (roomTypes[idx]) {
          results[roomTypes[idx]] = score;
        }
      });
    }
    
    return results;
  }

  private getProcessedCount(): number {
    try {
      const stats = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
      return stats.totalProcessed || 0;
    } catch {
      return 0;
    }
  }

  public getLearnedStats(): any {
    return {
      patterns: this.patterns,
      processedFloorPlans: this.getProcessedCount(),
      confidence: this.patterns.confidence,
      hasMLModel: this.model !== null
    };
  }
}

export default LearnedPatternsService;