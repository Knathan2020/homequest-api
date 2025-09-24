/**
 * Documents Management API Routes
 * Handles document upload, storage, and team-wide sharing
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import intelligentService from '../services/intelligent-floor-plan.service';
import { QueueService } from '../services/queue/queue.service';

const router = express.Router();
const queueService = new QueueService();

// In-memory storage fallback for documents
const documentsCache: Record<string, any[]> = {};

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    // Create unique filename with timestamp and original name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    const fileName = `${file.fieldname}-${uniqueSuffix}${fileExtension}`;
    cb(null, fileName);
  }
});

// File filter to accept specific document types
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Maximum 10 files at once
  }
});

/**
 * Detect document type based on filename and content
 */
const detectDocumentType = (filename: string, mimeType: string): 'site-plan' | 'floor-plan' | 'other' => {
  const lowerName = filename.toLowerCase();

  // Check for site plan indicators
  if (lowerName.includes('site') || lowerName.includes('plot') ||
      lowerName.includes('property') || lowerName.includes('lot') ||
      lowerName.includes('setback') || lowerName.includes('survey')) {
    return 'site-plan';
  }

  // Check for floor plan indicators
  if (lowerName.includes('floor') || lowerName.includes('plan') ||
      lowerName.includes('layout') || lowerName.includes('blueprint') ||
      lowerName.includes('architectural')) {
    return 'floor-plan';
  }

  // Check if it's an image or PDF (likely a plan)
  if (mimeType.includes('image') || mimeType === 'application/pdf') {
    // Default to floor plan for images/PDFs without clear naming
    return 'floor-plan';
  }

  return 'other';
};

/**
 * Trigger AI analysis for uploaded documents
 */
