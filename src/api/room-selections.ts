import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/selections');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and images are allowed.'));
    }
  }
});

/**
 * POST /api/selections/upload
 * Upload a selections document file
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { project_id, floor_plan_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Generate file URL
    const file_url = `/uploads/selections/${req.file.filename}`;

    res.json({
      success: true,
      file_url,
      file_name: req.file.originalname,
      file_size: req.file.size,
      mime_type: req.file.mimetype
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file', details: error.message });
  }
});

/**
 * POST /api/selections
 * Save room selections data to database
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const {
      floor_plan_id,
      project_id,
      document_name,
      document_url,
      document_type,
      file_size,
      extracted_data,
      room_mappings,
      ai_confidence,
      validation_status,
      user_notes
    } = req.body;

    // Validate required fields
    if (!project_id || !document_name || !document_url) {
      return res.status(400).json({
        error: 'Missing required fields: project_id, document_name, document_url'
      });
    }

    const { data, error } = await supabase
      .from('room_selections')
      .insert({
        floor_plan_id: floor_plan_id || null,
        project_id,
        document_name,
        document_url,
        document_type: document_type || 'pdf',
        file_size: file_size || null,
        extracted_data: extracted_data || {},
        room_mappings: room_mappings || [],
        ai_confidence: ai_confidence || 0,
        validation_status: validation_status || 'pending',
        user_notes: user_notes || null
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      id: data.id,
      selection: data
    });

  } catch (error: any) {
    console.error('Error saving room selections:', error);
    res.status(500).json({ error: 'Failed to save room selections', details: error.message });
  }
});

/**
 * GET /api/selections/project/:projectId
 * Get all room selections for a project
 */
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;

    const { data, error } = await supabase
      .from('room_selections')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      selections: data || []
    });

  } catch (error: any) {
    console.error('Error fetching room selections:', error);
    res.status(500).json({ error: 'Failed to fetch room selections', details: error.message });
  }
});

/**
 * GET /api/selections/floor-plan/:floorPlanId
 * Get all room selections for a specific floor plan
 */
router.get('/floor-plan/:floorPlanId', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { floorPlanId } = req.params;

    const { data, error } = await supabase
      .from('room_selections')
      .select('*')
      .eq('floor_plan_id', floorPlanId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      selections: data || []
    });

  } catch (error: any) {
    console.error('Error fetching room selections:', error);
    res.status(500).json({ error: 'Failed to fetch room selections', details: error.message });
  }
});

/**
 * GET /api/selections/:id
 * Get a specific room selection by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('room_selections')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Room selection not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      selection: data
    });

  } catch (error: any) {
    console.error('Error fetching room selection:', error);
    res.status(500).json({ error: 'Failed to fetch room selection', details: error.message });
  }
});

/**
 * PUT /api/selections/:id
 * Update room selections (e.g., after manual room mapping)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { id } = req.params;
    const {
      room_mappings,
      validation_status,
      user_notes,
      manual_overrides
    } = req.body;

    const updateObj: any = {};

    if (room_mappings !== undefined) updateObj.room_mappings = room_mappings;
    if (validation_status !== undefined) {
      updateObj.validation_status = validation_status;
      if (validation_status === 'validated') {
        updateObj.validated_at = new Date().toISOString();
      }
    }
    if (user_notes !== undefined) updateObj.user_notes = user_notes;
    if (manual_overrides !== undefined) updateObj.manual_overrides = manual_overrides;

    if (Object.keys(updateObj).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('room_selections')
      .update(updateObj)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Room selection not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      selection: data
    });

  } catch (error: any) {
    console.error('Error updating room selection:', error);
    res.status(500).json({ error: 'Failed to update room selection', details: error.message });
  }
});

/**
 * DELETE /api/selections/:id
 * Delete a room selection
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { id } = req.params;

    // Get the file URL before deleting
    const { data: selection, error: selectError } = await supabase
      .from('room_selections')
      .select('document_url')
      .eq('id', id)
      .single();

    if (selectError) {
      if (selectError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Room selection not found' });
      }
      throw selectError;
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('room_selections')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Try to delete the file (don't fail if this fails)
    try {
      const filePath = path.join(__dirname, '../../', selection.document_url);
      await fs.unlink(filePath);
    } catch (fileError) {
      console.warn('Could not delete file:', fileError);
    }

    res.json({
      success: true,
      message: 'Room selection deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting room selection:', error);
    res.status(500).json({ error: 'Failed to delete room selection', details: error.message });
  }
});

export default router;
