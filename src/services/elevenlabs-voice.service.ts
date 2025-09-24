import { ElevenLabsClient, stream } from '@elevenlabs/elevenlabs-js';
import twilio from 'twilio';
import WebSocket from 'ws';
import { Readable } from 'stream';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

class ElevenLabsVoiceService {
  private client: ElevenLabsClient;
  private sessions = new Map<string, any>();

  constructor() {
    this.client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY || ''
    });
  }

  // Get available voices
  async getVoices() {
    try {
      const voices = await this.client.voices.getAll();
      return voices.voices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        preview: voice.preview_url,
        labels: voice.labels
      }));
    } catch (error) {
      console.error('Error fetching voices:', error);
      throw error;
    }
  }

  // Text to speech for testing
  async textToSpeech(text: string, voiceId?: string) {
    try {
      const audioStream = await this.client.textToSpeech.convert(
        voiceId || 'EXAVITQu4vr4xnSDxMaL', // Default to "Bella" voice
        {
          text,
          model_id: 'eleven_turbo_v2_5', // Fastest model for real-time
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true
          }
        }
      );

      // Convert to Buffer for easier handling
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error in text-to-speech:', error);
      throw error;
    }
  }

  // Initiate AI phone call with ElevenLabs voice
  async initiateVoiceCall(params: {
    to: string;
    vendorName: string;
    vendorCompany: string;
    projectDetails: any;
    builderName: string;
    companyName: string;
    voiceId?: string;
  }) {
    try {
      console.log('🎤 Initiating ElevenLabs Voice Call...');
      
      const sessionId = `elevenlabs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Webhook URLs for Twilio
      const webhookBase = process.env.WEBHOOK_BASE_URL || 
        `https://${process.env.CODESPACE_NAME || 'cuddly-giggle-69p59v4xv5gw2rvw7'}-4000.app.github.dev`;
      
      // Create TwiML that will stream to our ElevenLabs handler
      const streamUrl = `${webhookBase.replace('https://', 'wss://')}/api/elevenlabs/media-stream`;
      
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="Polly.Matthew-Neural">Hello ${params.vendorName}, this is ${params.builderName} from ${params.companyName}. I have an exciting project to discuss with you.</Say>
          <Pause length="1"/>
          <Connect>
            <Stream url="${streamUrl}">
              <Parameter name="sessionId" value="${sessionId}" />
              <Parameter name="vendorName" value="${params.vendorName}" />
              <Parameter name="voiceId" value="${params.voiceId || 'EXAVITQu4vr4xnSDxMaL'}" />
              <Parameter name="projectDetails" value="${encodeURIComponent(JSON.stringify(params.projectDetails))}" />
            </Stream>
          </Connect>
        </Response>`;

      const call = await twilioClient.calls.create({
        to: params.to,
        from: process.env.TWILIO_PHONE_NUMBER || '+16783253060',
        twiml: twimlResponse,
        statusCallback: `${webhookBase}/api/elevenlabs/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Store session info
      this.sessions.set(sessionId, {
        sessionId,
        twilioCallSid: call.sid,
        projectContext: params.projectDetails,
        voiceId: params.voiceId || 'EXAVITQu4vr4xnSDxMaL',
        isActive: true
      });

      console.log(`✅ ElevenLabs call initiated: ${call.sid}`);
      
      return {
        success: true,
        callSid: call.sid,
        sessionId,
        message: 'ElevenLabs voice call initiated with natural voice!'
      };
    } catch (error) {
      console.error('Error initiating ElevenLabs call:', error);
      throw error;
    }
  }

  // Handle Twilio media stream for real-time conversation
  async handleMediaStream(ws: WebSocket, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error('No session found for:', sessionId);
      ws.close();
      return;
    }

    console.log('🔊 ElevenLabs stream connected for session:', sessionId);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.event === 'media') {
          // Process incoming audio from caller
          // This is where you'd implement speech-to-text and response generation
          // For now, we'll just acknowledge
          console.log('Received audio chunk');
        } else if (message.event === 'start') {
          console.log('📞 Call started with ElevenLabs voice');
          
          // Send initial greeting with ElevenLabs voice
          const greeting = `Hello! This is a test of ElevenLabs natural voice. How can I help you today?`;
          const audioBuffer = await this.textToSpeech(greeting, session.voiceId);
          
          // Send audio back to Twilio
          this.sendAudioToTwilio(ws, audioBuffer);
        }
      } catch (error) {
        console.error('Error processing stream message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Stream closed for session:', sessionId);
      this.sessions.delete(sessionId);
    });
  }

  // Send ElevenLabs audio to Twilio
  private sendAudioToTwilio(ws: WebSocket, audioBuffer: Buffer) {
    // Convert audio to base64 chunks and send to Twilio
    const chunkSize = 8192; // Twilio recommended chunk size
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, i + chunkSize);
      const base64Audio = chunk.toString('base64');
      
      ws.send(JSON.stringify({
        event: 'media',
        media: {
          payload: base64Audio
        }
      }));
    }
  }

  // Stream text to speech in real-time
  async streamTextToSpeech(text: string, voiceId?: string): Promise<Readable> {
    try {
      const audioStream = await this.client.textToSpeech.convertAsStream(
        voiceId || 'EXAVITQu4vr4xnSDxMaL',
        {
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true
          },
          optimize_streaming_latency: 4 // Maximum optimization for real-time
        }
      );

      return Readable.from(audioStream);
    } catch (error) {
      console.error('Error streaming text-to-speech:', error);
      throw error;
    }
  }

  // Voice cloning capability
  async cloneVoice(name: string, audioFilePath: string, description?: string) {
    try {
      const voice = await this.client.voices.add({
        name,
        files: [audioFilePath],
        description: description || 'Custom cloned voice'
      });

      return {
        success: true,
        voiceId: voice.voice_id,
        name: voice.name
      };
    } catch (error) {
      console.error('Error cloning voice:', error);
      throw error;
    }
  }
}

export default new ElevenLabsVoiceService();