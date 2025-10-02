import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import vapiAssistantService from '../services/vapi-assistant.service';
import twilioDirectService from '../services/twilio-direct.service';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const router = Router();

/**
 * Setup phone system for a team (buy number + create assistant)
 */
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const { teamId, companyName, areaCode } = req.body;

    if (!teamId || !companyName) {
      return res.status(400).json({
        success: false,
        error: 'Team ID and company name are required'
      });
    }

    console.log(`📞 Setting up phone system for ${companyName}`);

    // Step 1: Create VAPI assistant
    let assistant;
    try {
      assistant = await vapiAssistantService.createCompanyAssistant(companyName, teamId);
      console.log(`✅ Created VAPI assistant: ${assistant.id}`);
    } catch (error: any) {
      console.error('Failed to create VAPI assistant:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create AI assistant',
        details: error.message
      });
    }

    // Step 2: Buy Twilio phone number
    let phoneNumber;
    try {
      // Search for available numbers
      const availableNumbers = await twilioDirectService.client.availablePhoneNumbers('US')
        .local
        .list({
          areaCode: areaCode || '678',
          limit: 1
        });

      if (availableNumbers.length === 0) {
        throw new Error(`No phone numbers available in area code ${areaCode || '678'}`);
      }

      // Purchase the number
      phoneNumber = await twilioDirectService.client.incomingPhoneNumbers.create({
        phoneNumber: availableNumbers[0].phoneNumber,
        voiceUrl: `${process.env.WEBHOOK_BASE_URL}/api/twilio/voice/${teamId}`,
        voiceMethod: 'POST',
        statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/status/${teamId}`,
        statusCallbackMethod: 'POST'
      });

      console.log(`✅ Purchased Twilio number: ${phoneNumber.phoneNumber}`);
    } catch (error: any) {
      // If phone purchase fails, delete the assistant
      await vapiAssistantService.deleteAssistant(assistant.id);
      
      console.error('Failed to purchase phone number:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to purchase phone number',
        details: error.message
      });
    }

    // Step 3: Update team record in database
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        vapi_assistant_id: assistant.id,
        vapi_assistant_name: assistant.name,
        twilio_phone_number: phoneNumber.phoneNumber,
        twilio_phone_sid: phoneNumber.sid,
        phone_system_active: true,
        phone_system_created_at: new Date().toISOString()
      })
      .eq('id', teamId);

    if (updateError) {
      console.error('Failed to update team record:', updateError);
      // Note: We still return success since the phone system is set up
    }

    res.json({
      success: true,
      message: 'Phone system setup complete',
      data: {
        phoneNumber: phoneNumber.phoneNumber,
        assistantId: assistant.id,
        assistantName: assistant.name
      }
    });

  } catch (error: any) {
    console.error('Error setting up phone system:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to setup phone system'
    });
  }
});

/**
 * Get phone system status for a team
 */
router.get('/status/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    const { data: team, error } = await supabase
      .from('teams')
      .select('phone_system_active, twilio_phone_number, vapi_assistant_name, monthly_call_limit, calls_this_month')
      .eq('id', teamId)
      .single();

    if (error || !team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: {
        active: team.phone_system_active,
        phoneNumber: team.twilio_phone_number,
        assistantName: team.vapi_assistant_name,
        usage: {
          limit: team.monthly_call_limit,
          used: team.calls_this_month,
          remaining: team.monthly_call_limit - team.calls_this_month
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching phone system status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch phone system status'
    });
  }
});

/**
 * Deactivate phone system for a team
 */
router.post('/deactivate', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.body;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required'
      });
    }

    // Get team data
    const { data: team, error: fetchError } = await supabase
      .from('teams')
      .select('vapi_assistant_id, twilio_phone_sid')
      .eq('id', teamId)
      .single();

    if (fetchError || !team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    // Delete VAPI assistant
    if (team.vapi_assistant_id) {
      try {
        await vapiAssistantService.deleteAssistant(team.vapi_assistant_id);
        console.log(`🗑️ Deleted VAPI assistant: ${team.vapi_assistant_id}`);
      } catch (error) {
        console.error('Failed to delete VAPI assistant:', error);
      }
    }

    // Release Twilio number
    if (team.twilio_phone_sid) {
      try {
        await twilioDirectService.client.incomingPhoneNumbers(team.twilio_phone_sid).remove();
        console.log(`🗑️ Released Twilio number: ${team.twilio_phone_sid}`);
      } catch (error) {
        console.error('Failed to release Twilio number:', error);
      }
    }

    // Update team record
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        phone_system_active: false,
        vapi_assistant_id: null,
        vapi_assistant_name: null,
        twilio_phone_number: null,
        twilio_phone_sid: null
      })
      .eq('id', teamId);

    if (updateError) {
      console.error('Failed to update team record:', updateError);
    }

    res.json({
      success: true,
      message: 'Phone system deactivated successfully'
    });

  } catch (error: any) {
    console.error('Error deactivating phone system:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to deactivate phone system'
    });
  }
});

/**
 * Get recent calls for a team
 */
router.get('/calls/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data: calls, error, count } = await supabase
      .from('team_phone_calls')
      .select('*', { count: 'exact' })
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        calls: calls || [],
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset)
      }
    });

  } catch (error: any) {
    console.error('Error fetching calls:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch calls'
    });
  }
});

/**
 * Get messages for a team
 */
router.get('/messages/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { unreadOnly = false } = req.query;

    let query = supabase
      .from('team_messages')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (unreadOnly === 'true') {
      query = query.eq('read', false);
    }

    const { data: messages, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: messages || []
    });

  } catch (error: any) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch messages'
    });
  }
});

/**
 * Mark message as read
 */
router.patch('/messages/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    const { error } = await supabase
      .from('team_messages')
      .update({ read: true })
      .eq('id', messageId);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Message marked as read'
    });

  } catch (error: any) {
    console.error('Error updating message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update message'
    });
  }
});

export default router;