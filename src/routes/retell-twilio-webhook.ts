/**
 * Retell.ai + Twilio Integration
 * Handle inbound calls to your Twilio number with Retell AI
 */

import express from 'express';
import twilio from 'twilio';

const router = express.Router();

// When someone calls YOUR Twilio number
router.post('/twilio/voice/retell', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Connect to Retell.ai
  twiml.connect({
    stream: {
      url: `wss://api.retellai.com/twilio-media-stream`,
      parameters: {
        api_key: process.env.RETELL_API_KEY,
        agent_id: 'your-agent-id' // Create persistent agent in Retell dashboard
      }
    }
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Status callback
router.post('/twilio/status/retell', (req, res) => {
  console.log('Call status:', req.body.CallStatus);
  res.sendStatus(200);
});

export default router;