// CHATGPT VOICE ROUTES
// Integrates OpenAI's realtime voice API - the same voice as ChatGPT!

import express from 'express';
import WebSocket from 'ws';
import chatGPTVoice from '../services/openai-realtime-voice.service';

const router = express.Router();

// Initiate a ChatGPT voice call
router.post('/chatgpt-voice/call', async (req, res) => {
  try {
    const {
      to,
      vendorName,
      vendorCompany,
      projectDetails,
      builderName,
      companyName
    } = req.body;

    console.log('🎙️ Initiating ChatGPT Voice Call to', vendorName);

    const result = await chatGPTVoice.initiateChatGPTVoiceCall({
      to,
      vendorName,
      projectDetails: {
        address: projectDetails.address || '1234 Premium Plaza',
        type: projectDetails.type || 'Luxury Development',
        budget: projectDetails.budget || '$5M+',
        timeline: projectDetails.timeline || '6 months',
        urgency: projectDetails.urgency || 'immediate',
        specificWork: projectDetails.specificWork || 'Full project completion'
      },
      builderName: builderName || 'AI Assistant',
      companyName: companyName || 'HomeQuest Premium'
    });

    res.json({
      success: true,
      ...result,
      message: 'ChatGPT Voice call initiated! Using the same AI voice as ChatGPT app!'
    });
  } catch (error: any) {
    console.error('Error initiating ChatGPT voice call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate ChatGPT voice call'
    });
  }
});

// WebSocket endpoint for audio streaming (disabled for now)
// router.ws('/chatgpt-voice/stream', (ws: WebSocket, req: any) => {
//   const callSid = req.query.CallSid || req.params.callSid;
//   
//   console.log('🎤 WebSocket connected for ChatGPT voice stream:', callSid);
//   
//   // Handle the audio stream
//   chatGPTVoice.handleAudioStream(ws, callSid);
// });

// Handle call status updates
router.post('/chatgpt-voice/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  
  console.log(`📞 ChatGPT Voice Call ${CallSid}: ${CallStatus} (${CallDuration}s)`);
  
  res.status(200).send('OK');
});

// Get conversation transcript
router.get('/chatgpt-voice/transcript/:sessionId', async (req, res) => {
  try {
    const transcript = await chatGPTVoice.getTranscript(req.params.sessionId);
    
    res.json({
      success: true,
      transcript,
      message: 'ChatGPT conversation transcript retrieved'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transcript'
    });
  }
});

// Handle recording status
router.post('/chatgpt-voice/recording', (req, res) => {
  const { RecordingSid, RecordingUrl, CallSid } = req.body;
  
  console.log(`🎙️ Recording available for ${CallSid}: ${RecordingUrl}`);
  
  // You can save this to database or process the recording
  
  res.status(200).send('OK');
});

export default router;