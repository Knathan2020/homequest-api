/**
 * ElevenLabs + Twilio Integration Service
 * Handles real-time phone conversations with natural ElevenLabs voices
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import twilio from 'twilio';
import WebSocket from 'ws';
import OpenAI from 'openai';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || ''
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface CallSession {
  sessionId: string;
  twilioCallSid: string;
  twilioWs?: WebSocket;
  conversationHistory: Array<{role: string, content: string}>;
  vendorInfo: any;
  projectInfo: any;
  isActive: boolean;
}

class ElevenLabsTwilioService {
  private sessions = new Map<string, CallSession>();

  // Initiate a call with ElevenLabs voice
  async initiateCall(params: {
    to: string;
    vendorName: string;
    vendorCompany: string;
    builderName: string;
    companyName: string;
    projectDetails: any;
    voiceId?: string;
  }) {
    try {
      console.log('🎤 Initiating ElevenLabs call to:', params.vendorName);
      
      const sessionId = `elevenlabs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Webhook base URL
      const webhookBase = process.env.WEBHOOK_BASE_URL || 
        `https://${process.env.CODESPACE_NAME || 'cuddly-giggle-69p59v4xv5gw2rvw7'}-4000.app.github.dev`;
      
      // WebSocket URL for streaming
      const wsUrl = webhookBase.replace('https://', 'wss://');
      
      // Generate initial greeting with ElevenLabs
      const greeting = `Hello ${params.vendorName}! This is ${params.builderName} from ${params.companyName}. 
        I'm calling about an exciting project we have at ${params.projectDetails.address}. 
        It's a ${params.projectDetails.budget} ${params.projectDetails.type} project. 
        Do you have a few minutes to discuss this opportunity?`;

      console.log('📝 Generating initial greeting audio...');
      
      // Generate audio with ElevenLabs
      const audioStream = await elevenlabs.textToSpeech.convert(
        params.voiceId || 'pFZP5JQG7iQjIQuC4Bku', // Lily - professional female voice
        {
          text: greeting,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true
          }
        }
      );

      // Convert to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      
      // Convert to base64 for TwiML
      const audioBase64 = audioBuffer.toString('base64');
      
      // Store session info
      const session: CallSession = {
        sessionId,
        twilioCallSid: '',
        conversationHistory: [
          { role: 'system', content: `You are ${params.builderName} from ${params.companyName}. You're calling ${params.vendorName} at ${params.vendorCompany} about a project.` },
          { role: 'assistant', content: greeting }
        ],
        vendorInfo: { name: params.vendorName, company: params.vendorCompany },
        projectInfo: params.projectDetails,
        isActive: true
      };
      
      this.sessions.set(sessionId, session);

      // Create TwiML with Stream for real-time interaction
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="Polly.Joanna">Connecting you now.</Say>
          <Connect>
            <Stream url="${wsUrl}/api/elevenlabs-twilio/stream">
              <Parameter name="sessionId" value="${sessionId}" />
              <Parameter name="voiceId" value="${params.voiceId || 'pFZP5JQG7iQjIQuC4Bku'}" />
            </Stream>
          </Connect>
        </Response>`;

      console.log('📞 Placing call via Twilio...');
      
      const call = await twilioClient.calls.create({
        to: params.to,
        from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER,
        twiml: twimlResponse,
        statusCallback: `${webhookBase}/api/elevenlabs-twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      session.twilioCallSid = call.sid;

      console.log(`✅ Call initiated: ${call.sid}`);

      return {
        success: true,
        callSid: call.sid,
        sessionId,
        message: 'ElevenLabs call initiated with natural voice!'
      };
    } catch (error: any) {
      console.error('Error initiating call:', error);
      throw error;
    }
  }

  // Handle WebSocket stream from Twilio
  async handleStream(ws: WebSocket, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error('No session found for:', sessionId);
      ws.close();
      return;
    }

    session.twilioWs = ws;
    console.log('🔊 Stream connected for session:', sessionId);

    let audioQueue: string[] = [];
    let isProcessing = false;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.event) {
          case 'start':
            console.log('📞 Call started');
            // Send initial greeting
            await this.sendGreeting(session);
            break;
            
          case 'media':
            // Collect audio from caller
            audioQueue.push(message.media.payload);
            
            // Process audio when we have enough
            if (audioQueue.length > 20 && !isProcessing) {
              isProcessing = true;
              const fullAudio = audioQueue.join('');
              audioQueue = [];
              
              // Process and respond
              await this.processAndRespond(session, fullAudio);
              isProcessing = false;
            }
            break;
            
          case 'stop':
            console.log('📞 Call ended');
            this.endSession(sessionId);
            break;
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Stream closed');
      this.endSession(sessionId);
    });
  }

  // Send initial greeting
  private async sendGreeting(session: CallSession) {
    try {
      const greeting = session.conversationHistory[1].content;
      
      // Generate audio with ElevenLabs
      const audioStream = await elevenlabs.textToSpeech.convert(
        'pFZP5JQG7iQjIQuC4Bku', // Lily voice
        {
          text: greeting,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true
          },
          optimize_streaming_latency: 4
        }
      );

      // Stream audio to Twilio
      for await (const chunk of audioStream) {
        const base64Audio = Buffer.from(chunk).toString('base64');
        if (session.twilioWs && session.twilioWs.readyState === WebSocket.OPEN) {
          session.twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid: session.twilioCallSid,
            media: {
              payload: base64Audio
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error sending greeting:', error);
    }
  }

  // Process caller's speech and generate response
  private async processAndRespond(session: CallSession, audioBase64: string) {
    try {
      console.log('🎤 Processing caller audio...');
      
      // For now, generate a contextual response
      // In production, you'd transcribe the audio first
      const response = await this.generateResponse(session);
      
      if (!response) return;
      
      console.log('🗣️ Generating ElevenLabs audio for response...');
      
      // Generate audio with ElevenLabs
      const audioStream = await elevenlabs.textToSpeech.convertAsStream(
        'pFZP5JQG7iQjIQuC4Bku',
        {
          text: response,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true
          },
          optimize_streaming_latency: 4
        }
      );

      // Stream audio back to Twilio
      for await (const chunk of audioStream) {
        const base64Audio = Buffer.from(chunk).toString('base64');
        if (session.twilioWs && session.twilioWs.readyState === WebSocket.OPEN) {
          session.twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid: session.twilioCallSid,
            media: {
              payload: base64Audio
            }
          }));
        }
      }

      // Add to conversation history
      session.conversationHistory.push({ role: 'assistant', content: response });
      
    } catch (error) {
      console.error('Error processing and responding:', error);
    }
  }

  // Generate contextual response using GPT
  private async generateResponse(session: CallSession): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          ...session.conversationHistory,
          {
            role: 'user',
            content: 'Generate a natural response continuing the conversation about the project. Keep it short and conversational.'
          }
        ],
        max_tokens: 150,
        temperature: 0.8
      });

      return completion.choices[0].message.content || 'I appreciate your time today.';
    } catch (error) {
      console.error('Error generating response:', error);
      return 'Thank you for your time. We appreciate the opportunity to discuss this project with you.';
    }
  }

  // End session
  private endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isActive = false;
    
    if (session.twilioWs) {
      session.twilioWs.close();
    }

    this.sessions.delete(sessionId);
    console.log('🔚 Session ended:', sessionId);
  }

  // Get session status
  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }
}

export default new ElevenLabsTwilioService();