#!/usr/bin/env node

// ========================================
// AUTO-LEARNER BACKGROUND RUNNER
// Runs continuously in background processing URLs
// ========================================

import { autoLearner } from './services/auto-learner.service';
import * as fs from 'fs';
import * as path from 'path';

const URLS_FILE = path.join(process.cwd(), '../urls.txt');
const LOG_FILE = path.join(process.cwd(), 'auto-learner.log');
const PROCESS_INTERVAL = 30000; // 30 seconds

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage);
}

function loadUrlsFromFile(): string[] {
  if (!fs.existsSync(URLS_FILE)) {
    log(`📁 Creating ${URLS_FILE} - Add your URLs there`);
    fs.writeFileSync(URLS_FILE, '# Add floor plan URLs here (one per line)\n');
    return [];
  }
  
  const content = fs.readFileSync(URLS_FILE, 'utf-8');
  const urls = content
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#') && line.startsWith('http'));
  
  return urls;
}

async function main() {
  log('🤖 AUTO-LEARNER BACKGROUND SERVICE STARTING...');
  log(`📂 URLs file: ${URLS_FILE}`);
  log(`📊 Processing interval: ${PROCESS_INTERVAL / 1000} seconds`);
  
  // Load initial URLs
  const urls = loadUrlsFromFile();
  if (urls.length > 0) {
    const added = autoLearner.addUrls(urls, 'file');
    log(`📥 Loaded ${added} URLs from file`);
  } else {
    log('⚠️ No URLs found in file. Add URLs to: ' + URLS_FILE);
  }
  
  // Start processing
  log('🚀 Starting automatic processing...');
  autoLearner.startProcessing(PROCESS_INTERVAL);
  
  // Monitor and report progress
  setInterval(() => {
    const status = autoLearner.getStatus();
    const report = `
📊 STATUS UPDATE
  Queue: ${status.queueStatus.pending} pending, ${status.queueStatus.completed} completed
  Stats: ${status.learningStats.totalProcessed} processed, ${status.learningStats.totalLearned} learned
  Patterns: ${status.learningStats.patternsLearned.length} discovered
  Last: ${status.learningStats.lastProcessed ? new Date(status.learningStats.lastProcessed).toLocaleTimeString() : 'Never'}`;
    
    log(report);
    
    // Check for new URLs periodically
    const newUrls = loadUrlsFromFile();
    const currentQueueUrls = status.queueStatus.total;
    if (newUrls.length > currentQueueUrls) {
      const added = autoLearner.addUrls(newUrls, 'file-reload');
      if (added > 0) {
        log(`📥 Added ${added} new URLs from file`);
      }
    }
  }, 60000); // Report every minute
  
  // Show initial report
  setTimeout(() => {
    log(autoLearner.getLearningReport());
  }, 5000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('⏹️ Shutting down auto-learner...');
  autoLearner.stopProcessing();
  
  // Final report
  log(autoLearner.getLearningReport());
  log('👋 Auto-learner stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('⏹️ Received SIGTERM, shutting down...');
  autoLearner.stopProcessing();
  process.exit(0);
});

// Handle errors
process.on('uncaughtException', (error) => {
  log(`❌ Uncaught exception: ${error.message}`);
  console.error(error);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled rejection: ${reason}`);
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the service
main().catch(error => {
  log(`❌ Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});