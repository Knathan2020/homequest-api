/**
 * Usage Tracking Routes
 * Provides real-time usage statistics for calls, transcripts, and transfers
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get today's usage statistics
 */
router.get('/today/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      // Return mock data when database is not available
      return res.json({
        success: true,
        date: today.toISOString().split('T')[0],
        teamId,
        stats: {
          calls: { total: 0, duration: 0, successful: 0 },
          transfers: { total: 0, successful: 0, byDepartment: {} },
          appointments: { scheduled: 0, confirmed: 0 },
          messages: { taken: 0, urgent: 0 }
        }
      });
    }

    // Get call transcripts from today
    const { data: transcripts, error: transcriptError } = await supabase
      .from('call_transcripts')
      .select('*')
      .eq('team_id', teamId)
      .gte('created_at', startOfDay.toISOString())
      .lt('created_at', endOfDay.toISOString());

    if (transcriptError && transcriptError.code !== '42P01') {
      console.error('Error fetching transcripts:', transcriptError);
    }

    // Get call transfers from today
    const { data: transfers, error: transferError } = await supabase
      .from('call_transfers')
      .select('*')
      .eq('team_id', teamId)
      .gte('transferred_at', startOfDay.toISOString())
      .lt('transferred_at', endOfDay.toISOString());

    if (transferError) {
      console.error('Error fetching transfers:', transferError);
    }

    // Get appointments scheduled today
    const { data: appointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('*')
      .eq('team_id', teamId)
      .gte('created_at', startOfDay.toISOString())
      .lt('created_at', endOfDay.toISOString());

    if (appointmentError) {
      console.error('Error fetching appointments:', appointmentError);
    }

    // Get messages taken today
    const { data: messages, error: messageError } = await supabase
      .from('team_messages')
      .select('*')
      .eq('team_id', teamId)
      .gte('created_at', startOfDay.toISOString())
      .lt('created_at', endOfDay.toISOString());

    if (messageError) {
      console.error('Error fetching messages:', messageError);
    }

    // Calculate statistics
    const stats = {
      calls: {
        total: transcripts?.length || 0,
        duration: transcripts?.reduce((sum, t) => sum + (t.duration || 0), 0) || 0,
        successful: transcripts?.filter(t => t.call_status === 'completed').length || 0
      },
      transfers: {
        total: transfers?.length || 0,
        successful: transfers?.filter(t => t.transfer_status === 'connected').length || 0,
        byDepartment: {}
      },
      appointments: {
        scheduled: appointments?.length || 0,
        confirmed: appointments?.filter(a => a.status === 'confirmed').length || 0
      },
      messages: {
        taken: messages?.length || 0,
        urgent: messages?.filter(m => m.urgent).length || 0
      }
    };

    // Group transfers by department
    if (transfers) {
      transfers.forEach(transfer => {
        const dept = transfer.to_department || 'Unknown';
        stats.transfers.byDepartment[dept] = (stats.transfers.byDepartment[dept] || 0) + 1;
      });
    }

    res.json({
      success: true,
      date: today.toISOString().split('T')[0],
      teamId,
      stats
    });

  } catch (error: any) {
    console.error('Usage tracking error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get this week's usage statistics
 */
router.get('/week/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const today = new Date();
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get weekly data
    const { data: transcripts } = await supabase
      .from('call_transcripts')
      .select('*')
      .eq('team_id', teamId)
      .gte('created_at', startOfWeek.toISOString());

    const { data: transfers } = await supabase
      .from('call_transfers')
      .select('*')
      .eq('team_id', teamId)
      .gte('transferred_at', startOfWeek.toISOString());

    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('team_id', teamId)
      .gte('created_at', startOfWeek.toISOString());

    // Group by day
    const dailyStats = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      dailyStats[dateStr] = {
        calls: 0,
        transfers: 0,
        appointments: 0,
        callDuration: 0
      };
    }

    // Populate daily stats
    transcripts?.forEach(t => {
      const date = t.created_at.split('T')[0];
      if (dailyStats[date]) {
        dailyStats[date].calls++;
        dailyStats[date].callDuration += (t.duration || 0);
      }
    });

    transfers?.forEach(t => {
      const date = t.transferred_at.split('T')[0];
      if (dailyStats[date]) {
        dailyStats[date].transfers++;
      }
    });

    appointments?.forEach(a => {
      const date = a.created_at.split('T')[0];
      if (dailyStats[date]) {
        dailyStats[date].appointments++;
      }
    });

    res.json({
      success: true,
      weekStart: startOfWeek.toISOString().split('T')[0],
      teamId,
      dailyStats
    });

  } catch (error: any) {
    console.error('Weekly usage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get live usage summary (for dashboard)
 */
router.get('/live/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get today's calls
    const { data: todayCalls } = await supabase
      .from('call_transcripts')
      .select('id, duration, created_at')
      .eq('team_id', teamId)
      .gte('created_at', today.toISOString());

    // Get active team members
    const { data: activeMembers } = await supabase
      .from('team_members')
      .select('id, name, availability')
      .eq('team_id', teamId)
      .eq('availability', 'available');

    // Get recent activity (last 24 hours)
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const { data: recentTransfers } = await supabase
      .from('call_transfers')
      .select('id, transfer_status, transferred_at')
      .eq('team_id', teamId)
      .gte('transferred_at', last24Hours.toISOString())
      .order('transferred_at', { ascending: false })
      .limit(5);

    const { data: recentAppointments } = await supabase
      .from('appointments')
      .select('id, title, scheduled_at, status')
      .eq('team_id', teamId)
      .gte('created_at', last24Hours.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    const liveStats = {
      today: {
        calls: todayCalls?.length || 0,
        totalDuration: todayCalls?.reduce((sum, call) => sum + (call.duration || 0), 0) || 0,
        averageDuration: todayCalls?.length > 0
          ? Math.round((todayCalls.reduce((sum, call) => sum + (call.duration || 0), 0) / todayCalls.length))
          : 0
      },
      team: {
        availableMembers: activeMembers?.length || 0,
        totalMembers: (await supabase.from('team_members').select('id').eq('team_id', teamId)).data?.length || 0
      },
      recent: {
        transfers: recentTransfers?.map(t => ({
          id: t.id,
          status: t.transfer_status,
          time: t.transferred_at
        })) || [],
        appointments: recentAppointments?.map(a => ({
          id: a.id,
          title: a.title,
          scheduledAt: a.scheduled_at,
          status: a.status
        })) || []
      }
    };

    res.json({
      success: true,
      timestamp: now.toISOString(),
      teamId,
      stats: liveStats
    });

  } catch (error: any) {
    console.error('Live usage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Record a call event (for real-time tracking)
 */
router.post('/event/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { eventType, data } = req.body;

    // Create usage event record
    const { error } = await supabase
      .from('usage_events')
      .insert({
        team_id: teamId,
        event_type: eventType,
        event_data: data,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error recording usage event:', error);
    }

    res.json({
      success: true,
      message: 'Event recorded'
    });

  } catch (error: any) {
    console.error('Event recording error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;