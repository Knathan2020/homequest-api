// ========================================
// MODEL RETRAINER SERVICE - model-retrainer.service.ts
// Retrains YOLO and OCR models with learned data
// ========================================

import * as fs from 'fs';
import * as path from 'path';
import { ragLearningService } from './rag-learning.service';
import * as sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TrainingDataPoint {
  imageId: string;
  imagePath: string;
  annotations: {
    walls: Array<{ x1: number; y1: number; x2: number; y2: number; confidence: number }>;
    doors: Array<{ x: number; y: number; width: number; height: number }>;
    windows: Array<{ x: number; y: number; width: number; height: number }>;
    rooms: Array<{ 
      type: string; 
      polygon: Array<{ x: number; y: number }>; 
      label: string 
    }>;
    text: Array<{ 
      text: string; 
      bbox: { x: number; y: number; width: number; height: number } 
    }>;
  };
  corrections: {
    added: any[];
    deleted: any[];
    modified: any[];
  };
}

export class ModelRetrainerService {
  private datasetDir: string;
  private yoloDataDir: string;
  private ocrDataDir: string;
  private modelsDir: string;
  
  constructor() {
    this.datasetDir = path.join(process.cwd(), 'training-datasets');
    this.yoloDataDir = path.join(this.datasetDir, 'yolo');
    this.ocrDataDir = path.join(this.datasetDir, 'ocr');
    this.modelsDir = path.join(process.cwd(), 'fine-tuned-models');
    
    this.ensureDirectories();
  }
  
  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    [this.datasetDir, this.yoloDataDir, this.ocrDataDir, this.modelsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    });
    
    // Create YOLO subdirectories
    ['images', 'labels', 'images/train', 'images/val', 'labels/train', 'labels/val'].forEach(subdir => {
      const fullPath = path.join(this.yoloDataDir, subdir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }
  
  /**
   * Export RAG learning data to training formats
   */
  public async exportTrainingData(): Promise<{yolo: number, ocr: number}> {
    console.log('📤 Exporting training data from RAG learning...');
    
    // Load all learning sessions
    const sessions = ragLearningService.loadLearningData(1000); // Load up to 1000 sessions
    console.log(`📊 Found ${sessions.length} learning sessions to export`);
    
    let yoloCount = 0;
    let ocrCount = 0;
    
    for (const session of sessions) {
      if (session.walls && session.walls.length > 0) {
        // Export for YOLO training
        yoloCount += await this.exportYOLOData(session);
      }
      
      if (session.measurements && session.measurements.length > 0) {
        // Export for OCR training
        ocrCount += await this.exportOCRData(session);
      }
    }
    
    // Create YOLO dataset configuration
    await this.createYOLOConfig();
    
    console.log(`✅ Exported ${yoloCount} YOLO samples, ${ocrCount} OCR samples`);
    return { yolo: yoloCount, ocr: ocrCount };
  }
  
  /**
   * Export session data in YOLO format
   */
  private async exportYOLOData(session: any): Promise<number> {
    const imageId = session.imageHash || session.id;
    let exported = 0;
    
    // Create YOLO annotations (normalized coordinates)
    const annotations: string[] = [];
    
    // Walls - class 0
    session.walls?.forEach((wall: any) => {
      if (!wall.isDeleted) {
        const coords = this.normalizeCoordinates(wall.coordinates || wall);
        if (coords) {
          // Convert line to bounding box
          const bbox = this.lineToBBox(coords);
          annotations.push(`0 ${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
        }
      }
    });
    
    // Doors - class 1
    session.doors?.forEach((door: any) => {
      if (!door.isDeleted && door.position) {
        const norm = this.normalizePoint(door.position);
        const width = (door.width || 30) / 1000; // Normalize width
        annotations.push(`1 ${norm.x} ${norm.y} ${width} 0.05`);
      }
    });
    
    // Windows - class 2
    session.windows?.forEach((window: any) => {
      if (!window.isDeleted && window.position) {
        const norm = this.normalizePoint(window.position);
        const width = (window.width || 40) / 1000;
        annotations.push(`2 ${norm.x} ${norm.y} ${width} 0.05`);
      }
    });
    
    // Rooms - class 3
    session.rooms?.forEach((room: any) => {
      if (!room.isDeleted && room.vertices) {
        const bbox = this.polygonToBBox(room.vertices);
        if (bbox) {
          annotations.push(`3 ${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
        }
      }
    });
    
    if (annotations.length > 0) {
      // Save to train or val set (80/20 split)
      const isTraining = Math.random() < 0.8;
      const subset = isTraining ? 'train' : 'val';
      
      // Save label file
      const labelPath = path.join(this.yoloDataDir, 'labels', subset, `${imageId}.txt`);
      fs.writeFileSync(labelPath, annotations.join('\n'));
      
      exported = 1;
    }
    
    return exported;
  }
  
  /**
   * Export session data for OCR training
   */
  private async exportOCRData(session: any): Promise<number> {
    const imageId = session.imageHash || session.id;
    let exported = 0;
    
    const ocrData = {
      imageId,
      textAnnotations: [] as any[]
    };
    
    // Extract text measurements
    session.measurements?.forEach((measurement: any) => {
      if (measurement.type === 'text' && measurement.value) {
        ocrData.textAnnotations.push({
          text: measurement.value,
          location: measurement.location,
          confidence: measurement.confidence || 0.8
        });
      }
    });
    
    // Extract room labels
    session.rooms?.forEach((room: any) => {
      if (room.name && room.labelPosition) {
        ocrData.textAnnotations.push({
          text: room.name,
          location: room.labelPosition,
          type: 'room_label'
        });
      }
    });
    
    if (ocrData.textAnnotations.length > 0) {
      const ocrPath = path.join(this.ocrDataDir, `${imageId}.json`);
      fs.writeFileSync(ocrPath, JSON.stringify(ocrData, null, 2));
      exported = 1;
    }
    
    return exported;
  }
  
  /**
   * Create YOLO dataset configuration
   */
  private async createYOLOConfig(): Promise<void> {
    const config = {
      path: this.yoloDataDir,
      train: 'images/train',
      val: 'images/val',
      nc: 4, // Number of classes
      names: ['wall', 'door', 'window', 'room']
    };
    
    const configPath = path.join(this.yoloDataDir, 'dataset.yaml');
    const yamlContent = `
path: ${config.path}
train: ${config.train}
val: ${config.val}

nc: ${config.nc}
names: ${JSON.stringify(config.names)}
`;
    
    fs.writeFileSync(configPath, yamlContent);
    console.log('📝 Created YOLO dataset configuration');
  }
  
  /**
   * Fine-tune YOLO model with exported data
   */
  public async fineTuneYOLO(epochs: number = 50): Promise<void> {
    console.log('🎯 Starting YOLO fine-tuning...');
    
    // Check if we have training data
    const trainImages = fs.readdirSync(path.join(this.yoloDataDir, 'images/train'));
    if (trainImages.length === 0) {
      throw new Error('No training data available. Export data first.');
    }
    
    // Create training script
    const scriptPath = path.join(this.datasetDir, 'train_yolo.py');
    const script = `
import torch
from ultralytics import YOLO
import os

# Load pre-trained model
model = YOLO('yolov8n.pt')  # Using nano model for faster training

# Fine-tune on our dataset
results = model.train(
    data='${path.join(this.yoloDataDir, 'dataset.yaml')}',
    epochs=${epochs},
    imgsz=640,
    batch=16,
    name='floor_plan_model',
    project='${this.modelsDir}',
    exist_ok=True,
    pretrained=True,
    optimizer='SGD',
    lr0=0.01,
    lrf=0.01,
    momentum=0.937,
    weight_decay=0.0005,
    warmup_epochs=3.0,
    warmup_momentum=0.8,
    warmup_bias_lr=0.1,
    box=0.05,
    cls=0.5,
    cls_pw=1.0,
    obj=1.0,
    obj_pw=1.0,
    iou_t=0.20,
    anchor_t=4.0,
    fl_gamma=0.0,
    hsv_h=0.015,
    hsv_s=0.7,
    hsv_v=0.4,
    degrees=0.0,
    translate=0.1,
    scale=0.5,
    shear=0.0,
    perspective=0.0,
    flipud=0.0,
    fliplr=0.5,
    mosaic=1.0,
    mixup=0.0,
    copy_paste=0.0
)

print(f"✅ Model trained! Best weights saved to: {model.trainer.best}")
`;
    
    fs.writeFileSync(scriptPath, script);
    
    try {
      // Execute training
      console.log('🚀 Training YOLO model...');
      const { stdout, stderr } = await execAsync(`python ${scriptPath}`);
      console.log('📊 Training output:', stdout);
      if (stderr) console.error('⚠️ Training warnings:', stderr);
      
      console.log('✅ YOLO model fine-tuning complete!');
    } catch (error) {
      console.error('❌ YOLO training failed:', error);
      throw error;
    }
  }
  
  /**
   * Fine-tune OCR model with exported data
   */
  public async fineTuneOCR(): Promise<void> {
    console.log('📝 Starting OCR fine-tuning...');
    
    // For Tesseract, we need to create training data in specific format
    // This is more complex and requires tesseract training tools
    
    const ocrFiles = fs.readdirSync(this.ocrDataDir).filter(f => f.endsWith('.json'));
    if (ocrFiles.length === 0) {
      throw new Error('No OCR training data available');
    }
    
    // Create ground truth files for Tesseract
    for (const file of ocrFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(this.ocrDataDir, file), 'utf-8'));
      const baseName = path.basename(file, '.json');
      
      // Create .gt.txt file with ground truth text
      const gtText = data.textAnnotations.map((a: any) => a.text).join('\n');
      const gtPath = path.join(this.ocrDataDir, `${baseName}.gt.txt`);
      fs.writeFileSync(gtPath, gtText);
    }
    
    console.log(`✅ Prepared ${ocrFiles.length} OCR training samples`);
    console.log('ℹ️ OCR fine-tuning requires Tesseract training tools');
    console.log('   Run: tesseract [image] [output] lstm.train');
  }
  
  /**
   * Deploy fine-tuned models
   */
  public async deployModels(): Promise<void> {
    console.log('🚀 Deploying fine-tuned models...');
    
    // Find latest trained model
    const modelDirs = fs.readdirSync(this.modelsDir).filter(d => 
      d.startsWith('floor_plan_model')
    );
    
    if (modelDirs.length === 0) {
      throw new Error('No trained models found');
    }
    
    // Get latest model
    const latestModel = modelDirs.sort().pop();
    const weightsPath = path.join(this.modelsDir, latestModel!, 'weights/best.pt');
    
    if (!fs.existsSync(weightsPath)) {
      throw new Error('Model weights not found');
    }
    
    // Copy to deployment location
    const deployPath = path.join(process.cwd(), 'models/yolo_floor_plan_best.pt');
    fs.copyFileSync(weightsPath, deployPath);
    
    console.log(`✅ Deployed model to: ${deployPath}`);
    console.log('ℹ️ Update detection service to use: models/yolo_floor_plan_best.pt');
  }
  
  /**
   * Get training statistics
   */
  public getTrainingStats(): any {
    const stats = {
      datasetsExported: {
        yolo: 0,
        ocr: 0
      },
      modelsTrains: [],
      lastTraining: null
    };
    
    // Count YOLO labels
    if (fs.existsSync(path.join(this.yoloDataDir, 'labels/train'))) {
      stats.datasetsExported.yolo = fs.readdirSync(
        path.join(this.yoloDataDir, 'labels/train')
      ).length;
    }
    
    // Count OCR data
    if (fs.existsSync(this.ocrDataDir)) {
      stats.datasetsExported.ocr = fs.readdirSync(this.ocrDataDir)
        .filter(f => f.endsWith('.json')).length;
    }
    
    // Find trained models
    if (fs.existsSync(this.modelsDir)) {
      stats.modelsTrains = fs.readdirSync(this.modelsDir)
        .filter(d => d.startsWith('floor_plan_model'));
    }
    
    return stats;
  }
  
  // Utility methods
  private normalizeCoordinates(coords: any): any {
    // Normalize to 0-1 range (assuming 1000x1000 canvas)
    return {
      x1: (coords.x1 || 0) / 1000,
      y1: (coords.y1 || 0) / 1000,
      x2: (coords.x2 || 0) / 1000,
      y2: (coords.y2 || 0) / 1000
    };
  }
  
  private normalizePoint(point: any): any {
    return {
      x: (point.x || 0) / 1000,
      y: (point.y || 0) / 1000
    };
  }
  
  private lineToBBox(line: any): any {
    const cx = (line.x1 + line.x2) / 2;
    const cy = (line.y1 + line.y2) / 2;
    const width = Math.abs(line.x2 - line.x1);
    const height = Math.abs(line.y2 - line.y1);
    
    return { x: cx, y: cy, width, height };
  }
  
  private polygonToBBox(vertices: any[]): any {
    if (!vertices || vertices.length < 3) return null;
    
    const xs = vertices.map(v => v.x / 1000);
    const ys = vertices.map(v => v.y / 1000);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;
    
    return { x: cx, y: cy, width, height };
  }
}

export const modelRetrainer = new ModelRetrainerService();