const triggerAIAnalysis = async (document: any, documentType: string): Promise<void> => {
  try {
    console.log(`🤖 Triggering AI analysis for ${documentType}: ${document.original_name}`);

    // Add to processing queue with appropriate priority
    const jobData = {
      documentId: document.id,
      documentPath: document.file_path,
      documentType,
      projectId: document.project_id,
      teamId: document.team_id,
      originalName: document.original_name,
      mimeType: document.mime_type
    };

    // Determine queue and priority based on document type
    let queueName = 'ai-processing';
    let priority: any = 'NORMAL';

    if (documentType === 'site-plan') {
      queueName = 'vision-processing';
      priority = 'HIGH'; // Site plans are usually more urgent
    } else if (documentType === 'floor-plan') {
      queueName = 'pipeline-processing';
      priority = 'NORMAL';
    }

    // Add job to queue for background processing
    const job = await queueService.addJob(queueName, jobData, {
      priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });

    console.log(`✅ Analysis job queued: ${job.id} for ${documentType}`);

    // For immediate GPT-4 Vision processing
    if ((documentType === 'floor-plan' || documentType === 'site-plan') && document.file_path) {
      const fullPath = path.join(process.cwd(), document.file_path.replace('/uploads/', 'uploads/'));

      // Use GPT-4 Vision for image analysis
      console.log(`👁️ Using GPT-4 Vision to analyze ${documentType}`);

      // Import vision service dynamically
      import('../services/ai/gpt-vision.service').then(async (module) => {
        const { GPTVisionService } = module;
        const visionService = new GPTVisionService();

        try {
          // Prepare the vision prompt based on document type
          let analysisPrompt = '';

          if (documentType === 'site-plan') {
            analysisPrompt = `Analyze this site plan image and identify:
1. Property boundaries and dimensions
2. Setback measurements (front, rear, side)
3. Building footprint location
4. Driveway and landscaping areas
5. Any zoning annotations or measurements
6. North arrow orientation
7. Scale information
Provide detailed measurements and spatial relationships.`;
          } else if (documentType === 'floor-plan') {
            analysisPrompt = `Analyze this floor plan image and identify:
1. All rooms with their labels and approximate dimensions
2. Wall locations (interior vs exterior)
3. Door and window placements
4. Total square footage if visible
5. Any measurements or dimensions shown
6. Room types (bedroom, bathroom, kitchen, etc.)
7. Structural elements (stairs, columns, etc.)
Provide a detailed breakdown of the spatial layout.`;
          }

          // Read the image file
          const imageBuffer = await fs.readFile(fullPath);

          // Call GPT-4 Vision API
          console.log(`\n📸 GPT-4 Vision Input:`, {
            documentName: document.original_name,
            documentType,
            imageSize: imageBuffer.length,
            promptPreview: analysisPrompt.substring(0, 200) + '...'
          });

          const visionAnalysis = await visionService.analyzeFloorPlan({
            imageBuffer,
            analysisType: 'full',
            prompt: analysisPrompt
          });

          console.log(`✅ GPT-4 Vision analysis completed for ${document.original_name}`);

          // Log what GPT-4 Vision found
          console.log(`\n🔍 GPT-4 Vision Results:`, {
            documentId: document.id,
            success: visionAnalysis.success,
            roomsFound: visionAnalysis.analysis?.rooms?.length || 0,
            dimensionsExtracted: visionAnalysis.analysis?.dimensions?.length || 0,
            featuresDetected: visionAnalysis.analysis?.features?.length || 0,
            confidenceScore: visionAnalysis.analysis?.confidence_score || 0,
            processingTime: visionAnalysis.processing_time || 0
          });

          // Log sample of what was detected
          if (visionAnalysis.analysis?.rooms?.length > 0) {
            console.log(`\n🏠 Sample Rooms Detected:`,
              visionAnalysis.analysis.rooms.slice(0, 3).map(r => ({
                type: r.type,
                label: r.label,
                confidence: r.confidence
              }))
            );
          }

          if (visionAnalysis.raw_response) {
            console.log(`\n📝 GPT-4 Raw Response Preview:`,
              visionAnalysis.raw_response.substring(0, 300) + '...'
            );
          }

          // Store the vision analysis results
          if (visionAnalysis && visionAnalysis.success) {
            // Save to database or emit event with results
            const analysisResult = {
              documentId: document.id,
              documentType,
              rooms: visionAnalysis.analysis.rooms,
              dimensions: visionAnalysis.analysis.dimensions,
              features: visionAnalysis.analysis.features,
              textAnnotations: visionAnalysis.analysis.text_annotations,
              unclearAreas: visionAnalysis.analysis.unclear_areas,
              confidence: visionAnalysis.analysis.confidence_score,
              rawResponse: visionAnalysis.raw_response,
              timestamp: new Date().toISOString()
            };

            // Save to Supabase - check if table exists first
            try {
              const { error: saveError } = await supabase
                .from('document_analysis')
                .upsert({
                  document_id: document.id,
                  analysis_type: 'gpt-vision',
                  document_type: documentType,
                  analysis_data: analysisResult,
                  confidence_score: visionAnalysis.analysis.confidence_score,
                  created_at: new Date().toISOString()
                });

              if (saveError) {
                console.error('Failed to save to document_analysis table:', saveError);

                // Fallback: Save analysis with the document itself
                const { error: updateError } = await supabase
                  .from('documents')
                  .update({
                    ai_analysis: analysisResult,
                    analysis_completed: true,
                    analyzed_at: new Date().toISOString()
                  })
                  .eq('id', document.id);

                if (updateError) {
                  console.error('Failed to update document with analysis:', updateError);

                  // Final fallback: Save to in-memory cache
                  if (!documentsCache[document.team_id]) {
                    documentsCache[document.team_id] = [];
                  }
                  const docIndex = documentsCache[document.team_id].findIndex(d => d.id === document.id);
                  if (docIndex >= 0) {
                    documentsCache[document.team_id][docIndex].ai_analysis = analysisResult;
                    documentsCache[document.team_id][docIndex].analysis_completed = true;
                    console.log('💾 Analysis saved to cache for document:', document.id);
                  }
                } else {
                  console.log('💾 Analysis saved to document record');
                }
              } else {
                console.log('💾 Analysis results saved to document_analysis table');
              }
            } catch (err) {
              console.error('Error saving analysis:', err);
              // Store in memory as last resort
              document.ai_analysis = analysisResult;
              console.log('📝 Analysis stored in memory with document');
            }

            // Also save analysis to server filesystem
            try {
              const analysisDir = path.join(process.cwd(), 'uploads', 'analysis');
              await fs.mkdir(analysisDir, { recursive: true });

              const analysisFilePath = path.join(analysisDir, `${document.id}-analysis.json`);
              await fs.writeFile(analysisFilePath, JSON.stringify({
                documentId: document.id,
                documentName: document.original_name,
                documentType,
                analysis: analysisResult,
                timestamp: new Date().toISOString()
              }, null, 2));

              console.log('📁 Analysis saved to server:', analysisFilePath);
            } catch (fsError) {
              console.error('Failed to save analysis to filesystem:', fsError);
            }

            // Log summary
            console.log('📊 Vision Analysis Results:', {
              documentId: document.id,
              type: documentType,
              roomsFound: visionAnalysis.analysis.rooms.length,
              dimensionsExtracted: visionAnalysis.analysis.dimensions.length,
              confidence: visionAnalysis.analysis.confidence_score
            });
          }

        } catch (error) {
          console.error(`❌ GPT-4 Vision analysis failed for ${document.original_name}:`, error);
        }
      }).catch(error => {
        console.error('Failed to load vision service:', error);
      });
    }

  } catch (error) {
    console.error('Failed to trigger AI analysis:', error);
    // Don't throw - we don't want to fail document upload if analysis fails
  }
};

