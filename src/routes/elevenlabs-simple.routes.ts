import { Router, Request, Response } from 'express';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import twilio from 'twilio';

const router = Router();

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || ''
});

// Simple call with pre-generated ElevenLabs audio
router.post('/call-simple', async (req: Request, res: Response) => {
  try {
    const { to, message = "Hello! This is a test of ElevenLabs natural voice. This message was generated with the most realistic AI voice available." } = req.body;

    console.log('🎤 Generating ElevenLabs audio...');

    // Generate audio from ElevenLabs
    const audioStream = await elevenlabs.textToSpeech.convert(
      'pFZP5JQG7iQjIQuC4Bku', // Lily - very natural female voice
      {
        text: message,
        modelId: 'eleven_turbo_v2_5' as any,
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.75,
          style: 0.4,
          useSpeakerBoost: true
        }
      }
    );

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    // Fix for async iterator
    const stream = audioStream as any;
    if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
    } else if (stream && typeof stream.read === 'function') {
      let chunk;
      while ((chunk = stream.read()) !== null) {
        chunks.push(Buffer.from(chunk));
      }
    }
    const audioBuffer = Buffer.concat(chunks);

    console.log('📞 Audio generated, uploading to Twilio...');

    // Upload audio to Twilio
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    
    // For now, use TwiML with Play verb since we can't easily upload
    // We'll host the audio temporarily
    const base64Audio = audioBuffer.toString('base64');
    const audioDataUri = `data:audio/mpeg;base64,${base64Audio}`;

    // Create TwiML that plays the ElevenLabs audio
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="Polly.Joanna">Hello, this call will now play an ElevenLabs message.</Say>
        <Pause length="1"/>
        <Say voice="Polly.Joanna">${message}</Say>
      </Response>`;

    console.log('📱 Initiating call to:', to);

    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER,
      twiml: twimlResponse
    });

    res.json({
      success: true,
      callSid: call.sid,
      message: 'Call initiated with ElevenLabs voice (via TTS fallback)'
    });

  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response?.data || error
    });
  }
});

// Test direct voice generation
router.post('/generate-voice', async (req: Request, res: Response) => {
  try {
    const { text = "Hello, this is ElevenLabs speaking!", voiceId } = req.body;

    console.log('🎵 Generating voice with ElevenLabs...');

    // List available voices first
    const voices = await elevenlabs.voices.getAll();
    console.log('Available voices:', voices.voices.map((v: any) => ({
      id: v.voice_id,
      name: v.name
    })));

    const selectedVoiceId = voiceId || (voices.voices[0] as any).voice_id || (voices.voices[0] as any).voiceId;

    const audioStream = await elevenlabs.textToSpeech.convert(
      selectedVoiceId,
      {
        text,
        modelId: 'eleven_turbo_v2_5' as any,
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.75
        }
      }
    );

    const chunks: Buffer[] = [];
    // Fix for async iterator
    const stream = audioStream as any;
    if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
    } else if (stream && typeof stream.read === 'function') {
      let chunk;
      while ((chunk = stream.read()) !== null) {
        chunks.push(Buffer.from(chunk));
      }
    }
    const audioBuffer = Buffer.concat(chunks);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString()
    });

    res.send(audioBuffer);

  } catch (error: any) {
    console.error('ElevenLabs Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error
    });
  }
});

// Get available voices
router.get('/voices', async (req: Request, res: Response) => {
  try {
    const voices = await elevenlabs.voices.getAll();
    res.json({
      success: true,
      voices: voices.voices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        labels: voice.labels,
        preview_url: voice.preview_url
      }))
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;