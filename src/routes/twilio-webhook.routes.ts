import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const router = Router();

/**
 * Twilio webhook for incoming calls - routes to team's VAPI assistant
 */
router.post('/twilio/voice/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { From, To, CallSid } = req.body;

    console.log(`📞 Incoming call to team ${teamId} from ${From}`);

    // Get team's VAPI assistant
    const { data: team, error } = await supabase
      .from('teams')
      .select('vapi_assistant_id, company_name, twilio_phone_number')
      .eq('id', teamId)
      .single();

    if (error || !team || !team.vapi_assistant_id) {
      console.error('Team not found or no assistant configured');
      
      // Return a default message
      const twiml = new VoiceResponse();
      twiml.say('Thank you for calling. This number is not currently in service. Please try again later.');
      
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Log the call
    await supabase.from('team_phone_calls').insert({
      team_id: teamId,
      call_id: CallSid,
      call_type: 'inbound',
      caller_number: From,
      status: 'initiated',
      created_at: new Date().toISOString()
    });

    // Forward to VAPI
    // VAPI will handle the call with the team's specific assistant
    const twiml = new VoiceResponse();
    
    // Connect to VAPI's SIP endpoint with the assistant ID
    const dial = twiml.dial();
    dial.sip({
      uri: `sip:${team.vapi_assistant_id}@vapi.ai`,
      statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/status/${teamId}`,
      statusCallbackEvent: ['completed']
    } as any);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error: any) {
    console.error('Error handling incoming call:', error);
    
    const twiml = new VoiceResponse();
    twiml.say('We apologize, but we are experiencing technical difficulties. Please try again later.');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Call status webhook - updates call records
 */
router.post('/twilio/status/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;

    console.log(`📊 Call status update for team ${teamId}: ${CallStatus}`);

    // Update call record
    await supabase
      .from('team_phone_calls')
      .update({
        status: CallStatus,
        duration_seconds: parseInt(CallDuration) || 0,
        recording_url: RecordingUrl,
        updated_at: new Date().toISOString()
      })
      .eq('call_id', CallSid)
      .eq('team_id', teamId);

    // Update monthly call count if call completed
    if (CallStatus === 'completed') {
      await supabase.rpc('increment', {
        table_name: 'teams',
        column_name: 'calls_this_month',
        row_id: teamId
      });
    }

    res.sendStatus(200);

  } catch (error: any) {
    console.error('Error updating call status:', error);
    res.sendStatus(500);
  }
});

/**
 * SMS webhook - for future SMS support
 */
router.post('/twilio/sms/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { From, To, Body } = req.body;

    console.log(`💬 SMS received for team ${teamId} from ${From}: ${Body}`);

    // Save message to database
    await supabase.from('team_messages').insert({
      team_id: teamId,
      caller_phone: From,
      message: Body,
      taken_by: 'SMS',
      urgency: 'normal',
      created_at: new Date().toISOString()
    });

    // Auto-reply
    const twiml = new VoiceResponse();
    twiml.message(`Thank you for your message. Our team will get back to you shortly.`);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error: any) {
    console.error('Error handling SMS:', error);
    res.sendStatus(500);
  }
});

/**
 * Alternative: Forward to VAPI via webhook (if SIP doesn't work)
 */
router.post('/twilio/forward-vapi/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    
    // Get team's assistant
    const { data: team } = await supabase
      .from('teams')
      .select('vapi_assistant_id, company_name')
      .eq('id', teamId)
      .single();

    if (!team || !team.vapi_assistant_id) {
      const twiml = new VoiceResponse();
      twiml.say('This number is not configured. Please contact support.');
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Create a conference bridge and add VAPI
    const twiml = new VoiceResponse();
    const dial = twiml.dial();
    
    // Create a unique conference room for this call
    dial.conference({
      startConferenceOnEnter: true,
      endConferenceOnExit: true,
      statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/conference-status/${teamId}`,
      statusCallbackEvent: ['start', 'end', 'join', 'leave']
    }, `team-${teamId}-${Date.now()}`);

    // In parallel, trigger VAPI to join the conference
    setTimeout(async () => {
      try {
        await axios.post(
          'https://api.vapi.ai/call',
          {
            assistantId: team.vapi_assistant_id,
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
            customer: {
              number: req.body.From
            },
            metadata: {
              teamId,
              companyName: team.company_name,
              twilioCallSid: req.body.CallSid
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (error) {
        console.error('Failed to add VAPI to conference:', error);
      }
    }, 100);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error: any) {
    console.error('Error forwarding to VAPI:', error);
    
    const twiml = new VoiceResponse();
    twiml.say('We are experiencing technical difficulties. Please try again later.');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

export default router;