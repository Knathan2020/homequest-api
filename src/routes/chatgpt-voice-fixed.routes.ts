/**
 * Fixed ChatGPT Voice Integration
 * This properly connects OpenAI Realtime API voice to Twilio calls
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

// Make a call with actual ChatGPT voice
router.post('/chatgpt-voice-fixed/call', async (req, res) => {
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
      builderName = 'ChatGPT Assistant',
      companyName = 'HomeQuest'
    } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    console.log('🎙️ Initiating FIXED ChatGPT Voice call to:', to);

    // Generate session ID
    const sessionId = `chatgpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get base URL - ensure no /api/twilio path pollution
    const baseUrl = process.env.WEBHOOK_BASE_URL || 
      'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev';
    
    // Create WebSocket URL - must be wss:// for secure connection
    const wsBaseUrl = baseUrl.replace('https://', 'wss://');

    // Create TwiML - the Connect element streams audio between Twilio and our WebSocket
    const twiml = new VoiceResponse();
    
    // No intro message - go straight to streaming
    const connect = twiml.connect();
    
    // Stream configuration - this connects to our WebSocket server
    const stream = connect.stream({
      url: `${wsBaseUrl}/api/realtime/media-stream`
    });
    
    // Pass parameters to the WebSocket handler
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

    console.log('📞 TwiML generated with WebSocket URL:', `${wsBaseUrl}/api/realtime/media-stream`);
    console.log('📄 Full TwiML:', twiml.toString());

    // Make the call
    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER || '+16783253060',
      twiml: twiml.toString(),
      statusCallback: `${baseUrl}/api/chatgpt-voice-fixed/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      timeout: 60
    });
    
    console.log('✅ ChatGPT Voice call initiated:', call.sid);
    
    res.json({
      success: true,
      message: '🎙️ FIXED ChatGPT Voice call initiated! This will use real ChatGPT voice!',
      callSid: call.sid,
      sessionId,
      to: call.to,
      from: call.from,
      wsUrl: `${wsBaseUrl}/api/realtime/media-stream`,
      note: 'This connects directly to OpenAI Realtime API for authentic ChatGPT voice'
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

// Handle call status
router.post('/chatgpt-voice-fixed/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  
  console.log(`📞 ChatGPT Voice Call ${CallSid}: ${CallStatus}`);
  
  if (CallStatus === 'completed') {
    console.log(`⏱️ Call duration: ${CallDuration}s`);
  }
  
  // Check if WebSocket connection issue
  if (CallStatus === 'completed' && CallDuration === '1') {
    console.log('⚠️ Call ended immediately - likely WebSocket connection issue');
  }
  
  res.sendStatus(200);
});

export default router;