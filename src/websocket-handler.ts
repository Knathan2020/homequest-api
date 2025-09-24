/**
 * WebSocket Handler for Twilio Media Streams
 * Direct WebSocket handling without express-ws complications
 */

import WebSocket from 'ws';
import { Server } from 'http';
import conversationTranscriptService from './services/conversation-transcript.service';

// Simplified audio conversion functions for better quality
// μ-law encode/decode tables for standard telephony
const MULAW_BIAS = 0x84;
const MULAW_MAX = 32635;

// Standard μ-law encode function
function linearToMulaw(sample: number): number {
  let sign = 0;
  let exponent = 0;
  let mantissa = 0;
  
  // Get sign and magnitude
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  
  // Clip sample
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  
  // Add bias
  sample = sample + MULAW_BIAS;
  
  // Find exponent
  if (sample < 0x100) {
    exponent = 0;
  } else if (sample < 0x200) {
    exponent = 1;
  } else if (sample < 0x400) {
    exponent = 2;
  } else if (sample < 0x800) {
    exponent = 3;
  } else if (sample < 0x1000) {
    exponent = 4;
  } else if (sample < 0x2000) {
    exponent = 5;
  } else if (sample < 0x4000) {
    exponent = 6;
  } else {
    exponent = 7;
  }
  
  // Calculate mantissa
  if (exponent === 0) {
    mantissa = (sample >> 4) & 0x0F;
  } else {
    mantissa = (sample >> (exponent + 3)) & 0x0F;
  }
  
  // Combine and return inverted
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

// Standard μ-law decode function
function mulawToLinear(mulawByte: number): number {
  const MULAW_DECODE = [
    -32124,-31100,-30076,-29052,-28028,-27004,-25980,-24956,
    -23932,-22908,-21884,-20860,-19836,-18812,-17788,-16764,
    -15996,-15484,-14972,-14460,-13948,-13436,-12924,-12412,
    -11900,-11388,-10876,-10364, -9852, -9340, -8828, -8316,
     -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
     -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
     -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
     -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
     -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
     -1372, -1308, -1244, -1180, -1116, -1052,  -988,  -924,
      -876,  -844,  -812,  -780,  -748,  -716,  -684,  -652,
      -620,  -588,  -556,  -524,  -492,  -460,  -428,  -396,
      -372,  -356,  -340,  -324,  -308,  -292,  -276,  -260,
      -244,  -228,  -212,  -196,  -180,  -164,  -148,  -132,
      -120,  -112,  -104,   -96,   -88,   -80,   -72,   -64,
       -56,   -48,   -40,   -32,   -24,   -16,    -8,     0,
     32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
     23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
     15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
     11900, 11388, 10876, 10364,  9852,  9340,  8828,  8316,
      7932,  7676,  7420,  7164,  6908,  6652,  6396,  6140,
      5884,  5628,  5372,  5116,  4860,  4604,  4348,  4092,
      3900,  3772,  3644,  3516,  3388,  3260,  3132,  3004,
      2876,  2748,  2620,  2492,  2364,  2236,  2108,  1980,
      1884,  1820,  1756,  1692,  1628,  1564,  1500,  1436,
      1372,  1308,  1244,  1180,  1116,  1052,   988,   924,
       876,   844,   812,   780,   748,   716,   684,   652,
       620,   588,   556,   524,   492,   460,   428,   396,
       372,   356,   340,   324,   308,   292,   276,   260,
       244,   228,   212,   196,   180,   164,   148,   132,
       120,   112,   104,    96,    88,    80,    72,    64,
        56,    48,    40,    32,    24,    16,     8,     0
  ];
  return MULAW_DECODE[~mulawByte & 0xFF];
}

export function setupDirectWebSocket(server: Server) {
  const wss = new WebSocket.Server({ 
    noServer: true  // Important: use noServer mode to manually handle upgrades
  });

  console.log('🔌 Direct WebSocket server initialized for manual upgrade handling');

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('📞 New Twilio WebSocket connected:', req.url);
    console.log('Headers:', req.headers);
    console.log('WebSocket readyState:', ws.readyState);
    
    let sessionId: string;
    let openaiWs: WebSocket | null = null;
    let streamSid: string;
    let messageCount = 0;
    let hasReceivedStart = false;
    
    // Set up message handler immediately
    console.log('Setting up message handler...');
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
    
    ws.on('error', (error) => {
      console.error('❌ Twilio WebSocket error:', error);
    });
    
    ws.on('pong', () => {
      console.log('🏓 WebSocket pong received');
    });
    
    ws.on('message', async (data: Buffer | string) => {
      messageCount++;
      console.log(`📨 Raw message received (${messageCount}), type:`, typeof data, 'length:', data.length);
      
      try {
        // Handle both Buffer and string data types
        const messageStr = typeof data === 'string' ? data : data.toString();
        console.log('Message as string:', messageStr.substring(0, 200));
        
        const message = JSON.parse(messageStr);
        console.log(`📨 Parsed message event:`, message.event);
        
        if (!hasReceivedStart && message.event === 'start') {
          hasReceivedStart = true;
          console.log('✅ Received START event from Twilio');
        }
        
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
            });
            
            openaiWs.on('open', () => {
              console.log('✅ Connected to OpenAI Realtime API');
              
              // Configure session to use g711_ulaw directly for optimal phone quality
              openaiWs.send(JSON.stringify({
                type: 'session.update',
                session: {
                  modalities: ['text', 'audio'],
                  instructions: `You are ${builderName}, a real construction project manager from ${companyName}. You're calling ${vendorName} personally because you genuinely need their expertise for a ${projectDetails.type || 'construction'} project.

CRITICAL: Sound like a REAL PERSON, not a sales robot:
- Use casual, natural speech patterns with "um", "you know", slight pauses
- Sound slightly tired from a long day but enthusiastic about the project
- Reference specific details naturally: "${projectDetails.address || 'the job site'}", "${projectDetails.budget || 'good budget'}"
- If they seem suspicious, acknowledge it: "I know, I know, everyone gets these calls"
- Speak with genuine urgency - you actually need this work done
- Use contractor language: "We're looking at", "The timeline's pretty flexible", "What's your availability like?"

You're NOT selling - you're hiring. Act like you really need their help and this is a legitimate opportunity.`,
                  voice: 'alloy',  // More natural, less robotic voice
                  input_audio_format: 'g711_ulaw',
                  output_audio_format: 'g711_ulaw', 
                  input_audio_transcription: {
                    model: 'whisper-1'
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.4,
                    prefix_padding_ms: 200,
                    silence_duration_ms: 600
                  }
                }
              }));
              
              // Create natural, authentic greeting
              const greeting = `Hey ${vendorName}, this is ${builderName} from ${companyName}. Look, I know you probably get a lot of these calls, but I'm actually calling because we've got a real job at ${projectDetails.address || 'a property'} and, uh, I heard good things about your work. Are you taking on any new projects right now?`;
              
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
                type: 'response.create',
                response: {
                  modalities: ['text', 'audio'],
                  instructions: 'Please respond naturally and wait for the user to speak.'
                }
              }));
            });
            
            openaiWs.on('message', (data) => {
              const response = JSON.parse(data.toString());
              
              // Log all OpenAI messages for debugging
              if (response.type === 'error') {
                console.error('❌ OpenAI API Error:', JSON.stringify(response, null, 2));
              }
              
              // Handle input audio buffer commit (when user stops speaking)
              if (response.type === 'input_audio_buffer.committed') {
                console.log('🎤 User finished speaking, generating response...');
                // Trigger a response after user speaks
                openaiWs.send(JSON.stringify({
                  type: 'response.create'
                }));
              }
              
              if (response.type === 'response.audio.delta' && response.delta) {
                // Pass through g711_ulaw directly - no conversion needed
                ws.send(JSON.stringify({
                  event: 'media',
                  streamSid: streamSid,
                  media: {
                    payload: response.delta  // Already base64 g711_ulaw from OpenAI
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
            break;
            
          case 'media':
            // Pass through g711_ulaw directly - no conversion needed
            if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
              // Append audio to input buffer - Twilio g711_ulaw matches OpenAI
              openaiWs.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: message.media.payload  // Already base64 g711_ulaw from Twilio
              }));
            }
            break;
            
          case 'stop':
            console.log('📞 Twilio stream stopped');
            if (openaiWs) {
              openaiWs.close();
            }
            break;
        }
      } catch (error) {
        console.error('Error processing Twilio message:', error);
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`📞 Twilio WebSocket closed - Code: ${code}, Reason: ${reason?.toString() || 'unknown'}`);
      console.log(`Messages received: ${messageCount}`);
      clearInterval(keepAlive);
      if (openaiWs) {
        openaiWs.close();
      }
    });
  });

  // Handle HTTP upgrade requests manually
  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url || '';
    console.log('🔄 WebSocket upgrade request received for:', pathname);
    
    // Handle both paths (with and without .websocket suffix)
    if (pathname === '/api/realtime/media-stream' || 
        pathname === '/api/realtime/media-stream/.websocket' ||
        pathname.startsWith('/api/realtime/media-stream')) {
      
      console.log('✅ Handling WebSocket upgrade for Twilio Media Stream');
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        console.log('🔌 WebSocket upgraded successfully');
        wss.emit('connection', ws, request);
      });
    } else {
      console.log('❌ Ignoring upgrade request for:', pathname);
      socket.destroy();
    }
  });
}