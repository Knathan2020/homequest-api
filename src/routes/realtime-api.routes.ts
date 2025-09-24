// OPENAI REALTIME API ROUTES
// Real-time voice conversations with GPT-4o
// Public API released October 2024!

import express from 'express';
import WebSocket from 'ws';
import realtimeAPI from '../services/openai-realtime-api.service';

const router = express.Router();

// Initiate a Realtime API call
router.post('/realtime/call', async (req, res) => {
  try {
    const {
      to,
      vendorName,
      vendorCompany,
      projectDetails,
      builderName,
      companyName,
      teamId
    } = req.body;

    console.log('🎙️ Initiating OpenAI Realtime API Call to', vendorName);

    const result = await realtimeAPI.initiateRealtimeCall({
      to: to || '+14047001234',
      vendorName: vendorName || 'Vendor',
      vendorCompany: vendorCompany || 'Vendor Company',
      projectDetails: projectDetails || {
        address: '1234 Luxury Boulevard',
        type: 'Premium Development',
        budget: '$5M+',
        timeline: '6 months',
        urgency: 'immediate',
        specificWork: 'Full project services'
      },
      builderName: builderName || 'John Builder',
      companyName: companyName || 'HomeQuest Premium',
      teamId: teamId || '11111111-1111-1111-1111-111111111111'
    });

    res.json({
      success: true,
      ...result,
      message: '🎙️ OpenAI Realtime API call initiated! Natural real-time conversation with GPT-4o voice!'
    });
  } catch (error: any) {
    console.error('Error initiating realtime call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate Realtime API call'
    });
  }
});

// WebSocket endpoint for Twilio media streams
// Note: Requires express-ws middleware to be configured
// For now, using POST endpoint for media stream setup
router.post('/realtime/stream', (req, res) => {
  const { sessionId } = req.body;
  
  console.log('🔊 Media stream setup for session:', sessionId);
  
  // Return TwiML to connect the stream
  res.type('text/xml');
  res.send(`
    <Response>
      <Say>Connecting to AI assistant...</Say>
      <Pause length="1"/>
    </Response>
  `);
});

// Handle inbound calls - This should be set as your Twilio phone number webhook
router.post('/realtime/inbound', async (req, res) => {
  const { CallSid, From, To } = req.body;
  
  console.log(`📞 Inbound call received - CallSid: ${CallSid}, From: ${From}, To: ${To}`);
  
  // For now, return a simple response
  // OpenAI Realtime API integration requires Media Streams which needs different setup
  // Consider using VAPI for inbound calls instead (already working!)
  
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. Our AI assistant system is currently being configured. Please call back shortly, or we can return your call. Thank you.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`);
});

// Handle call status updates
router.post('/realtime/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To } = req.body;
  
  console.log(`📞 Realtime Call ${CallSid}: ${CallStatus}`);
  
  if (CallStatus === 'completed') {
    console.log(`⏱️ Duration: ${CallDuration}s`);
    console.log(`📱 From: ${From} To: ${To}`);
  }
  
  res.status(200).send('OK');
});

// Handle function calls from OpenAI
router.post('/realtime/function', async (req, res) => {
  try {
    const { sessionId, functionName, arguments: args } = req.body;
    
    console.log(`⚡ Function call: ${functionName}`, args);
    
    const result = await realtimeAPI.handleFunctionCall(sessionId, functionName, args);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Function call failed' });
  }
});

// Get active sessions (for monitoring)
router.get('/realtime/sessions', (req, res) => {
  // In production, implement proper session management
  res.json({
    success: true,
    sessions: [],
    message: 'Session monitoring endpoint'
  });
});

export default router;