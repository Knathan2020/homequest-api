/**
 * Conversation Transcripts API Routes
 */

import express from 'express';
import conversationTranscriptService from '../services/conversation-transcript.service';

const router = express.Router();

/**
 * Get recent conversation transcripts for a team
 */
router.get('/transcripts/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const transcripts = await conversationTranscriptService.getRecentTranscripts(teamId, limit);
    
    res.json({
      success: true,
      transcripts
    });
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation transcripts'
    });
  }
});

/**
 * Get conversation analytics for a team
 */
router.get('/analytics/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const analytics = await conversationTranscriptService.getAnalytics(teamId);
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation analytics'
    });
  }
});

/**
 * Search conversation transcripts
 */
router.get('/search/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    const transcripts = await conversationTranscriptService.searchTranscripts(teamId, q as string);
    
    res.json({
      success: true,
      transcripts
    });
  } catch (error) {
    console.error('Error searching transcripts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search conversation transcripts'
    });
  }
});

export default router;