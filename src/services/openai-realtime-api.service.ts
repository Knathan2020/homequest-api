// OPENAI REALTIME API SERVICE
// Public API for real-time voice conversations with GPT-4o
// Released October 2024 - Now available to all developers!

import WebSocket from 'ws';
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import callPreparationService, { EnhancedCallContext } from './call-preparation.service';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN
);

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// OpenAI Realtime API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-your-key-here';
const REALTIME_API_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';

interface RealtimeSession {
  sessionId: string;
  twilioCallSid: string;
  openaiWs?: WebSocket;
  twilioWs?: WebSocket;
  projectContext: any;
  isActive: boolean;
  conversationId?: string;
}

class OpenAIRealtimeAPIService {
  private sessions = new Map<string, RealtimeSession>();

  // Initialize a Realtime API call with enhanced preparation
  async initiateEnhancedRealtimeCall(params: {
    to: string;
    vendorName: string;
    vendorCompany: string;
    projectDetails: any;
    builderName: string;
    companyName: string;
    teamId: string;
    enhancedContext: EnhancedCallContext;
  }) {
    try {
      console.log('🎙️ Initiating Enhanced OpenAI Realtime API Call...');

      const sessionId = `enhanced_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create Twilio call with enhanced context parameters
      const webhookBase = process.env.WEBHOOK_BASE_URL ||
        `https://${process.env.CODESPACE_NAME || 'cuddly-giggle-69p59v4xv5gw2rvw7'}-4000.app.github.dev`;

      const wsUrl = webhookBase.replace('https://', 'wss://');
      const streamUrl = `${wsUrl}/api/realtime/enhanced-stream`;

      // Enhanced TwiML with intelligent context
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="${streamUrl}">
              <Parameter name="sessionId" value="${sessionId}" />
              <Parameter name="vendorName" value="${params.vendorName}" />
              <Parameter name="vendorCompany" value="${params.vendorCompany}" />
              <Parameter name="vendorPhone" value="${params.to}" />
              <Parameter name="builderName" value="${params.builderName}" />
              <Parameter name="companyName" value="${params.companyName}" />
              <Parameter name="teamId" value="${params.teamId}" />
              <Parameter name="projectDetails" value="${encodeURIComponent(JSON.stringify(params.projectDetails))}" />
              <Parameter name="enhancedContext" value="${encodeURIComponent(JSON.stringify(params.enhancedContext))}" />
            </Stream>
          </Connect>
        </Response>`;

      const call = await twilioClient.calls.create({
        to: params.to,
        from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER,
        twiml: twimlResponse,
        statusCallback: `${webhookBase}/api/realtime/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Store enhanced session
      const session: RealtimeSession = {
        sessionId,
        twilioCallSid: call.sid,
        projectContext: { ...params.projectDetails, enhancedContext: params.enhancedContext },
        isActive: true,
        conversationId: `enhanced_conv_${Date.now()}`
      };

      this.sessions.set(sessionId, session);

      console.log(`✅ Enhanced realtime call initiated: ${call.sid}`);
      console.log(`🧠 Using ${params.enhancedContext.call_strategy.key_talking_points.length} intelligent talking points`);

      return {
        success: true,
        callSid: call.sid,
        sessionId,
        message: 'Enhanced OpenAI Realtime API call initiated with intelligent context!'
      };
    } catch (error) {
      console.error('Error initiating enhanced realtime call:', error);
      throw error;
    }
  }

