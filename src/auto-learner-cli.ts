#!/usr/bin/env node

// ========================================
// AUTO-LEARNER CLI - auto-learner-cli.ts
// Command-line interface for the auto-learner
// ========================================

import { autoLearner } from './services/auto-learner.service';
import * as fs from 'fs';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Color codes for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function printHeader() {
  console.clear();
  console.log(colors.cyan + colors.bright);
  console.log('╔═══════════════════════════════════════╗');
  console.log('║     🤖 FLOOR PLAN AUTO-LEARNER 🤖     ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log(colors.reset);
}

function printMenu() {
  console.log('\n' + colors.yellow + 'Choose an option:' + colors.reset);
  console.log('1. Add URLs from file');
  console.log('2. Add single URL');
  console.log('3. Start auto-processing');
  console.log('4. Stop auto-processing');
  console.log('5. View status');
  console.log('6. View learning report');
  console.log('7. Clear queue');
  console.log('8. Exit');
  console.log('');
}

async function addUrlsFromFile() {
  return new Promise<void>((resolve) => {
    rl.question(colors.blue + 'Enter path to URLs file (one URL per line): ' + colors.reset, (filepath) => {
      try {
        if (!fs.existsSync(filepath)) {
          console.log(colors.red + `❌ File not found: ${filepath}` + colors.reset);
          resolve();
          return;
        }
        
        const content = fs.readFileSync(filepath, 'utf-8');
        const urls = content.split('\n').filter(line => line.trim().startsWith('http'));
        
        if (urls.length === 0) {
          console.log(colors.red + '❌ No valid URLs found in file' + colors.reset);
          resolve();
          return;
        }
        
        const added = autoLearner.addUrls(urls, 'file');
        console.log(colors.green + `✅ Added ${added} URLs to queue` + colors.reset);
      } catch (error) {
        console.log(colors.red + `❌ Error: ${error.message}` + colors.reset);
      }
      resolve();
    });
  });
}

async function addSingleUrl() {
  return new Promise<void>((resolve) => {
    rl.question(colors.blue + 'Enter floor plan URL: ' + colors.reset, (url) => {
      if (!url.startsWith('http')) {
        console.log(colors.red + '❌ Invalid URL' + colors.reset);
        resolve();
        return;
      }
      
      const added = autoLearner.addUrls([url], 'manual');
      console.log(colors.green + `✅ Added ${added} URL to queue` + colors.reset);
      resolve();
    });
  });
}

async function startProcessing() {
  return new Promise<void>((resolve) => {
    rl.question(colors.blue + 'Processing interval in seconds (default 30): ' + colors.reset, (interval) => {
      const seconds = parseInt(interval) || 30;
      autoLearner.startProcessing(seconds * 1000);
      console.log(colors.green + `✅ Started auto-processing (every ${seconds} seconds)` + colors.reset);
      console.log(colors.yellow + 'Processing will continue in background. Check status to monitor.' + colors.reset);
      resolve();
    });
  });
}

function showStatus() {
  const status = autoLearner.getStatus();
  
  console.log('\n' + colors.cyan + '📊 AUTO-LEARNER STATUS' + colors.reset);
  console.log('━'.repeat(40));
  
  console.log(colors.yellow + 'Queue:' + colors.reset);
  console.log(`  • Pending: ${status.queueStatus.pending}`);
  console.log(`  • Completed: ${status.queueStatus.completed}`);
  console.log(`  • Failed: ${status.queueStatus.failed}`);
  console.log(`  • Total: ${status.queueStatus.total}`);
  
  console.log('\n' + colors.yellow + 'Processing:' + colors.reset);
  console.log(`  • Status: ${status.isRunning ? colors.green + 'RUNNING' : colors.red + 'STOPPED'}` + colors.reset);
  
  if (status.recentProcessed.length > 0) {
    console.log('\n' + colors.yellow + 'Recently Processed:' + colors.reset);
    status.recentProcessed.forEach(item => {
      const time = new Date(item.processedAt).toLocaleTimeString();
      console.log(`  • ${time} - ${item.wallsFound} walls - ${item.url.substring(0, 50)}...`);
    });
  }
}

function showReport() {
  const report = autoLearner.getLearningReport();
  console.log(report);
}

async function clearQueue() {
  return new Promise<void>((resolve) => {
    rl.question(colors.red + 'Are you sure you want to clear the queue? (y/n): ' + colors.reset, (answer) => {
      if (answer.toLowerCase() === 'y') {
        // Note: Would need to add clearQueue method to service
        console.log(colors.yellow + '⚠️ Clear queue not implemented yet' + colors.reset);
      }
      resolve();
    });
  });
}

async function main() {
  printHeader();
  
  let running = true;
  while (running) {
    printMenu();
    
    const choice = await new Promise<string>((resolve) => {
      rl.question(colors.cyan + 'Enter choice: ' + colors.reset, resolve);
    });
    
    switch (choice) {
      case '1':
        await addUrlsFromFile();
        break;
      case '2':
        await addSingleUrl();
        break;
      case '3':
        await startProcessing();
        break;
      case '4':
        autoLearner.stopProcessing();
        console.log(colors.yellow + '⏹️ Stopped auto-processing' + colors.reset);
        break;
      case '5':
        showStatus();
        break;
      case '6':
        showReport();
        break;
      case '7':
        await clearQueue();
        break;
      case '8':
        running = false;
        break;
      default:
        console.log(colors.red + '❌ Invalid choice' + colors.reset);
    }
    
    if (running && choice !== '5' && choice !== '6') {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(colors.green + '\n👋 Goodbye!' + colors.reset);
  rl.close();
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(colors.yellow + '\n\n⏹️ Shutting down...' + colors.reset);
  autoLearner.stopProcessing();
  process.exit(0);
});

// Start the CLI
main().catch(error => {
  console.error(colors.red + 'Fatal error:', error, colors.reset);
  process.exit(1);
});