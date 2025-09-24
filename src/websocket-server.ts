/**
 * WebSocket Server Configuration
 * Handles real-time audio streaming between Twilio and OpenAI
 */

import { Server } from 'http';
import expressWs from 'express-ws';
import { Application } from 'express';
import WebSocket from 'ws';
import conversationTranscriptService from './services/conversation-transcript.service';

// Audio format conversion utilities
export function mulawToPcm16(mulaw: Buffer): Buffer {
  const pcm16 = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    const mulawByte = mulaw[i];
    // μ-law to linear PCM conversion
    const sign = (mulawByte & 0x80) >> 7;
    const exponent = (mulawByte & 0x70) >> 4;
    const mantissa = mulawByte & 0x0F;
    
    let linearValue = ((mantissa << 3) + 0x84) << (exponent + 3);
    linearValue = sign ? -linearValue : linearValue;
    
    // Write as 16-bit PCM (little-endian)
    pcm16.writeInt16LE(linearValue, i * 2);
  }
  return pcm16;
}

export function pcm16ToMulaw(pcm16: Buffer): Buffer {
  const mulaw = Buffer.alloc(pcm16.length / 2);
  for (let i = 0; i < pcm16.length; i += 2) {
    let sample = pcm16.readInt16LE(i);
    
    // Clip the sample
    sample = Math.max(-32768, Math.min(32767, sample));
    
    // Get sign
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    
    // Add bias
    sample = sample + 0x84;
    
    // Find exponent and mantissa
    let exponent = 7;
    for (let exp = 7; exp >= 0; exp--) {
      if (sample & (0x4000 >> (7 - exp))) {
        exponent = exp;
        break;
      }
    }
    
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulawByte = sign | (exponent << 4) | mantissa;
    mulaw[i / 2] = ~mulawByte; // μ-law uses inverted bits
  }
  return mulaw;
}

