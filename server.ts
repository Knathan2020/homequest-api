// server.ts - HomeQuest Tech API (Simplified Version)
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import floorPlanRoutes from './src/routes/floorPlans';
import floorPlanPersistenceRoutes from './src/routes/floor-plan-persistence.routes';
// Import working routes with fallback
let workingRoutes: any;
try {
  workingRoutes = require('./src/routes/working-routes').default || require('./src/routes/working-routes');
} catch (err) {
  console.error('Failed to load working routes:', err);
  workingRoutes = null;
}

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Initialize Supabase (with fallback for testing)
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey);

// Configure CORS with dynamic origin checking
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Allowed origins list
    const allowedOrigins = [
      // Local development
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',

      // GitHub Codespaces
      'https://cuddly-giggle-69p59v4xv5gw2rvw7-3000.app.github.dev',
      'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev',

      // Vercel Production
      'https://construction-platform-sigma.vercel.app',
      'https://construction-platform.vercel.app'
    ];

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow all Vercel preview deployments
    if (origin.includes('vercel.app') && origin.startsWith('https://')) {
      return callback(null, true);
    }

    // Reject other origins
    console.warn(`⚠️  CORS blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Configure body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

// Request logging
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    message: 'HomeQuest Tech API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'HomeQuest Tech API',
    status: 'online',
    endpoints: {
      health: '/health',
      upload: '/api/floor-plans/upload',
      jobs: '/api/floor-plans/jobs',
      job: '/api/floor-plans/job/:jobId'
    }
  });
});

// Use the new floor plan routes with real Python analyzer
app.use('/api/floor-plans', floorPlanRoutes);

// Add persistence routes (auto-save, load, update, delete)
app.use('/api/floor-plans', floorPlanPersistenceRoutes);

// Register all working API routes
if (workingRoutes) {
  app.use('/api', workingRoutes);
  console.log('✅ All API routes registered successfully');
} else {
  console.error('❌ Working routes not loaded - endpoints will return 404');
}

// DEPRECATED - Old Supabase upload endpoint (commented out)
/*
app.post('/api/floor-plans/upload-old', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file provided',
        message: 'Please select a floor plan to upload'
      });
    }

    console.log(`📁 Received file: ${req.file.originalname}, Size: ${(req.file.size / 1024 / 1024).toFixed(2)}MB`);

    // If Supabase is not configured, return mock response
    if (supabaseUrl === 'https://placeholder.supabase.co') {
      const mockJobId = uuidv4();
      console.log(`⚠️  Supabase not configured - returning mock response`);
      return res.json({
        success: true,
        jobId: mockJobId,
        status: 'pending',
        message: 'File received (Supabase not configured - using mock response)',
        fileInfo: {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype
        }
      });
    }

    // Generate unique filename
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `floor-plans/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('floorplans')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ 
        error: 'Failed to upload file to storage',
        details: uploadError.message 
      });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('floorplans')
      .getPublicUrl(filePath);

    // Create job record
    const jobId = uuidv4();
    const jobData = {
      id: jobId,
      status: 'pending',
      file_url: publicUrl,
      file_path: filePath,
      original_name: req.file.originalname,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      created_at: new Date().toISOString()
    };

    // Try to save to database
    const { error: dbError } = await supabase
      .from('floorplan_jobs')
      .insert(jobData);

    if (dbError) {
      console.error('Database error:', dbError);
      // Still return success if file was uploaded
      return res.json({
        success: true,
        jobId: jobId,
        status: 'pending',
        message: 'File uploaded (database save failed)',
        fileUrl: publicUrl,
        warning: 'Database not configured properly'
      });
    }

    console.log(`✅ Job created: ${jobId}`);

    res.json({
      success: true,
      jobId: jobId,
      status: 'pending',
      message: 'Floor plan uploaded successfully',
      fileUrl: publicUrl
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

*/

// DEPRECATED - Old job status endpoint (commented out)
/*
app.get('/api/floor-plans/job-old/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // If Supabase not configured, return mock
    if (supabaseUrl === 'https://placeholder.supabase.co') {
      return res.json({
        id: jobId,
        status: 'completed',
        message: 'Mock job status (Supabase not configured)',
        ai_analysis: {
          rooms_detected: 5,
          total_sqft: 1500,
          confidence: 0.92
        }
      });
    }

    const { data, error } = await supabase
      .from('floorplan_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return res.status(404).json({ 
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({ 
      error: 'Failed to get job status'
    });
  }
});

*/

// DEPRECATED - Old jobs list endpoint (commented out)
/*
app.get('/api/floor-plans/jobs-old', async (req, res) => {
  try {
    // If Supabase not configured, return empty list
    if (supabaseUrl === 'https://placeholder.supabase.co') {
      return res.json({
        success: true,
        data: [],
        message: 'Supabase not configured - no jobs available'
      });
    }

    const { data, error } = await supabase
      .from('floorplan_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return res.status(500).json({ 
        error: 'Failed to fetch jobs',
        details: error.message 
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('List jobs error:', error);
    res.status(500).json({ 
      error: 'Internal server error'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

*/

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 HomeQuest Tech API Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server: http://localhost:${PORT}
🔧 Status: ${supabaseUrl === 'https://placeholder.supabase.co' ? 'Mock Mode (Configure Supabase)' : 'Connected to Supabase'}
📊 Health: http://localhost:${PORT}/health
📁 Upload: POST http://localhost:${PORT}/api/floor-plans/upload
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
  
  if (supabaseUrl === 'https://placeholder.supabase.co') {
    console.log('⚠️  WARNING: Supabase not configured. API running in mock mode.');
    console.log('   Add SUPABASE_URL and SUPABASE_ANON_KEY to .env file');
  }
});

export default app;