/**
 * Builder Briefing Routes
 * Handles pre-call briefing management for builders
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import callPreparationService, { BuilderBriefing } from '../services/call-preparation.service';
import openaiRealtimeApiService from '../services/openai-realtime-api.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

/**
 * Create or update a builder briefing for a specific vendor call
 * POST /api/builder-briefing
 */
router.post('/', async (req, res) => {
  try {
    const {
      vendor_phone,
      team_id,
      briefing,
      project_details,
      builder_name,
      company_name
    } = req.body;

    if (!vendor_phone || !team_id || !briefing) {
      return res.status(400).json({
        error: 'Missing required fields: vendor_phone, team_id, briefing'
      });
    }

    // Store briefing in database
    const { data, error } = await supabase
      .from('call_contexts')
      .upsert({
        vendor_phone,
        context: {
          type: 'builder_briefing',
          briefing,
          project_details,
          builder_name,
          company_name,
          created_at: new Date().toISOString()
        }
      }, {
        onConflict: 'vendor_phone'
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving briefing:', error);
      return res.status(500).json({ error: 'Failed to save briefing' });
    }

    console.log('📋 Builder briefing saved for vendor:', vendor_phone);

    res.json({
      success: true,
      briefing_id: data.id,
      message: 'Briefing saved successfully'
    });
  } catch (error) {
    console.error('Error in create briefing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get existing briefing for a vendor
 * GET /api/builder-briefing/:vendor_phone
 */
router.get('/:vendor_phone', async (req, res) => {
  try {
    const { vendor_phone } = req.params;
    const { team_id } = req.query;

    if (!team_id) {
      return res.status(400).json({ error: 'team_id query parameter required' });
    }

    const { data, error } = await supabase
      .from('call_contexts')
      .select('*')
      .eq('vendor_phone', vendor_phone)
      .eq('context->>type', 'builder_briefing')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching briefing:', error);
      return res.status(500).json({ error: 'Failed to fetch briefing' });
    }

    if (!data) {
      return res.json({
        exists: false,
        briefing: null
      });
    }

    res.json({
      exists: true,
      briefing: data.context.briefing,
      created_at: data.created_at
    });
  } catch (error) {
    console.error('Error in get briefing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Initiate a call with builder briefing
 * POST /api/builder-briefing/call
 */
router.post('/call', async (req, res) => {
  try {
    const {
      vendor_name,
      vendor_company,
      vendor_phone,
      project_details,
      team_id,
      builder_name,
      company_name,
      briefing
    } = req.body;

    if (!vendor_phone || !briefing) {
      return res.status(400).json({
        error: 'Missing required fields: vendor_phone, briefing'
      });
    }

    console.log('🎯 Initiating briefed call to:', vendor_name, 'from', vendor_company);

    // Transform QuickCallBriefing format to expected format if needed
    let normalizedBriefing = briefing;
    if (briefing.objective && !briefing.primary_objective) {
      // This is a QuickCallBriefing format, transform it
      normalizedBriefing = {
        primary_objective: briefing.objective,
        conversation_topics: Array.isArray(briefing.topics) ? briefing.topics : [],
        key_messages: [
          `Approach: ${briefing.approach}`,
          briefing.custom_notes ? `Note: ${briefing.custom_notes}` : ''
        ].filter(Boolean),
        must_mention_points: Array.isArray(briefing.topics) ? briefing.topics.slice(0, 3) : [],
        questions_to_ask: [
          'What\'s your current availability?',
          'What would you need to provide a detailed quote?',
          'Do you have experience with similar projects?'
        ],
        urgency: briefing.urgency || 'normal',
        custom_notes: briefing.custom_notes
      };
    }

    console.log('📋 Primary objective:', normalizedBriefing.primary_objective);

    // Prepare enhanced context with briefing
    const enhancedContext = await callPreparationService.prepareCallContext({
      vendorId: `briefed_${Date.now()}`,
      vendorName: vendor_name,
      vendorCompany: vendor_company,
      vendorPhone: vendor_phone,
      projectDetails: project_details,
      teamId: team_id,
      builderName: builder_name,
      companyName: company_name,
      builderBriefing: normalizedBriefing
    });

    // Initiate the enhanced call
    const callResult = await openaiRealtimeApiService.initiateEnhancedRealtimeCall({
      to: vendor_phone,
      vendorName: vendor_name,
      vendorCompany: vendor_company,
      projectDetails: project_details,
      builderName: builder_name,
      companyName: company_name,
      teamId: team_id,
      enhancedContext
    });

    console.log('✅ Briefed call initiated:', callResult.callSid);

    res.json({
      success: true,
      call_sid: callResult.callSid,
      session_id: callResult.sessionId,
      message: 'Briefed call initiated successfully',
      briefing_applied: {
        objective: normalizedBriefing.primary_objective,
        topics: normalizedBriefing.conversation_topics?.length || 0,
        talking_points: normalizedBriefing.must_mention_points?.length || 0
      }
    });
  } catch (error) {
    console.error('Error initiating briefed call:', error);
    res.status(500).json({
      error: 'Failed to initiate call',
      details: error.message
    });
  }
});

/**
 * Get briefing templates or suggestions
 * GET /api/builder-briefing/templates
 */
router.get('/templates/:project_type', async (req, res) => {
  try {
    const { project_type } = req.params;

    // Generate smart templates based on project type
    const templates = {
      'custom_home': {
        primary_objective: 'Secure premium contractor for custom home construction',
        conversation_topics: [
          'Project scope and specifications',
          'Timeline and availability',
          'Budget and pricing approach',
          'Quality standards and materials',
          'Previous custom home experience'
        ],
        key_messages: [
          'High-end custom home project',
          'Quality and craftsmanship are priorities',
          'Established timeline with flexibility',
          'Long-term relationship opportunity'
        ],
        must_mention_points: [
          'Project budget range and flexibility',
          'Expected start date and timeline',
          'Quality expectations and standards',
          'Why we selected their company'
        ],
        questions_to_ask: [
          'What\'s your current availability?',
          'Do you have experience with similar projects?',
          'What would you need to provide a detailed quote?',
          'What\'s your typical timeline for this type of work?'
        ]
      },
      'renovation': {
        primary_objective: 'Find experienced renovation contractor for home upgrade',
        conversation_topics: [
          'Renovation scope and challenges',
          'Working in occupied home',
          'Timeline and phases',
          'Permits and inspections',
          'Material selections'
        ],
        key_messages: [
          'Comprehensive renovation project',
          'Need to work around family schedule',
          'Quality results within budget',
          'Minimal disruption to daily life'
        ]
      }
    };

    const template = templates[project_type] || templates['custom_home'];

    res.json({
      success: true,
      template,
      project_type
    });
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get call analytics with briefing effectiveness
 * GET /api/builder-briefing/analytics
 */
router.get('/analytics/:team_id', async (req, res) => {
  try {
    const { team_id } = req.params;

    // Get calls with briefings vs without
    const { data: briefedCalls, error: error1 } = await supabase
      .from('enhanced_conversation_transcripts')
      .select('*')
      .eq('team_id', team_id)
      .not('enhanced_context->>builder_briefing', 'is', null);

    const { data: regularCalls, error: error2 } = await supabase
      .from('enhanced_conversation_transcripts')
      .select('*')
      .eq('team_id', team_id)
      .is('enhanced_context->>builder_briefing', null);

    if (error1 || error2) {
      console.error('Error fetching analytics:', error1 || error2);
      return res.status(500).json({ error: 'Failed to fetch analytics' });
    }

    const briefedSuccessRate = briefedCalls?.length
      ? briefedCalls.filter(c => c.call_status === 'successful').length / briefedCalls.length
      : 0;

    const regularSuccessRate = regularCalls?.length
      ? regularCalls.filter(c => c.call_status === 'successful').length / regularCalls.length
      : 0;

    res.json({
      success: true,
      analytics: {
        briefed_calls: {
          total: briefedCalls?.length || 0,
          success_rate: briefedSuccessRate,
          avg_duration: briefedCalls?.reduce((sum, c) => sum + (c.call_duration || 0), 0) / (briefedCalls?.length || 1)
        },
        regular_calls: {
          total: regularCalls?.length || 0,
          success_rate: regularSuccessRate,
          avg_duration: regularCalls?.reduce((sum, c) => sum + (c.call_duration || 0), 0) / (regularCalls?.length || 1)
        },
        improvement: {
          success_rate_lift: briefedSuccessRate - regularSuccessRate,
          calls_analyzed: (briefedCalls?.length || 0) + (regularCalls?.length || 0)
        }
      }
    });
  } catch (error) {
    console.error('Error in analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;