// ========================================
// AUTO LEARNER SERVICE - auto-learner.service.ts
// Automatically fetches and learns from floor plan URLs
// ========================================

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { createHash } from 'crypto';
import RealDetectionService from './real-detection.service';
import { ragLearningService } from './rag-learning.service';
import { RealMLTrainingService } from './real-ml-training.service';
import { ModelRetrainerService } from './model-retrainer.service';

interface QueuedFloorPlan {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source?: string;
  metadata?: any;
  addedAt: Date;
  processedAt?: Date;
  error?: string;
  results?: any;
}

interface LearningStats {
  totalProcessed: number;
  totalLearned: number;
  totalFailed: number;
  patternsLearned: string[];
  lastProcessed?: Date;
  averageWallsPerPlan: number;
  commonRoomTypes: Map<string, number>;
  wallStylesLearned: string[];
}

export class AutoLearnerService {
  private queueFile: string;
  private tempDir: string;
  private statsFile: string;
  private queue: QueuedFloorPlan[] = [];
  private isProcessing: boolean = false;
  private detectionService: RealDetectionService;
  private mlTrainingService: RealMLTrainingService;
  private modelRetrainerService: ModelRetrainerService;
  private learningStats: LearningStats;
  private processInterval: NodeJS.Timeout | null = null;
  private lastRetrainTime: Date = new Date();
  
