import express from 'express';
import { createClient } from '@supabase/supabase-js';
import vapiService from '../services/vapi.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// Get communication stats for dashboard
router.get('/stats', async (req, res) => {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ error: 'teamId is required' });
    }

    // Get calls count from Vapi
    const allCalls = await vapiService.listCalls(1000);

    // 🔥 FIX: Filter calls by teamId from metadata
    const calls = allCalls?.filter((call: any) => {
      // Check if metadata exists and has teamId matching our team
      return call.metadata?.teamId === teamId;
    }) || [];

    const callsCount = calls.length;

    // Get messages count from Supabase
    const { count: messagesCount } = await supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    // Calculate response rate (calls answered / total calls) - NOW TEAM-SPECIFIC
    const answeredCalls = calls.filter((call: any) =>
      call.endedReason === 'assistant-ended-call' ||
      call.endedReason === 'customer-ended-call'
    ).length;
    const responseRate = callsCount > 0 ? Math.round((answeredCalls / callsCount) * 100) : 0;

    // Calculate MTD spend from Vapi costs - NOW TEAM-SPECIFIC
    const totalCost = calls.reduce((sum: number, call: any) => sum + (call.cost || 0), 0);

    res.json({
      success: true,
      stats: {
        callsMade: callsCount,
        messages: messagesCount || 0,
        responseRate: responseRate,
        mtdSpend: totalCost.toFixed(2)
      }
    });
  } catch (error: any) {
    console.error('Error fetching communication stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent activity (calls, SMS, appointments - NO EMAILS for privacy)
router.get('/recent-activity', async (req, res) => {
  try {
    const { teamId, limit = 10 } = req.query;

    if (!teamId) {
      return res.status(400).json({ error: 'teamId is required' });
    }

    // Get recent activity from team_activity table (where we log everything)
    const { data: activities, error } = await supabase
      .from('team_activity')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      activities: activities || []
    });
  } catch (error: any) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