  // Initialize a Realtime API call with Twilio (legacy method)
  async initiateRealtimeCall(params: {
    to: string;
    vendorName: string;
    vendorCompany: string;
    projectDetails: any;
    builderName: string;
    companyName: string;
    teamId: string;
  }) {
    try {
      console.log('🎙️ Initiating OpenAI Realtime API Call...');
      
      const sessionId = `realtime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create Twilio call with WebSocket streaming for real ChatGPT voice
      const webhookBase = process.env.WEBHOOK_BASE_URL || 
        `https://${process.env.CODESPACE_NAME || 'cuddly-giggle-69p59v4xv5gw2rvw7'}-4000.app.github.dev`;
      
      // For GitHub Codespaces, WebSocket URL needs proper WSS format for Twilio
      const wsUrl = webhookBase.replace('https://', 'wss://');
      
      console.log('🔍 Debug - Webhook Base:', webhookBase);
      console.log('🔍 Debug - WebSocket URL:', wsUrl);

      // TwiML with media streaming for real-time ChatGPT voice - straight to AI, no intro
      const streamUrl = `${wsUrl}/api/realtime/media-stream`;
      console.log('🔗 Full WebSocket Stream URL:', streamUrl);
      
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="${streamUrl}">
              <Parameter name="sessionId" value="${sessionId}" />
              <Parameter name="vendorName" value="${params.vendorName}" />
              <Parameter name="vendorCompany" value="${params.vendorCompany}" />
              <Parameter name="vendorPhone" value="${params.to}" />
              <Parameter name="builderName" value="${params.builderName}" />
              <Parameter name="companyName" value="${params.companyName}" />
              <Parameter name="teamId" value="${params.teamId}" />
              <Parameter name="projectDetails" value="${encodeURIComponent(JSON.stringify(params.projectDetails))}" />
            </Stream>
          </Connect>
        </Response>`;
      
      console.log('📋 Generated TwiML:', twimlResponse);

      const call = await twilioClient.calls.create({
        to: params.to,
        from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER,
        twiml: twimlResponse,
        statusCallback: `${webhookBase}/api/realtime/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Store session
      const session: RealtimeSession = {
        sessionId,
        twilioCallSid: call.sid,
        projectContext: params.projectDetails,
        isActive: true,
        conversationId: `conv_${Date.now()}`
      };

      this.sessions.set(sessionId, session);

      console.log(`✅ Realtime call initiated: ${call.sid}`);
      console.log(`🎯 Session ID: ${sessionId}`);

      return {
        success: true,
        callSid: call.sid,
        sessionId,
        message: 'OpenAI Realtime API call initiated with natural voice!'
      };
    } catch (error) {
      console.error('Error initiating realtime call:', error);
      throw error;
    }
  }

