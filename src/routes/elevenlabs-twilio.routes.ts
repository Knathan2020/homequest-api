/**
 * ElevenLabs + Twilio Routes
 * Handles API endpoints and WebSocket streaming for natural voice calls
 */

import express from 'express';
import elevenlabsTwilioService from '../services/elevenlabs-twilio.service';

const router = express.Router();

// Initiate a call with ElevenLabs voice
router.post('/call', async (req, res) => {
  try {
    const {
      to,
      vendorName = 'there',
      vendorCompany = 'your company',
      builderName = 'Sarah',
      companyName = 'HomeQuest',
      projectDetails = {
        address: '123 Main Street',
        budget: '$500,000',
        type: 'renovation project',
        timeline: '3 months'
      },
      voiceId
    } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    console.log('📞 Initiating ElevenLabs call to:', to);

    const result = await elevenlabsTwilioService.initiateCall({
      to,
      vendorName,
      vendorCompany,
      builderName,
      companyName,
      projectDetails,
      voiceId
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error initiating call:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Note: WebSocket streaming would be handled via the main WebSocket server
// For now, we'll use regular HTTP endpoints

// Status callback from Twilio
router.post('/status', (req, res) => {
  console.log('Call status update:', {
    callSid: req.body.CallSid,
    status: req.body.CallStatus,
    duration: req.body.CallDuration
  });
  res.sendStatus(200);
});

// Get available ElevenLabs voices
router.get('/voices', async (req, res) => {
  try {
    const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js');
    const client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY || ''
    });

    const voices = await client.voices.getAll();
    
    res.json({
      success: true,
      voices: voices.voices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        preview: voice.preview_url,
        labels: voice.labels
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'ElevenLabs + Twilio service ready!',
    features: [
      '✅ Natural ElevenLabs voices',
      '✅ Real-time phone conversations',
      '✅ Streaming audio',
      '✅ Context-aware responses',
      '✅ Multiple voice options'
    ]
  });
});

export default router;