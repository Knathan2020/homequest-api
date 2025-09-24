/**
 * Secure Global RAG Routes
 * Public API endpoints with automatic sensitive data protection
 */

import { Router, Request, Response } from 'express';
import secureRAGService from '../services/secure-rag.service';
import multer from 'multer';
import path from 'path';
import * as fs from 'fs/promises';

const router = Router();

// Configure multer for document uploads
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
    const allowedTypes = /pdf|txt|md|json|docx|png|jpg|jpeg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: pdf, txt, md, json, docx, images'));
    }
  }
});

/**
 * Global RAG Query Endpoint
 * POST /api/secure-rag/query
 * 
 * Accessible globally with automatic sensitive data protection
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { 
      query, 
      projectId,
      includePublic = true,
      maxResults = 10
    } = req.body;

    if (!query) {
      return res.status(400).json({ 
        success: false,
        error: 'Query is required' 
      });
    }

    // Get user ID from auth header if available
    const userId = req.headers['x-user-id'] as string || undefined;

    // Execute secure RAG query
    const result = await secureRAGService.query({
      query,
      projectId,
      userId,
      includePublic,
      maxResults
    });

    // Return sanitized response
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Secure RAG query error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Query processing failed. Please try again.',
      // Never expose internal errors
      details: process.env.NODE_ENV === 'development' ? 
        (error instanceof Error ? error.message : 'Unknown error') : 
        undefined
    });
  }
});

/**
 * Store Knowledge Document
 * POST /api/secure-rag/documents
 * 
 * Automatically detects and protects sensitive content
 */
router.post('/documents', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { 
      title, 
      content,
      type = 'general',
      projectId,
      isPublic = false
    } = req.body;

    let documentContent = content;

    // Process uploaded file if present
    if (req.file) {
      const fileContent = await fs.readFile(req.file.path, 'utf-8');
      documentContent = fileContent;
      
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(console.error);
    }

    if (!title || !documentContent) {
      return res.status(400).json({ 
        success: false,
        error: 'Title and content are required' 
      });
    }

    // Store document with automatic sensitivity detection
    const result = await secureRAGService.storeDocument({
      title,
      content: documentContent,
      type,
      projectId,
      isPublic: isPublic === true || isPublic === 'true',
      metadata: {
        source: req.file ? 'file_upload' : 'direct_input',
        originalName: req.file?.originalname,
        uploadedBy: req.headers['x-user-id'] || 'anonymous'
      }
    });

    if (result.success) {
      res.json({
        success: true,
        documentId: result.id,
        message: 'Document stored successfully'
      });
    } else {
      throw new Error('Failed to store document');
    }

  } catch (error) {
    console.error('Document storage error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to store document'
    });
  }
});

/**
 * Public Knowledge Base Search
 * GET /api/secure-rag/search
 * 
 * Search public knowledge base
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q: query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Search query (q) is required' 
      });
    }

    // Search only public documents
    const result = await secureRAGService.query({
      query,
      includePublic: true,
      maxResults: 5
    });

    res.json({
      success: true,
      results: result.sources,
      answer: result.answer,
      metadata: {
        documentsFound: result.metadata.documentsUsed,
        timestamp: result.metadata.timestamp
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Search failed'
    });
  }
});

/**
 * Health Check for RAG System
 * GET /api/secure-rag/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Test with a simple query
    const testResult = await secureRAGService.query({
      query: 'test',
      maxResults: 1
    });

    res.json({
      success: true,
      status: 'healthy',
      capabilities: {
        query: true,
        storage: true,
        encryption: true,
        sensitiveDataProtection: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'RAG system is not functioning properly',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Upload Construction Knowledge
 * POST /api/secure-rag/knowledge/construction
 * 
 * Specialized endpoint for construction-related documents
 */
router.post('/knowledge/construction', async (req: Request, res: Response) => {
  try {
    const { 
      category, // floor-plans, building-codes, materials, techniques
      title,
      content,
      tags = []
    } = req.body;

    const validCategories = ['floor-plans', 'building-codes', 'materials', 'techniques', 'safety'];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
      });
    }

    const result = await secureRAGService.storeDocument({
      title: `[${category.toUpperCase()}] ${title}`,
      content,
      type: 'construction-knowledge',
      isPublic: true, // Construction knowledge is public by default
      metadata: {
        category,
        tags,
        addedAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      documentId: result.id,
      message: `Construction knowledge added to ${category} category`
    });

  } catch (error) {
    console.error('Construction knowledge storage error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to store construction knowledge'
    });
  }
});

/**
 * Ask Construction Expert
 * POST /api/secure-rag/expert/construction
 * 
 * Specialized construction Q&A endpoint
 */
router.post('/expert/construction', async (req: Request, res: Response) => {
  try {
    const { question, context = {} } = req.body;

    if (!question) {
      return res.status(400).json({ 
        success: false,
        error: 'Question is required' 
      });
    }

    // Enhance query with construction context
    const enhancedQuery = `Construction Expert Question: ${question}
    Context: Building/Floor Plan Analysis
    Focus: Provide practical, code-compliant, and safety-conscious advice.`;

    const result = await secureRAGService.query({
      query: enhancedQuery,
      includePublic: true,
      maxResults: 15
    });

    res.json({
      success: true,
      expertAdvice: result.answer,
      references: result.sources.filter(s => s.type === 'construction-knowledge'),
      disclaimer: 'This advice is for informational purposes. Always consult local building codes and professionals.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Construction expert error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Expert system temporarily unavailable'
    });
  }
});

export default router;