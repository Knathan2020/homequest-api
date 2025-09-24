import { Router, Request, Response } from 'express';
import elevenLabsService from '../services/elevenlabs-voice.service';

const router = Router();

// Get available voices
router.get('/voices', async (req: Request, res: Response) => {
  try {
    const voices = await elevenLabsService.getVoices();
    res.json({ success: true, voices });
  } catch (error: any) {
    console.error('Error fetching voices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test text-to-speech
router.post('/test-tts', async (req: Request, res: Response) => {
  try {
    const { text, voiceId } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const audioBuffer = await elevenLabsService.textToSpeech(text, voiceId);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString()
    });
    
    res.send(audioBuffer);
  } catch (error: any) {
    console.error('Error in TTS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initiate voice call with ElevenLabs
router.post('/call', async (req: Request, res: Response) => {
  try {
    const {
      to,
      vendorName,
      vendorCompany,
      projectDetails,
      builderName,
      companyName,
      voiceId
    } = req.body;

    // Validate required fields
    if (!to || !vendorName) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and vendor name are required'
      });
    }

    const result = await elevenLabsService.initiateVoiceCall({
      to,
      vendorName,
      vendorCompany,
      projectDetails,
      builderName,
      companyName,
      voiceId
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error initiating call:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stream text-to-speech
router.post('/stream-tts', async (req: Request, res: Response) => {
  try {
    const { text, voiceId } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const audioStream = await elevenLabsService.streamTextToSpeech(text, voiceId);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked'
    });
    
    audioStream.pipe(res);
  } catch (error: any) {
    console.error('Error streaming TTS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Note: WebSocket endpoint would go here for real-time streaming
// For now, we'll handle media streams through regular POST endpoints

// Status callback from Twilio
router.post('/status', (req: Request, res: Response) => {
  console.log('Call status update:', req.body);
  res.sendStatus(200);
});

export default router;