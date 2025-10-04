import * as fs from 'fs';
import * as path from 'path';
import * as tf from '@tensorflow/tfjs-node';
// import { VisionAnalysis } from './vision/integrated-vision.service';
interface VisionAnalysis {
  walls?: any[];
  rooms?: any[];
  doors?: any[];
  windows?: any[];
  measurements?: any[] | {
    scale?: number;
    unit?: string;
    dimensions?: Array<{
      value: number;
      unit: string;
      position: { x: number; y: number };
    }>;
  };
  mlEnhanced?: boolean;
  modelVersion?: string;
  processedSamples?: number;
  overallConfidence?: number;
}

interface TrainingData {
  walls: Array<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    thickness: number;
    style: string;
  }>;
  rooms: Array<{
    boundary: Array<{ x: number; y: number }>;
    type: string;
    area: number;
    features: {
      doorCount: number;
      windowCount: number;
      aspectRatio: number;
    };
  }>;
  imageFeatures: number[];
}

export class RealMLTrainingService {
  private trainingDataPath = path.join(process.cwd(), 'training-data');
  private modelsPath = path.join(process.cwd(), 'models');
  private wallModel: tf.Sequential | null = null;
  private roomModel: tf.Sequential | null = null;
  private trainingData: TrainingData[] = [];

