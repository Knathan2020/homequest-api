/**
 * ChatGPT Realtime Voice Routes
 * Direct integration of OpenAI Realtime API with Twilio for phone calls
 */

import express from 'express';
import twilio from 'twilio';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

const router = express.Router();

// Initialize Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Make a call with ChatGPT Realtime Voice
router.post('/chatgpt-voice/call', async (req, res) => {
  try {
    const {
      to,
      vendorName = 'there',
      vendorCompany = 'your company',
      projectDetails = { 
        address: '123 Main Street', 
        budget: '$2 million',
        type: 'project'
      },
      builderName = 'AI Assistant',
      companyName = 'HomeQuest'
    } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    console.log('🎙️ Initiating ChatGPT Voice call to:', to);

    // Generate session ID for tracking
    const sessionId = `chatgpt_voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get the base URL for webhooks
    const baseUrl = process.env.WEBHOOK_BASE_URL || 
      `https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev`;
    
    // Convert https to wss for WebSocket
    const wsUrl = baseUrl.replace('https://', 'wss://');

    // Create TwiML that connects to our WebSocket server
    const twiml = new VoiceResponse();
    
    // Add a brief greeting while connecting
    twiml.say({
      voice: 'Polly.Matthew'
    }, 'Connecting you now...');
    
    // Connect to WebSocket for streaming
    const connect = twiml.connect();
    const stream = connect.stream({
      url: `${wsUrl}/api/realtime/media-stream`
    });
    
    // Add parameters for the WebSocket connection
    stream.parameter({ name: 'sessionId', value: sessionId });
    stream.parameter({ name: 'vendorName', value: vendorName });
    stream.parameter({ name: 'vendorCompany', value: vendorCompany });
    stream.parameter({ name: 'vendorPhone', value: to });
    stream.parameter({ name: 'builderName', value: builderName });
    stream.parameter({ name: 'companyName', value: companyName });
    stream.parameter({ name: 'teamId', value: 'default' });
    stream.parameter({ 
      name: 'projectDetails', 
      value: encodeURIComponent(JSON.stringify(projectDetails)) 
    });

    // Make the call with the TwiML
    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER,
      twiml: twiml.toString(),
      statusCallback: `${baseUrl}/api/chatgpt-voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      timeout: 60,
      record: true
    });
    
    console.log('✅ ChatGPT Voice call initiated:', call.sid);
    
    res.json({
      success: true,
      message: '🎙️ ChatGPT Realtime Voice call initiated!',
      callSid: call.sid,
      sessionId,
      to: call.to,
      from: call.from,
      features: [
        'Real ChatGPT voice (OpenAI Realtime API)',
        'Natural conversation with GPT-4o',
        'Real-time audio streaming',
        'Voice transcription and synthesis'
      ],
      wsUrl: `${wsUrl}/api/realtime/media-stream`
    });
    
  } catch (error: any) {
    console.error('ChatGPT Voice call error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error
    });
  }
});

// Handle call status updates
router.post('/chatgpt-voice/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To } = req.body;
  
  console.log(`📞 ChatGPT Voice Call ${CallSid}: ${CallStatus}`);
  
  if (CallStatus === 'completed') {
    console.log(`⏱️ Duration: ${CallDuration}s`);
    console.log(`📱 From: ${From} To: ${To}`);
  }
  
  res.sendStatus(200);
});

// Test WebSocket connection
router.get('/chatgpt-voice/test-ws', (req, res) => {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 
    `https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev`;
  const wsUrl = baseUrl.replace('https://', 'wss://');
  
  res.json({
    success: true,
    message: 'WebSocket URL for ChatGPT Voice',
    wsUrl: `${wsUrl}/api/realtime/media-stream`,
    note: 'This is the WebSocket endpoint that Twilio will connect to for streaming audio'
  });
});

export default router;