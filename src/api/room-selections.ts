import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import * as pdfjs from 'pdfjs-dist';
import { Canvas, createCanvas } from 'canvas';

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
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ];
    const isValidType = allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.docx');

    if (isValidType) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word documents (.docx), and images are allowed.'));
    }
  }
});

/**
 * POST /api/selections/upload
 * Upload selections document files (supports multiple files)
 * Converts PDFs to images for GPT Vision processing
 */
router.post('/upload', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { project_id, floor_plan_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Generate file URLs
    const file_urls = files.map(file => `/uploads/selections/${file.filename}`);

    // Convert files to images (PDFs -> images, images -> base64)
    const allImages: any[] = [];

    for (const file of files) {
      const filePath = file.path;

      // Check if file is a PDF
      if (file.mimetype === 'application/pdf') {
        console.log(`Converting PDF to images: ${file.originalname}`);

        try {
          // Read PDF file
          const pdfBuffer = await fs.readFile(filePath);
          const pdfData = new Uint8Array(pdfBuffer);

          // Load PDF document
          const loadingTask = pdfjs.getDocument({
            data: pdfData,
            useSystemFonts: true,
          });

          const pdfDoc = await loadingTask.promise;
          const numPages = Math.min(pdfDoc.numPages, 10); // Max 10 pages

          console.log(`PDF has ${pdfDoc.numPages} pages, converting first ${numPages}`);

          // Convert each page to image
          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better quality

            // Create canvas
            const canvas = createCanvas(viewport.width, viewport.height);
            const context = canvas.getContext('2d');

            // Render PDF page to canvas
            await page.render({
              canvasContext: context as any,
              viewport: viewport,
            }).promise;

            // Convert canvas to base64 PNG
            const base64Data = canvas.toBuffer('image/png').toString('base64');

            allImages.push({
              filename: `${file.originalname} - Page ${pageNum}`,
              mimeType: 'image/png',
              base64Data
            });
          }

          console.log(`✅ Converted PDF to ${allImages.length} images`);
        } catch (pdfError) {
          console.error(`Error converting PDF ${file.originalname}:`, pdfError);
          throw new Error(`Failed to convert PDF: ${pdfError.message}`);
        }
      } else if (file.mimetype.startsWith('image/')) {
        // For image files, just convert to base64
        const buffer = await fs.readFile(filePath);
        const base64Data = buffer.toString('base64');

        allImages.push({
          filename: file.originalname,
          mimeType: file.mimetype,
          base64Data
        });
      } else {
        // Skip unsupported file types
        console.warn(`Unsupported file type: ${file.mimetype}`);
      }
    }

    res.json({
      success: true,
      file_urls,
      images: allImages,
      total_images: allImages.length
    });

  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files', details: error.message });
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