  constructor() {
    this.ensureDirectories();
    this.loadExistingData();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.trainingDataPath)) {
      fs.mkdirSync(this.trainingDataPath, { recursive: true });
    }
    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }
  }

  private loadExistingData() {
    const dataFile = path.join(this.trainingDataPath, 'extracted-features.json');
    if (fs.existsSync(dataFile)) {
      try {
        this.trainingData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        console.log(`Loaded ${this.trainingData.length} training samples`);
      } catch (error) {
        console.error('Failed to load training data:', error);
      }
    }
  }

  /**
   * Extract actual features from detection results and save for training
   */
  public async extractAndSaveFeatures(
    detectionResult: VisionAnalysis,
    imagePath: string
  ): Promise<void> {
    try {
      const features: TrainingData = {
        walls: [],
        rooms: [],
        imageFeatures: []
      };

      // Extract wall features with actual coordinates
      if (detectionResult.walls && detectionResult.walls.length > 0) {
        features.walls = detectionResult.walls.map(wall => ({
          start: { x: wall.start?.x || 0, y: wall.start?.y || 0 },
          end: { x: wall.end?.x || 0, y: wall.end?.y || 0 },
          thickness: this.calculateWallThickness(wall),
          style: this.detectWallStyle(wall)
        }));
      }

      // Extract room features with actual boundaries
      if (detectionResult.rooms && detectionResult.rooms.length > 0) {
        features.rooms = detectionResult.rooms.map(room => {
          const boundary = room.boundary || room.vertices || [];
          const area = this.calculateArea(boundary);
          const aspectRatio = this.calculateAspectRatio(boundary);
          
          return {
            boundary: boundary,
            type: room.type || 'unknown',
            area: area,
            features: {
              doorCount: room.doors?.length || 0,
              windowCount: room.windows?.length || 0,
              aspectRatio: aspectRatio
            }
          };
        });
      }

      // Extract global image features
      features.imageFeatures = this.extractImageFeatures(detectionResult);

      // Save to training data
      this.trainingData.push(features);
      
      // Persist to disk
      const dataFile = path.join(this.trainingDataPath, 'extracted-features.json');
      fs.writeFileSync(dataFile, JSON.stringify(this.trainingData, null, 2));

      // Save individual sample for debugging
      const sampleFile = path.join(
        this.trainingDataPath,
        `sample-${Date.now()}.json`
      );
      fs.writeFileSync(sampleFile, JSON.stringify({
        imagePath,
        features,
        timestamp: new Date().toISOString()
      }, null, 2));

      console.log(`Extracted features from ${imagePath}: ${features.walls.length} walls, ${features.rooms.length} rooms`);

      // Train models if we have enough data
      if (this.trainingData.length >= 100 && this.trainingData.length % 100 === 0) {
        await this.trainModels();
      }
    } catch (error) {
      console.error('Error extracting features:', error);
    }
  }

  private calculateWallThickness(wall: any): number {
    if (wall.thickness) return wall.thickness;
    
    // Calculate from line properties
    const length = Math.sqrt(
      Math.pow((wall.end?.x || 0) - (wall.start?.x || 0), 2) +
      Math.pow((wall.end?.y || 0) - (wall.start?.y || 0), 2)
    );
    
    // Estimate thickness based on detection confidence
    return wall.confidence > 0.8 ? 10 : 5;
  }

  private detectWallStyle(wall: any): string {
    if (wall.style) return wall.style;
    
    // Analyze wall properties
    if (wall.isDouble) return 'double';
    if (wall.thickness > 10) return 'thick';
    if (wall.thickness < 5) return 'thin';
    return 'standard';
  }

  private calculateArea(boundary: Array<{ x: number; y: number }>): number {
    if (!boundary || boundary.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < boundary.length; i++) {
      const j = (i + 1) % boundary.length;
      area += boundary[i].x * boundary[j].y;
      area -= boundary[j].x * boundary[i].y;
    }
    return Math.abs(area / 2);
  }

  private calculateAspectRatio(boundary: Array<{ x: number; y: number }>): number {
    if (!boundary || boundary.length < 2) return 1;
    
    const xs = boundary.map(p => p.x);
    const ys = boundary.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    
    if (height === 0) return 1;
    return width / height;
  }

  private extractImageFeatures(detection: VisionAnalysis): number[] {
    return [
      detection.walls?.length || 0,
      detection.rooms?.length || 0,
      detection.doors?.length || 0,
      detection.windows?.length || 0,
      detection.overallConfidence || 0,
      // Add more global features
      this.calculateTotalWallLength(detection.walls),
      this.calculateAverageRoomSize(detection.rooms),
      this.calculateWallDensity(detection)
    ];
  }

  private calculateTotalWallLength(walls: any[]): number {
    if (!walls) return 0;
    return walls.reduce((total, wall) => {
      const length = Math.sqrt(
        Math.pow((wall.end?.x || 0) - (wall.start?.x || 0), 2) +
        Math.pow((wall.end?.y || 0) - (wall.start?.y || 0), 2)
      );
      return total + length;
    }, 0);
  }

  private calculateAverageRoomSize(rooms: any[]): number {
    if (!rooms || rooms.length === 0) return 0;
    const totalArea = rooms.reduce((sum, room) => {
      const boundary = room.boundary || room.vertices || [];
      return sum + this.calculateArea(boundary);
    }, 0);
    return totalArea / rooms.length;
  }

  private calculateWallDensity(detection: VisionAnalysis): number {
    const wallCount = detection.walls?.length || 0;
    const roomCount = detection.rooms?.length || 0;
    if (roomCount === 0) return 0;
    return wallCount / roomCount;
  }

  /**
   * Train ML models on extracted features
   */
  public async trainModels(): Promise<void> {
    if (this.trainingData.length < 50) {
      console.log(`Need at least 50 samples to train, currently have ${this.trainingData.length}`);
      return;
    }

    console.log(`Training models with ${this.trainingData.length} samples...`);

    try {
      // Train wall detection model
      await this.trainWallModel();
      
      // Train room classification model
      await this.trainRoomModel();

      console.log('Models trained successfully!');
    } catch (error) {
      console.error('Training failed:', error);
    }
  }

  private async trainWallModel() {
    // Prepare wall training data
    const wallFeatures: number[][] = [];
    const wallLabels: number[][] = [];

    this.trainingData.forEach(sample => {
      if (sample.walls.length > 0) {
        sample.walls.forEach(wall => {
          // Input: normalized coordinates and image features
          wallFeatures.push([
            wall.start.x / 1000,
            wall.start.y / 1000,
            wall.end.x / 1000,
            wall.end.y / 1000,
            ...sample.imageFeatures.map(f => f / 100)
          ]);
          
          // Output: thickness and style encoded
          wallLabels.push([
            wall.thickness / 20, // Normalize thickness
            wall.style === 'thick' ? 1 : 0,
            wall.style === 'thin' ? 1 : 0,
            wall.style === 'double' ? 1 : 0
          ]);
        });
      }
    });

    if (wallFeatures.length === 0) return;

    // Create and train wall model
    this.wallModel = tf.sequential({
      layers: [
        tf.layers.dense({ units: 64, activation: 'relu', inputShape: [wallFeatures[0].length] }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: wallLabels[0].length, activation: 'sigmoid' })
      ]
    });

    this.wallModel.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    const xs = tf.tensor2d(wallFeatures);
    const ys = tf.tensor2d(wallLabels);

    await this.wallModel.fit(xs, ys, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(`Wall model epoch ${epoch}: loss=${logs?.loss?.toFixed(4)}`);
          }
        }
      }
    });

    // Save model
    await this.wallModel.save(`file://${this.modelsPath}/wall-model`);
    
    xs.dispose();
    ys.dispose();
  }

  private async trainRoomModel() {
    // Prepare room training data
    const roomFeatures: number[][] = [];
    const roomLabels: number[][] = [];

    const roomTypes = ['bedroom', 'bathroom', 'kitchen', 'living_room', 'dining_room', 'office', 'hallway', 'closet', 'unknown'];
    
    this.trainingData.forEach(sample => {
      if (sample.rooms.length > 0) {
        sample.rooms.forEach(room => {
          // Input features: area, aspect ratio, door/window counts
          roomFeatures.push([
            room.area / 1000,
            room.features.aspectRatio,
            room.features.doorCount / 5,
            room.features.windowCount / 5,
            ...sample.imageFeatures.map(f => f / 100)
          ]);
          
          // Output: one-hot encoded room type
          const label = new Array(roomTypes.length).fill(0);
          const typeIndex = roomTypes.indexOf(room.type);
          if (typeIndex >= 0) label[typeIndex] = 1;
          else label[roomTypes.length - 1] = 1; // Unknown
          roomLabels.push(label);
        });
      }
    });

    if (roomFeatures.length === 0) return;

    // Create and train room model
    this.roomModel = tf.sequential({
      layers: [
        tf.layers.dense({ units: 128, activation: 'relu', inputShape: [roomFeatures[0].length] }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: roomTypes.length, activation: 'softmax' })
      ]
    });

    this.roomModel.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    const xs = tf.tensor2d(roomFeatures);
    const ys = tf.tensor2d(roomLabels);

    await this.roomModel.fit(xs, ys, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 20 === 0) {
            console.log(`Room model epoch ${epoch}: loss=${logs?.loss?.toFixed(4)}, accuracy=${logs?.acc?.toFixed(4)}`);
          }
        }
      }
    });

    // Save model
    await this.roomModel.save(`file://${this.modelsPath}/room-model`);
    
    xs.dispose();
    ys.dispose();
  }

  /**
   * Load trained models for inference
   */
  public async loadModels(): Promise<boolean> {
    try {
      const wallModelPath = `file://${this.modelsPath}/wall-model/model.json`;
      const roomModelPath = `file://${this.modelsPath}/room-model/model.json`;

      if (fs.existsSync(path.join(this.modelsPath, 'wall-model', 'model.json'))) {
        this.wallModel = await tf.loadLayersModel(wallModelPath) as tf.Sequential;
        console.log('Loaded wall detection model');
      }

      if (fs.existsSync(path.join(this.modelsPath, 'room-model', 'model.json'))) {
        this.roomModel = await tf.loadLayersModel(roomModelPath) as tf.Sequential;
        console.log('Loaded room classification model');
      }

      return this.wallModel !== null || this.roomModel !== null;
    } catch (error) {
      console.error('Failed to load models:', error);
      return false;
    }
  }

  /**
   * Apply trained models to enhance detection
   */
  public async enhanceWithML(detection: VisionAnalysis): Promise<VisionAnalysis> {
    const enhanced = { ...detection };

    // Apply wall model if available
    if (this.wallModel && detection.walls) {
      enhanced.walls = await this.enhanceWalls(detection.walls, detection);
    }

    // Apply room model if available
    if (this.roomModel && detection.rooms) {
      enhanced.rooms = await this.enhanceRooms(detection.rooms, detection);
    }

    enhanced.mlEnhanced = true;
    enhanced.modelVersion = this.getModelVersion();

    return enhanced;
  }

  private async enhanceWalls(walls: any[], detection: VisionAnalysis): Promise<any[]> {
    if (!this.wallModel) return walls;

    const imageFeatures = this.extractImageFeatures(detection);
    
    return await Promise.all(walls.map(async wall => {
      const input = tf.tensor2d([[
        (wall.start?.x || 0) / 1000,
        (wall.start?.y || 0) / 1000,
        (wall.end?.x || 0) / 1000,
        (wall.end?.y || 0) / 1000,
        ...imageFeatures.map(f => f / 100)
      ]]);

      const prediction = this.wallModel!.predict(input) as tf.Tensor;
      const result = await prediction.array() as number[][];
      
      input.dispose();
      prediction.dispose();

      return {
        ...wall,
        thickness: result[0][0] * 20,
        style: this.interpretWallStyle(result[0]),
        mlConfidence: Math.max(...result[0])
      };
    }));
  }

  private interpretWallStyle(prediction: number[]): string {
    const styles = ['standard', 'thick', 'thin', 'double'];
    const maxIndex = prediction.slice(1).indexOf(Math.max(...prediction.slice(1)));
    return styles[maxIndex] || 'standard';
  }

  private async enhanceRooms(rooms: any[], detection: VisionAnalysis): Promise<any[]> {
    if (!this.roomModel) return rooms;

    const roomTypes = ['bedroom', 'bathroom', 'kitchen', 'living_room', 'dining_room', 'office', 'hallway', 'closet', 'unknown'];
    const imageFeatures = this.extractImageFeatures(detection);
    
    return await Promise.all(rooms.map(async room => {
      const boundary = room.boundary || room.vertices || [];
      const area = this.calculateArea(boundary);
      const aspectRatio = this.calculateAspectRatio(boundary);

      const input = tf.tensor2d([[
        area / 1000,
        aspectRatio,
        (room.doors?.length || 0) / 5,
        (room.windows?.length || 0) / 5,
        ...imageFeatures.map(f => f / 100)
      ]]);

      const prediction = this.roomModel!.predict(input) as tf.Tensor;
      const result = await prediction.array() as number[][];
      
      input.dispose();
      prediction.dispose();

      const maxIndex = result[0].indexOf(Math.max(...result[0]));
      const confidence = result[0][maxIndex];

      return {
        ...room,
        type: roomTypes[maxIndex],
        confidence: confidence,
        mlPrediction: true,
        allProbabilities: Object.fromEntries(
          roomTypes.map((type, i) => [type, result[0][i]])
        )
      };
    }));
  }

  private getModelVersion(): string {
    return `v1.0-${this.trainingData.length}-samples`;
  }

  public getTrainingStats() {
    return {
      totalSamples: this.trainingData.length,
      totalWalls: this.trainingData.reduce((sum, d) => sum + d.walls.length, 0),
      totalRooms: this.trainingData.reduce((sum, d) => sum + d.rooms.length, 0),
      hasWallModel: this.wallModel !== null,
      hasRoomModel: this.roomModel !== null,
      modelVersion: this.getModelVersion()
    };
  }
}