  // Connect to OpenAI Realtime API with enhanced context
  private async connectToOpenAIEnhanced(params: {
    sessionId: string;
    context: any;
    enhancedContext: EnhancedCallContext;
  }): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(REALTIME_API_URL, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      ws.on('open', () => {
        console.log('✅ Connected to OpenAI Realtime API with Enhanced Context');

        // Generate enhanced instructions
        const enhancedInstructions = callPreparationService.generateEnhancedInstructions(
          params.enhancedContext,
          params.context
        );

        // Configure the session with enhanced context
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: enhancedInstructions,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200
            },
            tools: [
              {
                type: 'function',
                name: 'schedule_meeting',
                description: 'Schedule a meeting or site visit',
                parameters: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    time: { type: 'string' },
                    location: { type: 'string' }
                  }
                }
              },
              {
                type: 'function',
                name: 'send_project_details',
                description: 'Send detailed project information via SMS/email',
                parameters: {
                  type: 'object',
                  properties: {
                    method: { type: 'string', enum: ['sms', 'email'] },
                    content: { type: 'string' }
                  }
                }
              }
            ]
          }
        }));

        // Send enhanced opening message
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'assistant',
              content: [{
                type: 'input_text',
                text: params.enhancedContext.call_strategy.opening_hook
              }]
            }
          }));

          ws.send(JSON.stringify({ type: 'response.create' }));
        }, 100);

        resolve(ws);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📥 Enhanced OpenAI message type:', message.type);
          if (message.type === 'error') {
            console.error('❌ OpenAI API Error:', JSON.stringify(message, null, 2));
          }
          this.handleOpenAIMessage(params.sessionId, message);
        } catch (error) {
          console.error('Error parsing OpenAI message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ Enhanced OpenAI WebSocket error:', error);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log(`⚠️ Enhanced OpenAI WebSocket closed - Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      });
    });
  }

  // Connect to OpenAI Realtime API (legacy method)
  private async connectToOpenAI(params: {
    sessionId: string;
    context: any;
  }): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      // Create WebSocket connection to OpenAI Realtime API
      const ws = new WebSocket(REALTIME_API_URL, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      ws.on('open', () => {
        console.log('✅ Connected to OpenAI Realtime API');
        
        // Configure the session
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are an AI assistant for ${params.context.builderName} at ${params.context.companyName}.
            
            You're having a VOICE conversation with ${params.context.vendorName} from ${params.context.vendorCompany}.
            
            PERSONALITY:
            - Sound natural, friendly, and professional
            - Use the vendor's name occasionally
            - Show enthusiasm about the project
            - Be confident but not pushy
            - Laugh naturally when appropriate
            - Use conversational fillers like "um", "you know" occasionally
            
            PROJECT DETAILS:
            - Location: ${params.context.projectDetails.address}
            - Type: ${params.context.projectDetails.type}
            - Budget: ${params.context.projectDetails.budget}
            - Timeline: ${params.context.projectDetails.timeline}
            - Urgency: ${params.context.projectDetails.urgency}
            
            GOALS:
            1. Build rapport naturally
            2. Get them excited about the project
            3. Answer questions with full authority
            4. Schedule a meeting or site visit
            5. Close the deal if possible
            
            AUTHORITY:
            - You can approve rates 10-20% above market
            - You can adjust timelines
            - You can make decisions on the spot
            
            Keep responses natural and conversational.`,
            voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200
            },
            tools: [
              {
                type: 'function',
                name: 'schedule_meeting',
                description: 'Schedule a meeting or site visit',
                parameters: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    time: { type: 'string' },
                    location: { type: 'string' }
                  }
                }
              },
              {
                type: 'function',
                name: 'send_project_details',
                description: 'Send detailed project information via SMS/email',
                parameters: {
                  type: 'object',
                  properties: {
                    method: { type: 'string', enum: ['sms', 'email'] },
                    content: { type: 'string' }
                  }
                }
              }
            ]
          }
        }));

        // Send initial greeting
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'assistant',
              content: [{
                type: 'input_text',
                text: `Hello ${params.context.vendorName}! This is ${params.context.builderName} from ${params.context.companyName}. 
                I'm calling about an exciting ${params.context.projectDetails.budget} project we have at ${params.context.projectDetails.address}. 
                We specifically wanted to work with ${params.context.vendorCompany} on this. Do you have a few minutes to discuss it?`
              }]
            }
          }));

          // Generate audio response
          ws.send(JSON.stringify({
            type: 'response.create'
          }));
        }, 100);

        resolve(ws);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📥 OpenAI message type:', message.type);
          if (message.type === 'error') {
            console.error('❌ OpenAI API Error:', JSON.stringify(message, null, 2));
          }
          this.handleOpenAIMessage(params.sessionId, message);
        } catch (error) {
          console.error('Error parsing OpenAI message:', error);
          console.error('Raw message:', data.toString());
        }
      });

      ws.on('error', (error) => {
        console.error('❌ OpenAI WebSocket error:', error);
        console.error('Full error details:', JSON.stringify(error, null, 2));
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log(`⚠️ OpenAI WebSocket closed - Code: ${code}, Reason: ${reason || 'No reason provided'}`);
        if (code === 1002) console.error('Protocol error - check API key and headers');
        if (code === 1006) console.error('Abnormal closure - likely authentication failed');
        if (code === 1008) console.error('Policy violation - check API usage');
      });
    });
  }

  // Handle messages from OpenAI
  private handleOpenAIMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    switch (message.type) {
      case 'session.created':
        console.log('📍 Session created:', message.session.id);
        break;

      case 'conversation.item.created':
        console.log('💬 Conversation item:', message.item.content?.[0]?.text || 'Audio message');
        break;

      case 'response.audio.delta':
        // Forward audio to Twilio
        if (session.twilioWs) {
          this.forwardAudioToTwilio(session, message.delta);
        }
        break;

      case 'response.audio_transcript.delta':
        console.log('🤖 AI saying:', message.delta);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        console.log('👤 Vendor said:', message.transcript);
        break;

      case 'response.done':
        console.log('✅ Response complete');
        break;

      case 'error':
        console.error('❌ OpenAI Error:', message.error);
        break;

      default:
        // console.log('OpenAI Event:', message.type);
        break;
    }
  }

  // Handle Enhanced Twilio media stream with intelligent context
  async handleEnhancedTwilioStream(ws: WebSocket, sessionId: string, enhancedContext: EnhancedCallContext) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error('No enhanced session found for:', sessionId);
      ws.close();
      return;
    }

    session.twilioWs = ws;
    console.log('🧠 Enhanced Twilio stream connected for session:', sessionId);

    // Connect to OpenAI with enhanced context
    try {
      session.openaiWs = await this.connectToOpenAIEnhanced({
        sessionId,
        context: session.projectContext,
        enhancedContext
      });
    } catch (error) {
      console.error('Failed to connect to OpenAI with enhanced context:', error);
      ws.close();
      return;
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.event === 'media') {
          this.forwardAudioToOpenAI(session, message.media.payload);
        } else if (message.event === 'start') {
          console.log('📞 Enhanced call started with intelligent context');
          console.log(`🎯 Call strategy: ${enhancedContext.call_strategy.approach_style}`);
          console.log(`💬 Opening hook: ${enhancedContext.call_strategy.opening_hook.substring(0, 50)}...`);
        } else if (message.event === 'stop') {
          console.log('📞 Enhanced call ended');
          this.endSession(sessionId);
        }
      } catch (error) {
        console.error('Error processing enhanced Twilio message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Enhanced Twilio stream closed');
      this.endSession(sessionId);
    });
  }

  // Handle Twilio media stream (legacy method)
  async handleTwilioStream(ws: WebSocket, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error('No session found for:', sessionId);
      ws.close();
      return;
    }

    session.twilioWs = ws;
    console.log('🔊 Twilio stream connected for session:', sessionId);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.event === 'media') {
          // Forward audio from vendor to OpenAI
          this.forwardAudioToOpenAI(session, message.media.payload);
        } else if (message.event === 'start') {
          console.log('📞 Call started, stream ready');
        } else if (message.event === 'stop') {
          console.log('📞 Call ended');
          this.endSession(sessionId);
        }
      } catch (error) {
        console.error('Error processing Twilio message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Twilio stream closed');
      this.endSession(sessionId);
    });
  }

  // Forward audio from Twilio to OpenAI
  private forwardAudioToOpenAI(session: RealtimeSession, audioBase64: string) {
    if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) return;

    // Convert base64 to PCM16 and send to OpenAI
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    session.openaiWs.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: audioBase64
    }));
  }

  // Forward audio from OpenAI to Twilio
  private forwardAudioToTwilio(session: RealtimeSession, audioBase64: string) {
    if (!session.twilioWs || session.twilioWs.readyState !== WebSocket.OPEN) return;

    session.twilioWs.send(JSON.stringify({
      event: 'media',
      streamSid: session.twilioCallSid,
      media: {
        payload: audioBase64
      }
    }));
  }

  // End session and cleanup
  private async endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isActive = false;

    // Close WebSocket connections
    if (session.openaiWs) {
      session.openaiWs.close();
    }
    if (session.twilioWs) {
      session.twilioWs.close();
    }

    // Save conversation to database
    await this.saveConversation(session);

    // Remove session
    this.sessions.delete(sessionId);
    
    console.log('🔚 Session ended:', sessionId);
  }

  // Save conversation to database
  private async saveConversation(session: RealtimeSession) {
    try {
      await supabase.from('realtime_conversations').insert({
        session_id: session.sessionId,
        call_sid: session.twilioCallSid,
        conversation_id: session.conversationId,
        project_context: session.projectContext,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  // Handle function calls from OpenAI
  async handleFunctionCall(sessionId: string, functionName: string, args: any) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    switch (functionName) {
      case 'schedule_meeting':
        console.log('📅 Scheduling meeting:', args);
        // Implement meeting scheduling
        return { success: true, message: `Meeting scheduled for ${args.date} at ${args.time}` };

      case 'send_project_details':
        console.log('📧 Sending project details via', args.method);
        // Implement sending details
        return { success: true, message: `Details sent via ${args.method}` };

      default:
        return { success: false, message: 'Unknown function' };
    }
  }
}

export default new OpenAIRealtimeAPIService();