  constructor() {
    this.queueFile = path.join(process.cwd(), 'auto-learner-queue.json');
    this.tempDir = path.join(process.cwd(), 'temp-floor-plans');
    this.statsFile = path.join(process.cwd(), 'auto-learner-stats.json');
    this.detectionService = new RealDetectionService();
    this.mlTrainingService = new RealMLTrainingService();
    this.modelRetrainerService = new ModelRetrainerService();
    
    // Initialize
    this.ensureDirectories();
    this.loadQueue();
    this.loadStats();
    
    const loadedStats = this.loadStats();
    this.learningStats = loadedStats || {
      totalProcessed: 0,
      totalLearned: 0,
      totalFailed: 0,
      patternsLearned: [],
      averageWallsPerPlan: 0,
      commonRoomTypes: new Map(),
      wallStylesLearned: []
    };
  }
  
  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      console.log('📁 Created temp directory for floor plans');
    }
  }
  
  /**
   * Load queue from file
   */
  private loadQueue(): void {
    if (fs.existsSync(this.queueFile)) {
      try {
        const data = fs.readFileSync(this.queueFile, 'utf-8');
        this.queue = JSON.parse(data);
        console.log(`📋 Loaded ${this.queue.length} URLs from queue`);
      } catch (error) {
        console.error('Error loading queue:', error);
        this.queue = [];
      }
    }
  }
  
  /**
   * Save queue to file
   */
  private saveQueue(): void {
    try {
      fs.writeFileSync(this.queueFile, JSON.stringify(this.queue, null, 2));
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  }
  
  /**
   * Load learning stats
   */
  private loadStats(): LearningStats | null {
    if (fs.existsSync(this.statsFile)) {
      try {
        const data = fs.readFileSync(this.statsFile, 'utf-8');
        const parsed = JSON.parse(data);
        // Convert commonRoomTypes array back to Map
        if (parsed.commonRoomTypes && Array.isArray(parsed.commonRoomTypes)) {
          parsed.commonRoomTypes = new Map(parsed.commonRoomTypes);
        } else {
          parsed.commonRoomTypes = new Map();
        }
        return parsed;
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    }
    return null;
  }
  
  /**
   * Save learning stats
   */
  private saveStats(): void {
    try {
      // Convert Map to object for JSON serialization
      const statsToSave = {
        ...this.learningStats,
        commonRoomTypes: Array.from(this.learningStats.commonRoomTypes.entries())
      };
      fs.writeFileSync(this.statsFile, JSON.stringify(statsToSave, null, 2));
    } catch (error) {
      console.error('Error saving stats:', error);
    }
  }
  
  /**
   * Add URLs to the queue
   */
  public addUrls(urls: string[], source: string = 'manual'): number {
    let addedCount = 0;
    
    urls.forEach(url => {
      // Check if URL already in queue
      if (!this.queue.find(q => q.url === url)) {
        const queueItem: QueuedFloorPlan = {
          id: `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          url: url.trim(),
          status: 'pending',
          source,
          addedAt: new Date()
        };
        
        this.queue.push(queueItem);
        addedCount++;
      }
    });
    
    this.saveQueue();
    console.log(`➕ Added ${addedCount} new URLs to queue (${this.queue.length} total)`);
    return addedCount;
  }
  
  /**
   * Start automatic processing
   */
  public startProcessing(intervalMs: number = 30000): void {
    if (this.isProcessing) {
      console.log('⚠️ Auto-learner already running');
      return;
    }
    
    this.isProcessing = true;
    console.log('🤖 Starting auto-learner...');
    
    // Process immediately
    this.processNext();
    
    // Then process on interval
    this.processInterval = setInterval(() => {
      this.processNext();
    }, intervalMs);
  }
  
  /**
   * Stop automatic processing
   */
  public stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    this.isProcessing = false;
    console.log('🛑 Stopped auto-learner');
  }
  
  /**
   * Process next item in queue
   */
  private async processNext(): Promise<void> {
    // Find next pending item
    const nextItem = this.queue.find(q => q.status === 'pending');
    
    if (!nextItem) {
      console.log('💤 No pending URLs to process');
      return;
    }
    
    console.log(`\n🔄 Processing: ${nextItem.url}`);
    nextItem.status = 'processing';
    this.saveQueue();
    
    try {
      // 1. Download the image
      const imagePath = await this.downloadImage(nextItem.url, nextItem.id);
      
      // 2. Process with detection service
      console.log('🔍 Running detection...');
      const detectionResult = await this.detectionService.detectFloorPlan(imagePath);
      
      // 3. START RAG LEARNING SESSION
      const imageHash = createHash('md5').update(fs.readFileSync(imagePath)).digest('hex');
      const sessionId = ragLearningService.startSession(imageHash);
      
      // 4. Add detected features to RAG learning
      if (detectionResult.walls && detectionResult.walls.length > 0) {
        ragLearningService.addWallData(detectionResult.walls, 'ai-detection');
        console.log(`📚 Added ${detectionResult.walls.length} walls to RAG learning`);
      }
      
      if (detectionResult.rooms && detectionResult.rooms.length > 0) {
        ragLearningService.addRoomData(detectionResult.rooms, 'ai-detection');
        console.log(`📚 Added ${detectionResult.rooms.length} rooms to RAG learning`);
      }
      
      if (detectionResult.doors && detectionResult.doors.length > 0) {
        ragLearningService.addDoorData(detectionResult.doors, 'ai-detection');
      }
      
      if (detectionResult.windows && detectionResult.windows.length > 0) {
        ragLearningService.addWindowData(detectionResult.windows, 'ai-detection');
      }
      
      // 5. Save RAG learning session
      const addedTime = nextItem.addedAt instanceof Date ? nextItem.addedAt.getTime() : new Date(nextItem.addedAt).getTime();
      const processingTime = Date.now() - addedTime;
      ragLearningService.saveSession(processingTime);
      console.log(`💾 Saved RAG learning session: ${sessionId}`);
      
      // 6. Extract and save REAL features for ML training
      await this.mlTrainingService.extractAndSaveFeatures(detectionResult, imagePath);
      
      // 7. Extract learning insights (legacy stats)
      const insights = this.extractInsights(detectionResult);
      
      // 8. Update stats
      this.updateStats(insights);
      
      // 9. Check if we should retrain models (every 100 processed items)
      if (this.learningStats.totalProcessed > 0 && this.learningStats.totalProcessed % 100 === 0) {
        console.log('🔄 Triggering model retraining after 100 new samples...');
        this.triggerModelRetraining();
      }
      
      // 10. Apply learned patterns to improve detection
      const patterns = ragLearningService.analyzePatterns();
      if (patterns.confidence > 30) {
        const improvedResult = ragLearningService.autoApplyCorrections(detectionResult);
        if (improvedResult.autoApplied) {
          console.log(`🤖 Applied RAG corrections: ${improvedResult.removedCount} removed, ${improvedResult.suggestedCount} suggested`);
          // Update the result with improvements
          Object.assign(detectionResult, improvedResult);
        }
      }
      
      // 11. Mark as completed
      nextItem.status = 'completed';
      nextItem.processedAt = new Date();
      nextItem.results = {
        wallsFound: detectionResult.walls?.length || 0,
        roomsFound: detectionResult.rooms?.length || 0,
        doorsFound: detectionResult.doors?.length || 0,
        insights,
        ragApplied: patterns.confidence > 30
      };
      
      console.log(`✅ Successfully processed: ${detectionResult.walls?.length || 0} walls found`);
      
      // 6. Clean up temp file
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      
    } catch (error) {
      console.error(`❌ Failed to process ${nextItem.url}:`, error);
      nextItem.status = 'failed';
      nextItem.error = error.message;
      this.learningStats.totalFailed++;
    }
    
    this.saveQueue();
    this.saveStats();
  }
  
  /**
   * Download image from URL or copy from local path
   */
  private async downloadImage(url: string, id: string): Promise<string> {
    console.log('📥 Processing image source...');
    
    // Check if it's a local file path or file:// URL
    if (url.startsWith('file://') || url.startsWith('/')) {
      const localPath = url.replace('file://', '');
      
      if (!fs.existsSync(localPath)) {
        throw new Error(`Local file not found: ${localPath}`);
      }
      
      // Copy local file to temp directory
      const ext = path.extname(localPath).slice(1) || 'png';
      const filename = `${id}.${ext}`;
      const filepath = path.join(this.tempDir, filename);
      
      console.log(`📁 Copying local file: ${path.basename(localPath)}`);
      fs.copyFileSync(localPath, filepath);
      console.log(`💾 Copied to: ${filename}`);
      return filepath;
    }
    
    // Handle HTTP/HTTPS URLs
    console.log('📥 Downloading from URL...');
    
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Compatible; FloorPlanLearner/1.0)'
      }
    });
    
    // Determine file extension from content-type
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const filename = `${id}.${ext}`;
    const filepath = path.join(this.tempDir, filename);
    
    // Save to file
    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`💾 Saved to: ${filename}`);
        resolve(filepath);
      });
      writer.on('error', reject);
    });
  }
  
  /**
   * Extract learning insights from detection results
   */
  private extractInsights(result: any): any {
    const insights = {
      wallCharacteristics: [],
      roomTypes: [],
      layoutPattern: '',
      wallStyle: '',
      averageWallLength: 0,
      dominantAngles: []
    };
    
    // Analyze walls
    if (result.walls && result.walls.length > 0) {
      // Calculate average wall length
      const lengths = result.walls.map(w => this.calculateLength(w));
      insights.averageWallLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      
      // Find dominant angles
      const angles = result.walls.map(w => this.calculateAngle(w));
      insights.dominantAngles = this.findDominantAngles(angles);
      
      // Detect wall style (thin, thick, double-line, etc.)
      insights.wallStyle = this.detectWallStyle(result.walls);
    }
    
    // Analyze rooms
    if (result.rooms && result.rooms.length > 0) {
      // Keep original room types - they should be detected by OCR/text recognition
      insights.roomTypes = result.rooms.map(r => {
        // Only return what was actually detected
        // The detection service should use OCR to read room labels
        return r.type || 'unknown';
      });
      
      // Update common room types
      insights.roomTypes.forEach(type => {
        // Ensure commonRoomTypes is a Map
        if (!(this.learningStats.commonRoomTypes instanceof Map)) {
          this.learningStats.commonRoomTypes = new Map();
        }
        const count = this.learningStats.commonRoomTypes.get(type) || 0;
        this.learningStats.commonRoomTypes.set(type, count + 1);
      });
    }
    
    // Detect layout pattern (open floor, traditional, etc.)
    insights.layoutPattern = this.detectLayoutPattern(result);
    
    return insights;
  }
  
  /**
   * Update learning statistics
   */
  private updateStats(insights: any): void {
    this.learningStats.totalProcessed++;
    this.learningStats.totalLearned++;
    this.learningStats.lastProcessed = new Date();
    
    // Track wall styles
    if (insights.wallStyle && !this.learningStats.wallStylesLearned.includes(insights.wallStyle)) {
      this.learningStats.wallStylesLearned.push(insights.wallStyle);
    }
    
    // Track patterns
    if (insights.layoutPattern && !this.learningStats.patternsLearned.includes(insights.layoutPattern)) {
      this.learningStats.patternsLearned.push(insights.layoutPattern);
    }
    
    // Update average walls per plan
    const currentAvg = this.learningStats.averageWallsPerPlan;
    const totalWalls = currentAvg * (this.learningStats.totalProcessed - 1) + (insights.wallCount || 0);
    this.learningStats.averageWallsPerPlan = totalWalls / this.learningStats.totalProcessed;
  }
  
  /**
   * Get current status
   */
  public getStatus(): any {
    const pending = this.queue.filter(q => q.status === 'pending').length;
    const completed = this.queue.filter(q => q.status === 'completed').length;
    const failed = this.queue.filter(q => q.status === 'failed').length;
    
    return {
      isRunning: this.isProcessing,
      queueStatus: {
        pending,
        completed,
        failed,
        total: this.queue.length
      },
      learningStats: this.learningStats,
      recentProcessed: this.queue
        .filter(q => q.status === 'completed')
        .slice(-5)
        .map(q => ({
          url: q.url,
          processedAt: q.processedAt,
          wallsFound: q.results?.wallsFound || 0
        }))
    };
  }
  
  /**
   * Get learning progress report
   */
  public getLearningReport(): string {
    const stats = this.learningStats;
    const report = `
🤖 AUTO-LEARNER REPORT
========================
📊 Statistics:
  • Total Processed: ${stats.totalProcessed}
  • Successfully Learned: ${stats.totalLearned}
  • Failed: ${stats.totalFailed}
  • Success Rate: ${((stats.totalLearned / Math.max(stats.totalProcessed, 1)) * 100).toFixed(1)}%

📐 Patterns Learned:
  • Wall Styles: ${stats.wallStylesLearned.join(', ') || 'None yet'}
  • Layout Patterns: ${stats.patternsLearned.join(', ') || 'None yet'}
  • Avg Walls/Plan: ${stats.averageWallsPerPlan.toFixed(1)}

🏠 Room Types Found:
${Array.from(stats.commonRoomTypes.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([type, count]) => `  • ${type}: ${count} times`)
  .join('\n')}

⏰ Last Processed: ${stats.lastProcessed ? new Date(stats.lastProcessed).toLocaleString() : 'Never'}
    `;
    
    return report;
  }
  
  // Utility methods
  private calculateLength(wall: any): number {
    const x1 = wall.start?.x || wall.x1 || 0;
    const y1 = wall.start?.y || wall.y1 || 0;
    const x2 = wall.end?.x || wall.x2 || 0;
    const y2 = wall.end?.y || wall.y2 || 0;
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }
  
  private calculateAngle(wall: any): number {
    const x1 = wall.start?.x || wall.x1 || 0;
    const y1 = wall.start?.y || wall.y1 || 0;
    const x2 = wall.end?.x || wall.x2 || 0;
    const y2 = wall.end?.y || wall.y2 || 0;
    return Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
  }
  
  private findDominantAngles(angles: number[]): number[] {
    const snapped = angles.map(a => Math.round(a / 45) * 45);
    const counts = new Map<number, number>();
    snapped.forEach(a => counts.set(a, (counts.get(a) || 0) + 1));
    
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([angle]) => angle);
  }
  
  private detectWallStyle(walls: any[]): string {
    // Simple heuristic - can be improved with actual visual analysis
    const avgThickness = walls.reduce((sum, w) => sum + (w.thickness || 10), 0) / walls.length;
    
    if (avgThickness < 5) return 'thin-line';
    if (avgThickness < 10) return 'standard';
    if (avgThickness < 15) return 'thick';
    return 'double-line';
  }
  
  private detectLayoutPattern(result: any): string {
    const roomCount = result.rooms?.length || 0;
    const wallCount = result.walls?.length || 0;
    
    if (roomCount < 5) return 'small-simple';
    if (roomCount < 8) return 'traditional';
    if (wallCount < 20) return 'open-concept';
    return 'complex-multi-room';
  }
  
  /**
   * Trigger model retraining with collected data
   */
  private async triggerModelRetraining(): Promise<void> {
    try {
      console.log('🔧 Starting model retraining process...');
      
      // Check if enough time has passed since last retrain (at least 1 hour)
      const hoursSinceLastRetrain = (Date.now() - this.lastRetrainTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRetrain < 1) {
        console.log('⏰ Skipping retrain - last retrain was less than 1 hour ago');
        return;
      }
      
      // Export training data from RAG learning
      const exported = await this.modelRetrainerService.exportTrainingData();
      console.log(`📤 Exported ${exported.yolo} YOLO samples and ${exported.ocr} OCR samples`);
      
      // Check if we have enough data to retrain
      if (exported.yolo < 50) {
        console.log('⚠️ Not enough YOLO training data yet (need at least 50 samples)');
        return;
      }
      
      // Trigger async retraining (don't wait for completion)
      this.modelRetrainerService.retrainYOLOModel().then(result => {
        if (result.success) {
          console.log(`✅ Model retrained successfully! New accuracy: ${result.metrics?.accuracy || 'N/A'}`);
          this.lastRetrainTime = new Date();
        } else {
          console.log(`⚠️ Model retraining failed: ${result.error}`);
        }
      }).catch(error => {
        console.error('❌ Model retraining error:', error);
      });
      
    } catch (error) {
      console.error('❌ Failed to trigger model retraining:', error);
    }
  }
}

// Export singleton instance
export const autoLearner = new AutoLearnerService();