// Setup WebSocket server
export function setupWebSocketServer(server: Server, app: Application) {
  // Initialize express-ws with the server - this patches the app to support WebSocket
  const wsInstance = expressWs(app, server);
  
  console.log('🔌 WebSocket server initialized for real-time audio streaming');
  
  // Track active streaming sessions
  const streamingSessions = new Map<string, {
    twilioWs: WebSocket;
    openaiWs: WebSocket;
    sessionId: string;
    callSid: string;
    startTime: number;
    teamId?: string;
    vendorName?: string;
    vendorCompany?: string;
    builderName?: string;
    companyName?: string;
  }>();
  
  // Handler function for Twilio media streams
  const handleTwilioMediaStream = (ws: WebSocket, req: any) => {
    console.log('📞 New Twilio media stream connected');
    
    let sessionId: string;
    let openaiWs: WebSocket | null = null;
    let streamSid: string;
    
    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data);
        
        switch (message.event) {
          case 'start':
            console.log('🎙️ Twilio stream started:', message.start);
            streamSid = message.start.streamSid;
            sessionId = message.start.customParameters?.sessionId || `stream_${Date.now()}`;
            const teamId = message.start.customParameters?.teamId || 'default';
            const vendorName = message.start.customParameters?.vendorName || 'Vendor';
            const vendorCompany = message.start.customParameters?.vendorCompany || 'Company';
            const vendorPhone = message.start.customParameters?.vendorPhone || 'Unknown';
            const builderName = message.start.customParameters?.builderName || 'Builder';
            const companyName = message.start.customParameters?.companyName || 'Construction Co';
            const projectDetails = message.start.customParameters?.projectDetails ? 
              JSON.parse(decodeURIComponent(message.start.customParameters.projectDetails)) : {};
            
            // Start conversation transcript
            conversationTranscriptService.startTranscript({
              sessionId,
              callSid: message.start.callSid,
              teamId,
              vendorName,
              vendorCompany,
              vendorPhone,
              builderName,
              companyName,
              projectDetails
            });
            
            // Connect to OpenAI Realtime API
            const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
            openaiWs = new WebSocket(
              'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
              {
                headers: {
                  'Authorization': `Bearer ${OPENAI_API_KEY}`,
                  'OpenAI-Beta': 'realtime=v1'
                }
              }
            );
            
            openaiWs.on('error', (error) => {
              console.error('❌ OpenAI WebSocket Error:', error);
              console.error('Full error:', JSON.stringify(error, null, 2));
            });
            
            openaiWs.on('open', () => {
              console.log('✅ Connected to OpenAI Realtime API');
              
              // Vendor info already extracted above
              
              // Configure session
              openaiWs.send(JSON.stringify({
                type: 'session.update',
                session: {
                  modalities: ['text', 'audio'],
                  instructions: `You are ${builderName} calling from ${companyName} about an exciting ${projectDetails.type || 'luxury'} project. 
                  The vendor's name is ${vendorName}. Be conversational, friendly, and enthusiastic about the project at ${projectDetails.address || 'the area'}.
                  Budget is ${projectDetails.budget || 'substantial'} with ${projectDetails.timeline || 'flexible'} timeline.
                  Speak naturally like a real person, not a robot. Introduce yourself as ${builderName} from ${companyName}.`,
                  voice: 'shimmer', // More natural voice option
                  input_audio_format: 'pcm16',
                  output_audio_format: 'pcm16',
                  input_audio_transcription: {
                    model: 'whisper-1'
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                  }
                }
              }));
              
              // Create initial greeting
              const greeting = `Hi ${vendorName}! This is ${builderName} from ${companyName}. I'm calling about an exciting project we have in ${projectDetails.address || 'the area'}. We've been looking for the right contractor and your company came highly recommended. Do you have a quick minute to hear about it?`;
              
              // Save initial AI message to transcript
              conversationTranscriptService.addMessage(sessionId, {
                role: 'assistant',
                content: greeting,
                speaker_name: `AI (as ${builderName})`,
                timestamp: new Date().toISOString()
              });
              
              // Send greeting to OpenAI
              openaiWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'assistant',
                  content: [{
                    type: 'text',
                    text: greeting
                  }]
                }
              }));
              
              // Generate the audio response immediately
              openaiWs.send(JSON.stringify({
                type: 'response.create'
              }));
            });
            
            openaiWs.on('message', (data) => {
              const response = JSON.parse(data.toString());
              
              // Log all OpenAI messages for debugging
              if (response.type === 'error') {
                console.error('❌ OpenAI API Error:', JSON.stringify(response, null, 2));
              }
              
              if (response.type === 'response.audio.delta' && response.delta) {
                // Convert PCM16 to mulaw and send to Twilio
                const pcm16Audio = Buffer.from(response.delta, 'base64');
                const mulawAudio = pcm16ToMulaw(pcm16Audio);
                
                ws.send(JSON.stringify({
                  event: 'media',
                  streamSid: streamSid,
                  media: {
                    payload: mulawAudio.toString('base64')
                  }
                }));
              }
              
              if (response.type === 'response.audio_transcript.done') {
                console.log('🤖 AI said:', response.transcript);
                // Save AI response to transcript
                conversationTranscriptService.addMessage(sessionId, {
                  role: 'assistant',
                  content: response.transcript,
                  speaker_name: `AI (as ${builderName})`,
                  timestamp: new Date().toISOString()
                });
              }
              
              if (response.type === 'conversation.item.input_audio_transcription.completed') {
                console.log('👤 Vendor said:', response.transcript);
                // Save vendor response to transcript
                conversationTranscriptService.addMessage(sessionId, {
                  role: 'user',
                  content: response.transcript,
                  speaker_name: vendorName,
                  timestamp: new Date().toISOString()
                });
              }
            });
            
            streamingSessions.set(sessionId, {
              twilioWs: ws,
              openaiWs: openaiWs,
              sessionId,
              callSid: message.start.callSid,
              startTime: Date.now(),
              teamId,
              vendorName,
              vendorCompany,
              builderName,
              companyName
            });
            break;
            
          case 'media':
            // Forward audio from Twilio to OpenAI
            if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
              const mulawAudio = Buffer.from(message.media.payload, 'base64');
              const pcm16Audio = mulawToPcm16(mulawAudio);
              
              openaiWs.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: pcm16Audio.toString('base64')
              }));
            }
            break;
            
          case 'stop':
            console.log('📞 Twilio stream stopped');
            const session = streamingSessions.get(sessionId);
            if (session) {
              // Calculate duration and save transcript
              const duration = Math.floor((Date.now() - session.startTime) / 1000);
              conversationTranscriptService.endTranscript(sessionId, {
                status: 'successful',
                duration,
                resultSummary: 'Call completed',
                aiScore: 8.5
              });
            }
            if (openaiWs) {
              openaiWs.close();
            }
            streamingSessions.delete(sessionId);
            break;
        }
      } catch (error) {
        console.error('Error processing Twilio message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('📞 Twilio WebSocket closed');
      if (openaiWs) {
        openaiWs.close();
      }
      if (sessionId) {
        streamingSessions.delete(sessionId);
      }
    });
  };
  
  // Register both paths - with and without .websocket suffix
  // Use the original app that has been patched by express-ws
  (app as any).ws('/api/realtime/media-stream', handleTwilioMediaStream);
  (app as any).ws('/api/realtime/media-stream/.websocket', handleTwilioMediaStream);
  
  console.log('✅ WebSocket routes registered for /api/realtime/media-stream');
  console.log('✅ WebSocket routes registered for /api/realtime/media-stream/.websocket');
  
  return app;
}
