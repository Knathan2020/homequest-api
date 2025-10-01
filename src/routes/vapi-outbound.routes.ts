/**
 * VAPI Outbound Call Routes
 * Handles AI-initiated calls for phase transitions and vendor coordination
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_API_BASE = 'https://api.vapi.ai';

/**
 * Make outbound VAPI call for phase transition
 */
router.post('/vapi/make-outbound-call', async (req, res) => {
  try {
    const {
      teamId,
      phoneNumber,
      vendorName,
      callContext
    } = req.body;

    console.log('📞 Initiating outbound VAPI call:', {
      teamId,
      phoneNumber,
      vendorName,
      callContext
    });

    // Validate required fields
    if (!teamId || !phoneNumber || !callContext) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: teamId, phoneNumber, callContext'
      });
    }

    // Get team's VAPI phone and assistant
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('vapi_phone_id, vapi_assistant_id, twilio_phone_number, name')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      console.error('Team not found:', teamError);
      return res.status(404).json({
        success: false,
        error: 'Team not found or no phone number provisioned'
      });
    }

    if (!team.vapi_phone_id || !team.vapi_assistant_id) {
      return res.status(400).json({
        success: false,
        error: 'Team does not have VAPI phone or assistant configured'
      });
    }

    // Build assistant instructions based on call reason
    let systemMessage = buildSystemMessage(team.name, callContext);

    // Create a temporary assistant for this specific call context
    const assistantConfig = {
      name: `${team.name} - ${callContext.reason}`,
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: systemMessage
          }
        ]
      },
      voice: {
        provider: 'elevenlabs',
        voiceId: 'OYTbf65OHHFELVut7v2H' // Hope voice as default
      },
      firstMessage: buildFirstMessage(callContext),
      endCallMessage: 'Thank you for your time! We look forward to working with you.',
      endCallFunctionEnabled: true,
      recordingEnabled: true,
      serverUrl: `${process.env.API_BASE_URL || 'https://homequest-api-1.onrender.com'}/api/vapi/webhooks/function-call`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || null
    };

    console.log('🤖 Creating temporary assistant for call...');

    // Create temporary assistant
    const assistantResponse = await axios.post(
      `${VAPI_API_BASE}/assistant`,
      assistantConfig,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const tempAssistantId = assistantResponse.data.id;
    console.log('✅ Temporary assistant created:', tempAssistantId);

    // Initiate the call
    const callPayload = {
      phoneNumberId: team.vapi_phone_id,
      assistantId: tempAssistantId,
      customer: {
        number: phoneNumber,
        name: vendorName
      },
      metadata: {
        teamId,
        callReason: callContext.reason,
        phaseName: callContext.phaseName,
        phaseId: callContext.phaseId,
        projectId: callContext.projectId,
        vendorName
      }
    };

    console.log('📱 Initiating VAPI call...');

    const callResponse = await axios.post(
      `${VAPI_API_BASE}/call/phone`,
      callPayload,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const callId = callResponse.data.id;
    console.log('✅ Call initiated with ID:', callId);

    // Log to vendor_communications
    if (callContext.phaseId && callContext.vendorId) {
      await supabase
        .from('vendor_communications')
        .insert({
          phase_id: callContext.phaseId,
          vendor_id: callContext.vendorId,
          communication_type: 'call',
          direction: 'outbound',
          vapi_call_id: callId,
          content: `AI calling ${vendorName} about ${callContext.phaseName} phase`,
          ai_generated: true,
          sent_at: new Date().toISOString()
        });
    }

    // Update phase with call timestamp
    if (callContext.phaseId) {
      await supabase
        .from('project_phases')
        .update({
          next_vendor_called_at: new Date().toISOString(),
          vapi_call_id: callId
        })
        .eq('id', callContext.phaseId);
    }

    res.json({
      success: true,
      message: `AI calling ${vendorName} now`,
      callId,
      assistantId: tempAssistantId,
      phoneNumber,
      teamPhone: team.twilio_phone_number
    });

  } catch (error: any) {
    console.error('❌ Error making outbound call:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

/**
 * Build system message based on call context
 */
function buildSystemMessage(teamName: string, context: any): string {
  const { reason, phaseName, previousPhase, phaseStartDate, projectAddress } = context;

  if (reason === 'phase_ready') {
    return `You are an AI assistant for ${teamName}, a construction company.

You are calling a vendor to notify them that the previous construction phase "${previousPhase}" has been completed, and their phase "${phaseName}" is ready to begin.

Your goals:
1. Inform them the previous phase is complete and they can start
2. Confirm their availability for the scheduled start date: ${phaseStartDate}
3. Ask if they need any materials delivered beforehand
4. Offer to schedule the start appointment in the calendar
5. Ask if they have any questions about the project

Project address: ${projectAddress}

Be professional, friendly, and efficient. Keep the call under 3 minutes if possible.
If they confirm availability, use the scheduleAppointment function to create the start date.
If they mention material needs, use the takeMessage function to save it for the builder.`;
  }

  if (reason === 'follow_up') {
    return `You are an AI assistant for ${teamName}, a construction company.

You are following up with a vendor about the "${phaseName}" phase.

Be brief and professional. Ask about their progress and if they need anything.`;
  }

  if (reason === 'quote_request') {
    return `You are an AI assistant for ${teamName}, a construction company.

You are calling to request a quote for the "${phaseName}" phase at ${projectAddress}.

Ask if they can provide a quote and what information they need.`;
  }

  return `You are an AI assistant for ${teamName}, a construction company. Be helpful and professional.`;
}

/**
 * Build first message based on call context
 */
function buildFirstMessage(context: any): string {
  const { reason, phaseName, previousPhase, vendorName } = context;

  if (reason === 'phase_ready') {
    return `Hi! This is the AI assistant calling on behalf of our construction team. I have good news - the ${previousPhase} phase has been completed, and we're ready for you to begin the ${phaseName} phase. Do you have a moment to discuss the schedule?`;
  }

  if (reason === 'follow_up') {
    return `Hi! This is the AI assistant following up about the ${phaseName} phase. How is everything going? Do you need any support?`;
  }

  if (reason === 'quote_request') {
    return `Hi! This is the AI assistant calling about a new construction project. We're looking for a quote on the ${phaseName} phase. Are you available to discuss this?`;
  }

  return `Hi! This is the AI assistant for our construction team. Do you have a moment to talk?`;
}

/**
 * Get call status
 */
router.get('/vapi/call-status/:callId', async (req, res) => {
  try {
    const { callId } = req.params;

    const response = await axios.get(
      `${VAPI_API_BASE}/call/${callId}`,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );

    res.json({
      success: true,
      call: response.data
    });

  } catch (error: any) {
    console.error('Error getting call status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
