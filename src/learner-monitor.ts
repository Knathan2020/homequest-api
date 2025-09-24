#!/usr/bin/env node

// ========================================
// AUTO-LEARNER MONITOR - learner-monitor.ts
// Real-time monitoring dashboard for auto-learner
// ========================================

import { autoLearner } from './services/auto-learner.service';
import * as fs from 'fs';
import * as path from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m'
};

class LearnerMonitor {
  private refreshInterval: NodeJS.Timer | null = null;
  private stats = {
    startTime: Date.now(),
    totalProcessed: 0,
    successfulProcessed: 0,
    failedProcessed: 0,
    patternsLearned: new Set<string>(),
    avgWallsPerImage: 0,
    avgProcessingTime: 0
  };

  public start(): void {
    this.refreshInterval = setInterval(() => {
      this.displayDashboard();
    }, 2000); // Update every 2 seconds

    // Initial display
    this.displayDashboard();
  }

  private displayDashboard(): void {
    console.clear();
    
    // Header
    console.log(colors.cyan + colors.bright);
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          🤖 AUTO-LEARNER MONITORING DASHBOARD 🤖              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(colors.reset);

    const status = autoLearner.getStatus();
    const report = autoLearner.getLearningReport();
    
    // Runtime
    const runtime = this.formatTime(Date.now() - this.stats.startTime);
    console.log(colors.white + '⏱️  Runtime: ' + colors.cyan + runtime + colors.reset);
    console.log('');

    // Processing Status
    console.log(colors.yellow + '📊 PROCESSING STATUS' + colors.reset);
    console.log('━'.repeat(60));
    
    const statusIcon = status.isRunning ? colors.green + '🟢' : colors.red + '🔴';
    console.log(statusIcon + ' Status: ' + (status.isRunning ? colors.green + 'RUNNING' : colors.red + 'STOPPED') + colors.reset);
    console.log('');

    // Queue Progress Bar
    const total = status.queueStatus.total;
    const completed = status.queueStatus.completed;
    const failed = status.queueStatus.failed;
    const pending = status.queueStatus.pending;
    const progress = total > 0 ? (completed + failed) / total : 0;
    
    this.drawProgressBar('Queue Progress', progress, completed, failed, pending, total);
    console.log('');

    // Processing Stats
    console.log(colors.yellow + '📈 PROCESSING STATS' + colors.reset);
    console.log('━'.repeat(60));
    
    // Success rate
    const successRate = completed > 0 ? ((completed / (completed + failed)) * 100).toFixed(1) : '0.0';
    console.log(colors.green + `✅ Success Rate: ${successRate}%` + colors.reset);
    
    // Processing speed
    const processingSpeed = this.calculateProcessingSpeed(status.recentProcessed);
    console.log(colors.blue + `⚡ Speed: ${processingSpeed} images/min` + colors.reset);
    console.log('');

    // Learning Insights
    console.log(colors.yellow + '🧠 LEARNING INSIGHTS' + colors.reset);
    console.log('━'.repeat(60));
    
    // Parse report to extract patterns
    const patterns = this.extractPatterns(report);
    console.log(colors.magenta + `🎯 Unique Patterns: ${patterns.count}` + colors.reset);
    console.log(colors.cyan + `📐 Avg Walls/Image: ${patterns.avgWalls}` + colors.reset);
    console.log(colors.blue + `🏠 Room Types: ${patterns.roomTypes}` + colors.reset);
    console.log('');

    // Recent Activity
    if (status.recentProcessed.length > 0) {
      console.log(colors.yellow + '📜 RECENT ACTIVITY' + colors.reset);
      console.log('━'.repeat(60));
      
      status.recentProcessed.slice(0, 5).forEach(item => {
        const time = new Date(item.processedAt).toLocaleTimeString();
        const url = item.url.split('/').pop()?.substring(0, 30) || 'unknown';
        const wallsIcon = item.wallsFound > 0 ? colors.green + '✓' : colors.red + '✗';
        console.log(`${wallsIcon} [${time}] ${url}... (${item.wallsFound} walls)` + colors.reset);
      });
      console.log('');
    }

    // Estimated Time Remaining
    if (pending > 0 && processingSpeed > 0) {
      const eta = Math.ceil(pending / processingSpeed);
      console.log(colors.cyan + `⏳ ETA: ~${eta} minutes remaining` + colors.reset);
    }

    // Controls
    console.log('');
    console.log(colors.white + '─'.repeat(60) + colors.reset);
    console.log(colors.white + 'Press Ctrl+C to stop monitoring (learner continues in background)' + colors.reset);
  }

  private drawProgressBar(label: string, progress: number, completed: number, failed: number, pending: number, total: number): void {
    const barLength = 40;
    const filled = Math.floor(progress * barLength);
    const empty = barLength - filled;
    
    // Color based on progress
    let barColor = colors.red;
    if (progress > 0.7) barColor = colors.green;
    else if (progress > 0.3) barColor = colors.yellow;
    
    const bar = barColor + '█'.repeat(filled) + colors.white + '░'.repeat(empty) + colors.reset;
    const percentage = (progress * 100).toFixed(1);
    
    console.log(`${label}: ${bar} ${percentage}%`);
    console.log(`  ${colors.green}✓ ${completed}${colors.reset} | ${colors.red}✗ ${failed}${colors.reset} | ${colors.yellow}⧗ ${pending}${colors.reset} | Total: ${total}`);
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private calculateProcessingSpeed(recent: any[]): string {
    if (recent.length < 2) return '0';
    
    const timeSpan = new Date(recent[0].processedAt).getTime() - 
                     new Date(recent[recent.length - 1].processedAt).getTime();
    const minutes = timeSpan / (1000 * 60);
    
    if (minutes === 0) return '0';
    
    const speed = recent.length / minutes;
    return speed.toFixed(1);
  }

  private extractPatterns(report: string): any {
    const patterns = {
      count: 0,
      avgWalls: 0,
      roomTypes: 0
    };
    
    // Extract pattern count
    const patternMatch = report.match(/Total Unique Patterns: (\d+)/);
    if (patternMatch) patterns.count = parseInt(patternMatch[1]);
    
    // Extract average walls
    const wallsMatch = report.match(/Average walls per image: ([\d.]+)/);
    if (wallsMatch) patterns.avgWalls = parseFloat(wallsMatch[1]);
    
    // Extract room types
    const roomMatch = report.match(/Common room types \((\d+)\)/);
    if (roomMatch) patterns.roomTypes = parseInt(roomMatch[1]);
    
    return patterns;
  }

  public stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    console.log(colors.yellow + '\n\n⏹️ Monitoring stopped. Learner continues in background.' + colors.reset);
  }
}

// Start monitor
const monitor = new LearnerMonitor();
monitor.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  monitor.stop();
  process.exit(0);
});