// Helper function to generate thumbnails
const generateThumbnail = async (filePath: string, filename: string): Promise<string | null> => {
  try {
    const isImage = /\.(jpe?g|png|gif|webp|tiff)$/i.test(filename);

    if (isImage) {
      const thumbnailDir = path.join(process.cwd(), 'uploads', 'documents', 'thumbnails');
      await fs.mkdir(thumbnailDir, { recursive: true });

      const thumbnailPath = path.join(thumbnailDir, `thumb_${filename}`);

      await sharp(filePath)
        .resize(300, 300, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      return `/uploads/documents/thumbnails/thumb_${filename}`;
    }

    return null;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
};

// Interface for document data
interface DocumentData {
  name: string;
  original_name: string;
  file_name?: string;
  file_path: string;
  file_url?: string;
  thumbnail_path: string | null;
  file_size: number;
  mime_type: string;
  document_type?: string;
  project_id?: string;
  team_id: string;
  uploaded_by: string;
  tags: string[];
  description?: string;
  ai_analysis?: any;
  analysis_completed?: boolean;
  analyzed_at?: string;
}

/**
 * @route   GET /api/documents
 * @desc    Get all documents for a team/project
 * @access  Public (team-based)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { team_id, project_id } = req.query;

    if (!team_id) {
      return res.status(400).json({
        success: false,
        error: 'team_id is required'
      });
    }

    console.log('📥 GET documents request:', {
      team_id,
      project_id,
      cacheKeys: Object.keys(documentsCache),
      cacheForTeam: documentsCache[team_id as string]?.length || 0
    });

    // Try database first, then fallback to cache
    let documents: any[] = [];

    try {
      let query = supabase
        .from('documents')
        .select('*')
        .eq('team_id', team_id)
        .order('created_at', { ascending: false });

      // Filter by project if provided
      if (project_id) {
        query = query.eq('project_id', project_id);
      }

      const { data: dbDocuments, error } = await query;

      if (error) {
        console.error('Error fetching documents from database:', error);
        // Fallback to cache
        documents = documentsCache[team_id as string] || [];
        if (project_id) {
          documents = documents.filter((doc: any) => doc.project_id === project_id);
        }
        console.log('📁 Using in-memory cache for documents');
      } else {
        // Even if no error, check cache and merge with database results
        const cachedDocs = documentsCache[team_id as string] || [];
        const dbDocs = dbDocuments || [];

        // Merge cache with database, preferring cache for duplicates
        const mergedMap = new Map();
        dbDocs.forEach((doc: any) => mergedMap.set(doc.id, doc));
        cachedDocs.forEach((doc: any) => mergedMap.set(doc.id, doc));

        documents = Array.from(mergedMap.values());

        if (project_id) {
          documents = documents.filter((doc: any) => doc.project_id === project_id);
        }

        console.log(`📁 Merged ${dbDocs.length} DB docs with ${cachedDocs.length} cached docs = ${documents.length} total`);
      }
    } catch (dbError) {
      // Complete database failure - use cache
      console.error('Database connection failed, using cache:', dbError);
      documents = documentsCache[team_id as string] || [];
      if (project_id) {
        documents = documents.filter((doc: any) => doc.project_id === project_id);
      }
    }

    res.json({
      success: true,
      data: documents,
      count: documents.length
    });

  } catch (error) {
    console.error('Error in GET /documents:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/documents/upload
 * @desc    Upload multiple documents with thumbnails
 * @access  Public (team-based)
 */
router.post('/upload', upload.array('documents', 10), async (req: Request, res: Response) => {
  try {
    const { team_id, project_id, uploaded_by, tags, description } = req.body;
    const files = req.files as Express.Multer.File[];

    // Ensure team_id is a string
    const teamIdStr = typeof team_id === 'object' ? JSON.stringify(team_id) : String(team_id);

    console.log('📤 Document upload request:', {
      team_id: teamIdStr,
      project_id,
      uploaded_by,
      filesCount: files?.length
    });

    if (!teamIdStr || !uploaded_by) {
      return res.status(400).json({
        success: false,
        error: 'team_id and uploaded_by are required'
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const uploadedDocuments = [];

    for (const file of files) {
      try {
        // Generate thumbnail if it's an image
        const thumbnailPath = await generateThumbnail(file.path, file.filename);

        // Parse tags if provided
        let parsedTags: string[] = [];
        if (tags) {
          try {
            parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
          } catch {
            parsedTags = Array.isArray(tags) ? tags : [tags];
          }
        }

        // Prepare document data - matching actual database columns
        const documentData: DocumentData = {
          name: file.originalname, // Display name
          original_name: file.originalname,
          file_name: file.filename, // Actual stored filename
          file_path: `/uploads/documents/${file.filename}`,
          file_url: `/uploads/documents/${file.filename}`, // URL for accessing
          thumbnail_path: thumbnailPath,
          file_size: file.size,
          mime_type: file.mimetype,
          document_type: detectDocumentType(file.originalname, file.mimetype),
          project_id: project_id || null,
          team_id: teamIdStr,
          uploaded_by,
          tags: parsedTags,
          description: description || null
        };

        // Try to save to database, fallback to in-memory storage
        let savedDoc = null;

        try {
          const { data: dbDoc, error: saveError } = await supabase
            .from('documents')
            .insert(documentData)
            .select()
            .single();

          if (saveError) {
            console.error('Error saving document to database:', saveError);
            // Fallback to in-memory storage
            savedDoc = {
              id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ...documentData,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            // Store in memory
            if (!documentsCache[teamIdStr]) {
              documentsCache[teamIdStr] = [];
            }
            documentsCache[teamIdStr].push(savedDoc);
            console.log('📁 Document saved to in-memory storage as fallback', {
              teamId: teamIdStr,
              docId: savedDoc.id
            });
          } else {
            savedDoc = dbDoc;
          }
        } catch (dbError) {
          // Complete database failure - use in-memory storage
          console.error('Database connection failed, using in-memory storage:', dbError);
          savedDoc = {
            id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...documentData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          if (!documentsCache[teamIdStr]) {
            documentsCache[teamIdStr] = [];
          }
          documentsCache[teamIdStr].push(savedDoc);
        }

        if (savedDoc) {
          uploadedDocuments.push(savedDoc);

          // Detect document type and trigger AI analysis
          const documentType = detectDocumentType(file.originalname, file.mimetype);
          if (documentType !== 'other') {
            // Don't await - let it process in background
            triggerAIAnalysis(savedDoc, documentType);
          }
        }

      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        // Continue with other files
      }
    }

    if (uploadedDocuments.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to upload any documents'
      });
    }

    res.json({
      success: true,
      data: uploadedDocuments,
      message: `Successfully uploaded ${uploadedDocuments.length} document(s)`
    });

  } catch (error) {
    console.error('Error in POST /documents/upload:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/documents/:id
 * @desc    Get a specific document
 * @access  Public (team-based)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { team_id } = req.query;

    if (!team_id) {
      return res.status(400).json({
        success: false,
        error: 'team_id is required'
      });
    }

    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('team_id', team_id)
      .single();

    if (error || !document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      data: document
    });

  } catch (error) {
    console.error('Error in GET /documents/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route   DELETE /api/documents/:id
 * @desc    Delete a document
 * @access  Public (team-based)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { team_id } = req.query;

    if (!team_id) {
      return res.status(400).json({
        success: false,
        error: 'team_id is required'
      });
    }

    // Get document info first
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('team_id', team_id)
      .single();

    if (fetchError || !document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Delete files from filesystem
    try {
      if (document.file_path) {
        const filePath = path.join(process.cwd(), document.file_path.replace('/uploads/', 'uploads/'));
        await fs.unlink(filePath);
      }

      if (document.thumbnail_path) {
        const thumbnailPath = path.join(process.cwd(), document.thumbnail_path.replace('/uploads/', 'uploads/'));
        await fs.unlink(thumbnailPath);
      }
    } catch (fileError) {
      console.error('Error deleting files:', fileError);
      // Continue with database deletion even if file deletion fails
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('team_id', team_id);

    if (deleteError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete document'
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error in DELETE /documents/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route   PUT /api/documents/:id
 * @desc    Update document metadata
 * @access  Public (team-based)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { team_id, tags, description } = req.body;

    if (!team_id) {
      return res.status(400).json({
        success: false,
        error: 'team_id is required'
      });
    }

    const updateData: any = {};

    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags : [tags];
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    updateData.updated_at = new Date().toISOString();

    const { data: updatedDoc, error } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', id)
      .eq('team_id', team_id)
      .select()
      .single();

    if (error || !updatedDoc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found or update failed'
      });
    }

    res.json({
      success: true,
      data: updatedDoc,
      message: 'Document updated successfully'
    });

  } catch (error) {
    console.error('Error in PUT /documents/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/documents/debug/cache
 * @desc    Debug endpoint to view cache contents
 * @access  Public
 */
router.get('/debug/cache', async (req: Request, res: Response) => {
  try {
    const cacheInfo = {
      totalTeams: Object.keys(documentsCache).length,
      teams: {} as any
    };

    for (const teamId in documentsCache) {
      cacheInfo.teams[teamId] = {
        documentsCount: documentsCache[teamId].length,
        documents: documentsCache[teamId].map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          original_name: doc.original_name,
          project_id: doc.project_id,
          team_id: doc.team_id
        }))
      };
    }

    res.json({
      success: true,
      cache: cacheInfo
    });
  } catch (error) {
    console.error('Error in debug cache:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Error handling middleware for multer
router.use((error: any, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum is 10 files per upload.'
      });
    }
  }

  if (error.message.includes('File type') && error.message.includes('not allowed')) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  next(error);
});

/**
 * @route   GET /api/documents/:id/analysis
 * @desc    Get AI analysis for a specific document
 * @access  Public
 */
router.get('/:id/analysis', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log('📊 Fetching analysis for document:', id);

    // Try to read from filesystem first
    try {
      const analysisPath = path.join(process.cwd(), 'uploads', 'analysis', `${id}-analysis.json`);
      const analysisData = await fs.readFile(analysisPath, 'utf8');
      const analysis = JSON.parse(analysisData);

      return res.json({
        success: true,
        data: analysis,
        source: 'filesystem'
      });
    } catch (fsError) {
      console.log('Analysis not found on filesystem, checking database...');
    }

    // Try database
    const { data: dbAnalysis, error } = await supabase
      .from('document_analysis')
      .select('*')
      .eq('document_id', id)
      .single();

    if (dbAnalysis) {
      return res.json({
        success: true,
        data: dbAnalysis,
        source: 'database'
      });
    }

    // Check in-memory cache
    for (const teamDocs of Object.values(documentsCache)) {
      const doc = (teamDocs as any[]).find((d: any) => d.id === id);
      if (doc && doc.ai_analysis) {
        return res.json({
          success: true,
          data: {
            documentId: id,
            analysis: doc.ai_analysis,
            source: 'cache'
          }
        });
      }
    }

    return res.status(404).json({
      success: false,
      error: 'Analysis not found for this document'
    });

  } catch (error) {
    console.error('Error fetching document analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis'
    });
  }
});

export default router;