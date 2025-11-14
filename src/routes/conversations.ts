/**
 * Conversation Transcripts API Routes
 */

import express from 'express';
import conversationTranscriptService from '../services/conversation-transcript.service';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

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

/**
 * Get SMS messages/conversations for a team
 */
router.get('/messages/team/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Fetch messages from Supabase - assuming team members are linked to teams
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      messages: messages || []
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages'
    });
  }
});

/**
 * Get SMS messages/conversations for a user (legacy support)
 */
router.get('/messages/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Fetch messages from Supabase
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      messages: messages || []
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages'
    });
  }
});

/**
 * Get messages grouped by vendor (conversation threads)
 */
router.get('/threads/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch messages grouped by vendor
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        *,
        vendor_contacts(id, name, company, phone)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Group messages by vendor_id
    const threads = messages?.reduce((acc: any, msg: any) => {
      const vendorId = msg.vendor_id || 'unknown';
      if (!acc[vendorId]) {
        acc[vendorId] = {
          vendor: msg.vendor_contacts,
          messages: []
        };
      }
      acc[vendorId].messages.push(msg);
      return acc;
    }, {});

    res.json({
      success: true,
      threads: threads || {}
    });
  } catch (error) {
    console.error('Error fetching conversation threads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation threads'
    });
  }
});

export default router;