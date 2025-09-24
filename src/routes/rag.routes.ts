/**
 * RAG (Retrieval Augmented Generation) Routes
 * Endpoints for OpenAI-powered RAG system
 */

import { Router, Request, Response } from 'express';
import { openAIRAGService } from '../services/openai-rag.service';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: './uploads/rag-documents/',
  filename: (req, file, cb) => {
    const uniqueName = `rag-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|txt|md|json|png|jpg|jpeg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

/**
 * Query the RAG system with a question
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { 
      query, 
      projectId, 
      sessionId,
      includeYOLO,
      includeOCR,
      imagePath 
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const response = await openAIRAGService.queryWithRAG(query, {
      projectId,
      sessionId,
      includeYOLO,
      includeOCR,
      imagePath
    });

    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('RAG Query Error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'RAG query failed' 
    });
  }
});

/**
 * Store a new document in the knowledge base
 */
router.post('/documents', upload.single('document'), async (req: Request, res: Response) => {
  try {
    const { title, content, type, metadata } = req.body;
    let documentContent = content;

    // If a file was uploaded, read its content
    if (req.file) {
      const fs = await import('fs/promises');
      documentContent = await fs.readFile(req.file.path, 'utf-8');
    }

    if (!title || !documentContent || !type) {
      return res.status(400).json({ 
        error: 'Title, content, and type are required' 
      });
    }

    await openAIRAGService.storeDocument({
      title,
      content: documentContent,
      type,
      metadata: metadata ? JSON.parse(metadata) : {}
    });

    res.json({
      success: true,
      message: 'Document stored successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Document Storage Error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store document' 
    });
  }
});

/**
 * Query construction-specific knowledge
 */
router.post('/construction-knowledge', async (req: Request, res: Response) => {
  try {
    const { query, category } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await openAIRAGService.queryConstructionKnowledge(query, category);

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Construction Knowledge Query Error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Query failed' 
    });
  }
});

/**
 * Extract text from an image using OCR
 */
router.post('/ocr', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const ocrResult = await openAIRAGService.extractTextOCR(req.file.path);

    res.json({
      success: true,
      ...ocrResult,
      imagePath: req.file.path,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'OCR extraction failed' 
    });
  }
});

/**
 * Detect objects in an image using YOLO
 */
router.post('/detect-objects', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const detections = await openAIRAGService.detectObjectsYOLO(req.file.path);

    res.json({
      success: true,
      detections,
      imagePath: req.file.path,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('YOLO Detection Error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Object detection failed' 
    });
  }
});

/**
 * Update conversation memory
 */
router.post('/conversation', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, projectId } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ 
        error: 'Session ID and message are required' 
      });
    }

    await openAIRAGService.updateConversation(sessionId, message, projectId);

    res.json({
      success: true,
      message: 'Conversation updated',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Conversation Update Error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update conversation' 
    });
  }
});

/**
 * Health check for RAG service
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'OpenAI RAG Service',
    status: 'operational',
    features: [
      'Vector embeddings (text-embedding-3-small)',
      'Document retrieval',
      'YOLO object detection',
      'Tesseract OCR',
      'GPT-4o generation',
      'Construction knowledge base'
    ],
    timestamp: new Date().toISOString()
  });
});

export default router;