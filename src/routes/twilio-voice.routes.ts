/**
 * Twilio Voice Webhook Handler
 * Handles incoming calls to Twilio phone numbers and routes them to VAPI
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Main voice webhook for Twilio phone numbers
 * This should be set as the voice webhook URL in Twilio console
 */
router.post('/twilio/voice', async (req, res) => {
  try {
    const { 
      CallSid, 
      From, 
      To, 
      CallStatus,
      Direction
    } = req.body;
    
    console.log(`📞 Twilio voice webhook - CallSid: ${CallSid}, From: ${From}, To: ${To}, Direction: ${Direction}`);
    
    // For inbound calls, we need to return TwiML
    if (Direction === 'inbound' || !Direction) {
      // Look up company info based on the To number
      let companyName = 'our company';
      
      try {
        // Try to find the company associated with this phone number
        const cleanedNumber = To.replace(/\D/g, ''); // Remove non-digits
        
        const { data: phoneConfig } = await supabase
          .from('team_phones')
          .select('team_id')
          .or(`twilio_number.eq.${To},twilio_number.eq.+${cleanedNumber}`)
          .single();
        
        if (phoneConfig?.team_id) {
          const { data: team } = await supabase
            .from('teams')
            .select('company_name, name')
            .eq('id', phoneConfig.team_id)
            .single();
          
          if (team) {
            companyName = team.company_name || team.name || companyName;
          }
        }
      } catch (error) {
        console.log('Could not find team for number, using default');
      }
      
      // Return simple TwiML for now
      // In production, you might want to forward to VAPI or another service
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling ${companyName}. Please hold while we connect you to our assistant.</Say>
  <Pause length="2"/>
  <Say>We're experiencing technical difficulties. Please call back in a few minutes or leave a message after the tone.</Say>
  <Record maxLength="120" action="/api/twilio/voicemail" />
</Response>`);
      
    } else {
      // For outbound calls or other statuses
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting your call.</Say>
</Response>`);
    }
    
  } catch (error: any) {
    console.error('Error in Twilio voice webhook:', error);
    
    // Return a safe fallback response
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, but we're unable to process your call at this time. Please try again later.</Say>
  <Hangup/>
</Response>`);
  }
});

/**
 * Handle voicemail recordings
 */
router.post('/twilio/voicemail', async (req, res) => {
  const { RecordingUrl, From, To, CallSid } = req.body;
  
  console.log(`📼 Voicemail received - From: ${From}, Recording: ${RecordingUrl}`);
  
  // Store voicemail info in database
  // You could also send notification emails, SMS, etc.
  
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your message. We'll get back to you soon. Goodbye!</Say>
  <Hangup/>
</Response>`);
});

/**
 * Status callback for call events
 */
router.post('/twilio/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  
  console.log(`📊 Call status: ${CallSid} - ${CallStatus} - Duration: ${CallDuration}s`);
  
  // Just acknowledge the status update
  res.status(200).send('OK');
});

export default router;