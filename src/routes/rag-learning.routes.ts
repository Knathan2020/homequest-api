// ========================================
// RAG LEARNING ROUTES - rag-learning.routes.ts
// API endpoints for RAG learning system
// ========================================

import { Router, Request, Response } from 'express';
import { ragLearningService } from '../services/rag-learning.service';

const router = Router();

/**
 * Save manual edits for learning (comprehensive)
 */
router.post('/edits/manual', async (req: Request, res: Response) => {
  try {
    const { type, data, action, sessionId } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid data'
      });
    }
    
    // Start new session if not provided
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = ragLearningService.startSession('manual_edit_' + Date.now());
    }
    
    // Handle different types of edits
    switch (type) {
      case 'walls':
        if (action === 'add') {
          ragLearningService.addWallData(data.map(w => ({ ...w, source: 'manual' })), 'manual');
        } else if (action === 'delete') {
          data.forEach(item => item.id && ragLearningService.markWallDeleted(item.id));
        }
        break;
        
      case 'rooms':
        if (action === 'add' || action === 'update') {
          ragLearningService.addRoomData(data.map(r => ({ ...r, source: 'manual' })), 'manual');
        } else if (action === 'delete') {
          data.forEach(item => item.id && ragLearningService.markRoomDeleted(item.id));
        }
        break;
        
      case 'doors':
        if (action === 'add') {
          ragLearningService.addDoorData(data.map(d => ({ ...d, source: 'manual' })), 'manual');
        } else if (action === 'delete') {
          data.forEach(item => item.id && ragLearningService.markDoorDeleted(item.id));
        }
        break;
        
      case 'windows':
        if (action === 'add') {
          ragLearningService.addWindowData(data.map(w => ({ ...w, source: 'manual' })), 'manual');
        } else if (action === 'delete') {
          data.forEach(item => item.id && ragLearningService.markWindowDeleted(item.id));
        }
        break;
        
      case 'measurements':
        ragLearningService.addMeasurementData(data, 'manual');
        break;
    }
    
    // Auto-save every edit
    const savedPath = ragLearningService.saveSession();
    
    res.json({
      success: true,
      sessionId: activeSessionId,
      savedPath,
      message: `Saved ${data.length} ${action} ${type} for RAG learning`
    });
  } catch (error: any) {
    console.error('RAG learning error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Save manual wall edits for learning (backward compatibility)
 */
router.post('/walls/manual', async (req: Request, res: Response) => {
  try {
    const { walls, action, sessionId } = req.body;
    
    if (!walls || !Array.isArray(walls)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid walls data'
      });
    }
    
    // Start new session if not provided
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = ragLearningService.startSession('manual_edit_' + Date.now());
    }
    
    // Add wall data based on action
    if (action === 'add') {
      ragLearningService.addWallData(walls.map(w => ({ ...w, source: 'manual' })), 'manual');
    } else if (action === 'delete') {
      walls.forEach(wall => {
        if (wall.id) {
          ragLearningService.markWallDeleted(wall.id);
        }
      });
    }
    
    // Auto-save
    const savedPath = ragLearningService.saveSession();
    
    res.json({
      success: true,
      sessionId: activeSessionId,
      savedPath,
      message: `Saved ${walls.length} ${action} wall actions for RAG learning`
    });
  } catch (error: any) {
    console.error('RAG learning error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Apply RAG predictions to detected features
 */
router.post('/predict', async (req: Request, res: Response) => {
  try {
    const { features, autoApply = false } = req.body;
    
    if (!features) {
      return res.status(400).json({
        success: false,
        error: 'Features object required'
      });
    }
    
    // Get predictions
    const predictions = autoApply 
      ? ragLearningService.autoApplyCorrections(features)
      : ragLearningService.predictConfidence(features);
    
    // Get current patterns for debugging
    const patterns = ragLearningService.analyzePatterns();
    
    res.json({
      success: true,
      predictions,
      patterns: {
        totalSessions: patterns.totalSessions,
        confidence: patterns.confidence,
        hasEnoughData: patterns.totalSessions >= 3
      },
      message: predictions.autoApplied 
        ? `Applied RAG corrections: ${predictions.removedCount} walls removed, ${predictions.suggestedCount} suggested`
        : 'RAG predictions generated'
    });
  } catch (error: any) {
    console.error('RAG prediction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get RAG learning patterns analysis
 */
router.get('/patterns', async (req: Request, res: Response) => {
  try {
    const patterns = ragLearningService.analyzePatterns();
    
    res.json({
      success: true,
      patterns,
      readyForPredictions: patterns.totalSessions >= 3,
      readyForAutoApply: patterns.confidence >= 30
    });
  } catch (error: any) {
    console.error('RAG patterns error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add user feedback for learning
 */
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const { accuracy, corrections, notes } = req.body;
    
    if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid accuracy value (0-100 required)'
      });
    }
    
    ragLearningService.addUserFeedback(accuracy, corrections || 0, notes);
    const savedPath = ragLearningService.saveSession();
    
    res.json({
      success: true,
      savedPath,
      message: 'User feedback saved for RAG learning'
    });
  } catch (error: any) {
    console.error('RAG feedback error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get learning statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = ragLearningService.getLearningStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('RAG stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start a new learning session
 */
router.post('/session/start', async (req: Request, res: Response) => {
  try {
    const { imageHash } = req.body;
    
    const sessionId = ragLearningService.startSession(imageHash || 'unknown');
    
    res.json({
      success: true,
      sessionId,
      message: 'RAG learning session started'
    });
  } catch (error: any) {
    console.error('RAG session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Save current session
 */
router.post('/session/save', async (req: Request, res: Response) => {
  try {
    const { processingTime } = req.body;
    
    const savedPath = ragLearningService.saveSession(processingTime);
    
    if (!savedPath) {
      return res.status(400).json({
        success: false,
        error: 'No active session to save'
      });
    }
    
    res.json({
      success: true,
      savedPath,
      message: 'RAG learning session saved'
    });
  } catch (error: any) {
    console.error('RAG save error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;