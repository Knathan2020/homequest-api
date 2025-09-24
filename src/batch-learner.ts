#!/usr/bin/env node

// ========================================
// BATCH LEARNER - batch-learner.ts
// Processes multiple floor plans in parallel for faster learning
// ========================================

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Worker } from 'worker_threads';
import { autoLearner } from './services/auto-learner.service';
import RealDetectionService from './services/real-detection.service';
import { ragLearningService } from './services/rag-learning.service';

interface BatchConfig {
  concurrency: number;  // Number of parallel downloads
  batchSize: number;    // Images to process per batch
  retryAttempts: number;
  timeout: number;
}

class BatchLearner {
  private config: BatchConfig;
  private tempDir: string;
  private activeDownloads = 0;
  private processedCount = 0;
  private failedCount = 0;
  private detectionService: RealDetectionService;
  
  constructor(config?: Partial<BatchConfig>) {
    this.config = {
      concurrency: 5,      // Download 5 images simultaneously
      batchSize: 10,       // Process 10 images at once
      retryAttempts: 2,
      timeout: 20000,
      ...config
    };
    
    this.tempDir = path.join(process.cwd(), 'temp-batch');
    this.detectionService = new RealDetectionService();
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  
  /**
   * Process URLs in batches with parallel downloads
   */
  public async processBatch(urls: string[]): Promise<void> {
    console.log(`🚀 Starting batch processing of ${urls.length} URLs`);
    console.log(`⚙️ Config: ${this.config.concurrency} parallel downloads, batch size ${this.config.batchSize}`);
    
    // Process in chunks
    for (let i = 0; i < urls.length; i += this.config.batchSize) {
      const batch = urls.slice(i, i + this.config.batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i/this.config.batchSize) + 1}/${Math.ceil(urls.length/this.config.batchSize)}`);
      
      // Download all images in parallel
      const downloadPromises = batch.map(url => this.downloadWithRetry(url));
      const downloadResults = await Promise.allSettled(downloadPromises);
      
      // Filter successful downloads
      const imagePaths = downloadResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as any).value)
        .filter(path => path !== null);
      
      console.log(`✅ Downloaded ${imagePaths.length}/${batch.length} images`);
      
      // Process all downloaded images
      const processPromises = imagePaths.map(path => this.processImage(path));
      const processResults = await Promise.allSettled(processPromises);
      
      const successCount = processResults.filter(r => r.status === 'fulfilled').length;
      console.log(`🧠 Learned from ${successCount}/${imagePaths.length} images`);
      
      this.processedCount += successCount;
      this.failedCount += batch.length - successCount;
    }
    
    this.printSummary();
  }
  
  /**
   * Download image with retry logic
   */
  private async downloadWithRetry(url: string, attempt = 1): Promise<string | null> {
    try {
      // Wait if too many concurrent downloads
      while (this.activeDownloads >= this.config.concurrency) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.activeDownloads++;
      
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Compatible; FloorPlanBatchLearner/1.0)'
        }
      });
      
      const filename = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
      const filepath = path.join(this.tempDir, filename);
      
      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);
      
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });
      
      this.activeDownloads--;
      return filepath;
      
    } catch (error: any) {
      this.activeDownloads--;
      
      if (attempt < this.config.retryAttempts && error.code !== 'ERR_BAD_REQUEST') {
        console.log(`⚠️ Retry ${attempt}/${this.config.retryAttempts} for ${url.split('/').pop()}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        return this.downloadWithRetry(url, attempt + 1);
      }
      
      return null;
    }
  }
  
  /**
   * Process a single image
   */
  private async processImage(imagePath: string): Promise<void> {
    try {
      const result = await this.detectionService.detectFloorPlan(imagePath);
      
      if (result.walls && result.walls.length > 0) {
        // Save to RAG learning
        const sessionId = path.basename(imagePath, path.extname(imagePath));
        ragLearningService.startSession(sessionId);
        
        // Learn walls
        ragLearningService.addWallData(result.walls, 'ai');

        // Learn rooms
        if (result.rooms) {
          ragLearningService.addRoomData(result.rooms, 'ai');
        }

        ragLearningService.saveSession();
      }
      
      // Clean up temp file
      fs.unlinkSync(imagePath);
      
    } catch (error) {
      console.error(`❌ Processing failed for ${path.basename(imagePath)}`);
      throw error;
    }
  }
  
  /**
   * Print processing summary
   */
  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 BATCH PROCESSING COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Successfully processed: ${this.processedCount}`);
    console.log(`❌ Failed: ${this.failedCount}`);
    console.log(`📈 Success rate: ${((this.processedCount / (this.processedCount + this.failedCount)) * 100).toFixed(1)}%`);
    console.log(`🧠 Total patterns learned: ${ragLearningService.getLearningStats().totalPatterns || 0}`);
  }
  
  /**
   * Clean up temp directory
   */
  public cleanup(): void {
    const files = fs.readdirSync(this.tempDir);
    files.forEach(file => {
      fs.unlinkSync(path.join(this.tempDir, file));
    });
    console.log('🧹 Cleaned up temp files');
  }
}

// Main execution
async function main() {
  console.log('🤖 BATCH LEARNER - Fast Parallel Processing');
  console.log('━'.repeat(60));
  
  // Load URLs from file
  const urlsPath = path.join(process.cwd(), 'urls.txt');
  if (!fs.existsSync(urlsPath)) {
    console.error('❌ urls.txt not found');
    process.exit(1);
  }
  
  const content = fs.readFileSync(urlsPath, 'utf-8');
  const urls = content.split('\n')
    .filter(line => line.trim().startsWith('http'))
    .slice(0, 100); // Process first 100 URLs
  
  console.log(`📋 Loaded ${urls.length} URLs`);
  
  const batchLearner = new BatchLearner({
    concurrency: 5,
    batchSize: 10,
    retryAttempts: 2,
    timeout: 15000
  });
  
  try {
    await batchLearner.processBatch(urls);
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    batchLearner.cleanup();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { BatchLearner };