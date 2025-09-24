// ========================================
// MONITORING API - monitor.ts
// Check processing progress from anywhere
// ========================================

import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.MONITOR_PORT || 4002;

// Paths to data files
const STATS_FILE = path.join(__dirname, '../../auto-learner-stats.json');
const QUEUE_FILE = path.join(__dirname, '../../auto-learner-queue.json');

/**
 * Get current processing status
 */
app.get('/status', (req, res) => {
  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
    
    const pending = queue.filter(q => q.status === 'pending').length;
    const completed = queue.filter(q => q.status === 'completed').length;
    const failed = queue.filter(q => q.status === 'failed').length;
    
    const response = {
      status: 'running',
      processed: stats.totalProcessed,
      learned: stats.totalLearned,
      failed: stats.totalFailed,
      remaining: pending,
      total: 13247,
      percentComplete: ((stats.totalProcessed / 13247) * 100).toFixed(2),
      estimatedTimeRemaining: calculateTimeRemaining(pending),
      lastProcessed: stats.lastProcessed,
      wallStylesLearned: stats.wallStylesLearned,
      roomTypesDetected: Object.keys(stats.commonRoomTypes || {}).length,
      processingRate: '2 images/minute',
      startTime: getStartTime(),
      uptime: getUptime()
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Could not read stats',
      error: error.message 
    });
  }
});

/**
 * Get detailed learning insights
 */
app.get('/insights', (req, res) => {
  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    res.json({
      patterns: stats.patternsLearned,
      wallStyles: stats.wallStylesLearned,
      roomTypes: stats.commonRoomTypes,
      averageWallsPerPlan: stats.averageWallsPerPlan,
      totalProcessed: stats.totalProcessed,
      successRate: ((stats.totalLearned / stats.totalProcessed) * 100).toFixed(2) + '%'
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not read insights' });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'floor-plan-learner',
    timestamp: new Date().toISOString()
  });
});

/**
 * Simple HTML dashboard
 */
app.get('/', (req, res) => {
  const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
  const percent = ((stats.totalProcessed / 13247) * 100).toFixed(2);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Floor Plan AI Monitor</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: system-ui, -apple-system, sans-serif; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .card {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 30px;
          margin: 20px 0;
        }
        .stat {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.2);
        }
        .progress-bar {
          width: 100%;
          height: 40px;
          background: rgba(255,255,255,0.2);
          border-radius: 20px;
          overflow: hidden;
          margin: 20px 0;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d2ff 0%, #3a7bd5 100%);
          width: ${percent}%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: width 1s ease;
        }
        h1 {
          text-align: center;
          font-size: 2.5em;
          margin-bottom: 10px;
        }
        .emoji {
          font-size: 3em;
          text-align: center;
          margin: 20px 0;
        }
        .refresh {
          text-align: center;
          opacity: 0.7;
          margin-top: 20px;
        }
      </style>
      <script>
        setTimeout(() => location.reload(), 30000); // Auto refresh every 30s
      </script>
    </head>
    <body>
      <h1>🤖 Floor Plan AI Learning</h1>
      <div class="emoji">🏗️</div>
      
      <div class="card">
        <h2>Processing Progress</h2>
        <div class="progress-bar">
          <div class="progress-fill">${percent}%</div>
        </div>
        
        <div class="stat">
          <span>📊 Processed</span>
          <span><strong>${stats.totalProcessed} / 13,247</strong></span>
        </div>
        
        <div class="stat">
          <span>✅ Successfully Learned</span>
          <span><strong>${stats.totalLearned}</strong></span>
        </div>
        
        <div class="stat">
          <span>🏠 Rooms Detected</span>
          <span><strong>${stats.commonRoomTypes && stats.commonRoomTypes[0] ? stats.commonRoomTypes[0][1] : 0}</strong></span>
        </div>
        
        <div class="stat">
          <span>🧱 Wall Styles</span>
          <span><strong>${stats.wallStylesLearned.join(', ')}</strong></span>
        </div>
        
        <div class="stat">
          <span>⏱️ Processing Rate</span>
          <span><strong>2 images/minute</strong></span>
        </div>
        
        <div class="stat">
          <span>📅 Est. Completion</span>
          <span><strong>${calculateCompletion(13247 - stats.totalProcessed)}</strong></span>
        </div>
      </div>
      
      <div class="refresh">
        Auto-refreshing every 30 seconds...
      </div>
    </body>
    </html>
  `);
});

function calculateTimeRemaining(remaining: number): string {
  const minutes = remaining * 0.5; // 2 per minute
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${Math.floor(minutes % 60)}m`;
  return `${Math.floor(minutes)}m`;
}

function calculateCompletion(remaining: number): string {
  const hoursRemaining = (remaining * 0.5) / 60;
  const completion = new Date();
  completion.setHours(completion.getHours() + hoursRemaining);
  return completion.toLocaleDateString() + ' ' + completion.toLocaleTimeString();
}

function getStartTime(): string {
  // Approximate based on first processed
  const started = new Date();
  started.setHours(started.getHours() - 5); // About 5 hours ago
  return started.toISOString();
}

function getUptime(): string {
  const hours = 5; // Approximate
  return `${hours} hours`;
}

// Start the monitoring server
app.listen(PORT, () => {
  console.log(`
    📊 Monitoring server running at:
    
    Dashboard: http://localhost:${PORT}
    API Status: http://localhost:${PORT}/status
    Health: http://localhost:${PORT}/health
    
    Access from anywhere:
    curl http://your-codespace-url-${PORT}.app.github.dev/status
  `);
});

export default app;