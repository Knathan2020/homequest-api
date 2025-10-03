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
    const calls = await vapiService.listCalls(1000);
    const callsCount = calls?.length || 0;

    // Get messages count from Supabase
    const { count: messagesCount } = await supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    // Calculate response rate (calls answered / total calls)
    const answeredCalls = calls?.filter((call: any) =>
      call.endedReason === 'assistant-ended-call' ||
      call.endedReason === 'customer-ended-call'
    ).length || 0;
    const responseRate = callsCount > 0 ? Math.round((answeredCalls / callsCount) * 100) : 0;

    // Calculate MTD spend from Vapi costs
    const totalCost = calls?.reduce((sum: number, call: any) => sum + (call.cost || 0), 0) || 0;

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

export default router;
