import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const router = express.Router();

// Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = '/tmp/floorplan-uploads';
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    const allowedTypes = /jpeg|jpg|png|gif|pdf|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'));
    }
  }
});

// Upload floor plan endpoint
router.post('/upload', upload.single('floorplan'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { projectId, projectName, description, uploadedBy } = req.body;
    
    // Save to database
    const { data, error } = await supabase
      .from('floor_plans')
      .insert({
        id: crypto.randomUUID(),
        project_id: projectId || crypto.randomUUID(),
        project_name: projectName || 'Unnamed Project',
        file_name: req.file.originalname,
        file_path: req.file.path,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        description: description || '',
        uploaded_by: uploadedBy || 'builder',
        uploaded_at: new Date().toISOString(),
        is_processed: false,
        is_public: true, // Available for all users
        metadata: {
          originalName: req.file.originalname,
          encoding: req.file.encoding,
          size: req.file.size
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to save floor plan' });
    }

    // Trigger AI analysis in background
    processFloorPlan(data.id, req.file.path);

    res.json({
      success: true,
      message: 'Floor plan uploaded successfully',
      data: {
        id: data.id,
        projectId: data.project_id,
        projectName: data.project_name,
        fileName: data.file_name,
        uploadedAt: data.uploaded_at
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload floor plan' });
  }
});

// Get all floor plans (for all users)
router.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('floor_plans')
      .select('*')
      .eq('is_public', true)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch floor plans' });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch floor plans' });
  }
});

// Get floor plan by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('floor_plans')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch floor plan' });
  }
});

// Download floor plan file
router.get('/:id/download', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('floor_plans')
      .select('file_path, file_name')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    // Check if file exists
    try {
      await fs.access(data.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(data.file_path, data.file_name);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download floor plan' });
  }
});

// Delete floor plan
router.delete('/:id', async (req, res) => {
  try {
    const { data: floorPlan } = await supabase
      .from('floor_plans')
      .select('file_path')
      .eq('id', req.params.id)
      .single();

    if (floorPlan) {
      // Delete file from disk
      try {
        await fs.unlink(floorPlan.file_path);
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
    }

    // Delete from database
    const { error } = await supabase
      .from('floor_plans')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete floor plan' });
    }

    res.json({
      success: true,
      message: 'Floor plan deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete floor plan' });
  }
});

// Background processing function
async function processFloorPlan(id: string, filePath: string) {
  try {
    console.log(`🤖 Processing floor plan ${id}...`);
    
    // Here you would call your AI analysis service
    // For now, just mark as processed after a delay
    setTimeout(async () => {
      await supabase
        .from('floor_plans')
        .update({
          is_processed: true,
          ai_analysis: {
            rooms_detected: Math.floor(Math.random() * 10) + 1,
            square_footage: Math.floor(Math.random() * 3000) + 1000,
            features: ['kitchen', 'bathroom', 'bedroom', 'living room'],
            confidence: 0.95
          }
        })
        .eq('id', id);
      
      console.log(`✅ Floor plan ${id} processed`);
    }, 5000);
  } catch (error) {
    console.error('Processing error:', error);
  }
}

export default router;