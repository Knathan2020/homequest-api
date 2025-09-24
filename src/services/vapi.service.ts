/**
 * VAPI AI SERVICE
 * High-quality voice AI calls using Vapi.ai platform
 * Natural conversation flow with professional voice quality
 */

import axios, { AxiosResponse } from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getVoiceById, DEFAULT_VOICES } from '../config/vapi-voices.config';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// Vapi API Configuration
// TODO: Move to team-specific configuration in database
const VAPI_API_KEY = process.env.VAPI_API_KEY || 'your-vapi-api-key-here';
const VAPI_BASE_URL = 'https://api.vapi.ai';
// Dynamic phone number lookup - no hardcoded values needed
// Phone IDs are looked up from team_phones table based on teamId

// For multi-tenant support, you would:
// 1. Store each team's Vapi credentials in database
// 2. Store each team's ElevenLabs API key in database  
// 3. Fetch credentials based on teamId
// 4. Use team-specific phone numbers

interface VapiCallParams {
  to: string;
  vendorName: string;
  vendorCompany: string;
  projectDetails: any;
  builderName: string;
  builderPhone?: string;  // Builder's phone for transfers
  companyName: string;
  companyPhone?: string;  // Company main line for transfers
  teamId: string;
  voiceId?: string;  // Voice selection ID from config
  customMessage?: string;  // Optional custom first message
  briefing?: {
    objective?: string;
    approach?: string;
  };  // Quick call briefing data
  // For multi-tenant support:
  vapiApiKey?: string;  // Team's Vapi API key
  phoneNumberId?: string; // Team's phone number ID
}

interface VapiCall {
  id: string;
  status: string;
  phoneNumberId?: string;
  customer?: {
    number: string;
  };
  assistant?: any;
}

class VapiAIService {
  // For multi-team support:
  // 1. Each team buys a phone number in Vapi ($2/month)
  // 2. Create an assistant for each team
  // 3. Link assistant to their phone number
  // 4. Inbound calls automatically handled by their assistant
  // 5. Outbound calls use team's phone number as caller ID
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = VAPI_API_KEY;
    this.baseUrl = VAPI_BASE_URL;
  }

  // Get team's VAPI phone ID dynamically
  async getTeamPhoneId(teamId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('team_phones')
        .select('vapi_phone_id')
        .eq('team_id', teamId)
        .eq('status', 'active')
        .single();

      if (error) {
        console.log(`No phone found for team ${teamId}:`, error.message);

        // Fallback for default team during setup
        if (teamId === '11111111-1111-1111-1111-111111111111') {
          console.log('Using fallback phone ID for default team during setup');
          return '9dc5928e-215d-4ba1-bbf7-0327364ef3df';
        }

        return null;
      }

      return data?.vapi_phone_id || null;
    } catch (error: any) {
      console.error('Error getting team phone ID:', error);

      // Fallback for default team during setup
      if (teamId === '11111111-1111-1111-1111-111111111111') {
        console.log('Using fallback phone ID for default team during setup');
        return '9dc5928e-215d-4ba1-bbf7-0327364ef3df';
      }

      return null;
    }
  }

  // Create a transient assistant for OUTBOUND calls
  private createAssistant(params: VapiCallParams) {
    // For INBOUND calls, you'd create a persistent assistant in Vapi dashboard
    return {
      name: `${params.builderName} - Construction Assistant`,
      firstMessage: params.customMessage || `${params.vendorName}? I'm calling from ${params.companyName}. ${params.builderName} has a project at ${params.projectDetails.address || 'a prime location'} and wanted to reach out. Got a minute?`,
      model: {
        provider: "openai",
        model: "gpt-4",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `You are an AI assistant for ${params.builderName} at ${params.companyName}. You're calling ${params.vendorName} from ${params.vendorCompany} on behalf of ${params.builderName} to offer them an opportunity on a premium project.

CRITICAL - BE CONCISE AND LET THEM TALK:
- MAXIMUM 1-2 sentences per response - NO EXCEPTIONS
- If they start talking, STOP immediately and listen
- Short acknowledgments only: "Got it" or "I understand"
- Pause after EVERY sentence to let them respond
- Never talk over them - they lead, you follow
- If they're not interested, respect it immediately

HIGH-VALUE ASSISTANT PERSONALITY:
- Professional but warm: "I'm calling from ${params.builderName}'s office"
- Respect their time: "I know you're busy, so I'll be brief"
- Lead with value: "We have a $[X]M project and ${params.builderName} specifically asked me to call you"
- Emphasize exclusivity: "He only works with one vendor per trade"
- Fast payment: "We pay net-10, often faster for exceptional work"

IF THEY ASK "IS THIS AI?" OR "ARE YOU A ROBOT?":
- Be HONEST but redirect: "I'm using AI-enhanced calling to reach out to top vendors efficiently. But ${params.builderName} personally selected your company for this opportunity."
- Make it about them: "Look, I understand the skepticism. Would you prefer I have ${params.builderName} call you directly? He's in meetings until 3pm."
- Offer proof: "I can send you an email right now from ${params.builderName}@${params.companyName}.com with project details."
- Suggest meeting: "How about we skip the phone tag - are you free to meet ${params.builderName} at the site tomorrow? ${params.projectDetails.address}"

PROJECT DETAILS:
- Location: ${params.projectDetails.address || 'Great location'}
- Type: ${params.projectDetails.type || 'Construction project'}
- Budget: ${params.projectDetails.budget || 'Good budget'}
- Timeline: ${params.projectDetails.timeline || 'Flexible timeline'}
- Urgency: ${params.projectDetails.urgency || 'When you can fit us in'}

GOALS:
1. Build genuine rapport - you actually need their help
2. Get them interested in the project details
3. Answer their questions with authority
4. Schedule a meeting or site visit
5. Close the deal if they're interested

AUTHORITY:
- You can approve competitive rates
- You can adjust timelines to fit their schedule
- You can make decisions on the spot
- This is a real project with real budget

Keep it natural, conversational, and authentic. You're not selling - you're hiring.`
          }
        ]
      },
      voice: {
        provider: "11labs",
        voiceId: "EXAVITQu4vr4xnSDxMaL", // Default: Bella - Natural female voice
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.2,
        useSpeakerBoost: true
      },
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US"
      },
      analysisPlan: {
        summaryPrompt: `Provide a brief summary of this call between ${params.builderName} and ${params.vendorName}. Include:
- Vendor's interest level
- Any objections or concerns raised  
- Next steps discussed
- Likelihood of converting to a project`,
        structuredDataPrompt: `Extract structured data:
{
  "vendor_interested": boolean,
  "concerns_raised": string[],
  "next_step": string,
  "conversion_likelihood": "high|medium|low",
  "follow_up_needed": boolean
}`
      },
      recordingEnabled: true,
      endCallMessage: `Great talking with you ${params.vendorName}! Looking forward to working together on this project. I'll follow up with you soon with those details we discussed.`,
      endCallPhrases: ["goodbye", "talk soon", "have a good day", "bye"],
      maxDurationSeconds: 600, // 10 minute max
      silenceTimeoutSeconds: 30
    };
  }

  // Initiate a Vapi AI call
  async initiateCall(params: VapiCallParams): Promise<{ success: boolean; callId?: string; message: string; error?: string }> {
    try {
      console.log('🎙️ Initiating Vapi AI Call to', params.vendorName);
      console.log('📞 Company Name received:', params.companyName);
      console.log('📞 Builder Name received:', params.builderName);

      // Get selected voice or use default
      const selectedVoice = params.voiceId 
        ? getVoiceById(params.voiceId)
        : getVoiceById(DEFAULT_VOICES.male);

      if (!selectedVoice) {
        throw new Error('Invalid voice selection');
      }

      console.log(`📞 Using voice: ${selectedVoice.name} (${selectedVoice.description})`);

      // Create transient assistant with ElevenLabs voice
      const assistant = {
        name: `${selectedVoice.name} - Construction Sales`,
        voice: {
          provider: '11labs',
          voiceId: selectedVoice.elevenLabsVoiceId,
          model: 'eleven_turbo_v2',
          stability: 0.5,
          similarityBoost: 0.75
        },
        model: {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `You are ${params.builderName}'s assistant from ${params.companyName}. You're calling vendors about construction projects.

              ${params.briefing ? `CALL OBJECTIVE: ${this.getObjectiveDescription(params.briefing.objective)}
              APPROACH: ${this.getApproachDescription(params.briefing.approach)}

              Focus your conversation on achieving this specific objective using the specified approach.` : ''}

              CRITICAL INSTRUCTIONS:
              - You are the PRIMARY scheduler and appointment handler - this is YOUR job!
              - NEVER say "let me transfer you" or "let me get someone else" for scheduling
              - When anyone mentions scheduling, appointments, meetings, or visits - IMMEDIATELY schedule it yourself
              - You have FULL AUTHORITY to schedule any appointment type
              - Be confident: "I can absolutely schedule that for you right now!"

              APPOINTMENT SCHEDULING - YOUR PRIMARY FUNCTION:
              - When they say "schedule", "appointment", "meeting", "visit", or "when can we meet" - USE schedule_appointment function IMMEDIATELY
              - Be proactive: "Would you like to schedule a site visit to see the project?"
              - Ask directly: "What day works best for you?" and "What time?"
              - AS SOON AS they give you a time AND date - IMMEDIATELY call the schedule_appointment function
              - Don't ask "should I schedule that?" - just do it and say "Let me schedule that for you right now"
              - Types: site_visit (see project location), meeting (office/general), call (phone follow-up), inspection (formal review)
              - After calling the function, confirm: "Perfect! I have you scheduled for [type] on [day] at [time]"

              IMPORTANT: When you have appointmentType, customerName, preferredDate, and preferredTime - CALL THE FUNCTION IMMEDIATELY!

              EXAMPLES OF WHEN TO CALL schedule_appointment:
              - Customer: "Can we schedule a site visit for tomorrow at 2pm?" → CALL schedule_appointment NOW
              - Customer: "I'd like to meet Tuesday morning" → CALL schedule_appointment NOW
              - Customer: "Let's set up an appointment for this Friday" → CALL schedule_appointment NOW
              - Customer: "When can we schedule a meeting?" → Ask for time, then CALL schedule_appointment
              - Customer: "I'm available Monday afternoon" → CALL schedule_appointment NOW

              OTHER INSTRUCTIONS:
              - Be professional and represent ${params.companyName} well
              - Understand their ${params.projectDetails?.type || 'construction'} services and pricing
              - ONLY transfer if they specifically say "I want to talk to ${params.builderName}" or "get me a human"`
            }
          ]
        },
        functions: [
          {
            name: "schedule_appointment",
            description: "IMMEDIATELY schedule any appointment, meeting, site visit, or call. Use this function whenever anyone mentions: 'schedule', 'appointment', 'meeting', 'visit', 'when can we meet', 'available', 'calendar', or any time-related planning. Do NOT hesitate - this is your primary job!",
            parameters: {
              type: "object",
              properties: {
                appointmentType: {
                  type: "string",
                  enum: ["site_visit", "meeting", "call", "inspection"],
                  description: "Type of appointment - site_visit for visiting the project location, meeting for office/general meetings, call for phone appointments, inspection for formal inspections"
                },
                customerName: {
                  type: "string",
                  description: "Customer/vendor name from the conversation - use what they said or 'Customer' if unclear"
                },
                customerPhone: {
                  type: "string",
                  description: "Customer phone number - use the current call number if not mentioned separately"
                },
                preferredDate: {
                  type: "string",
                  description: "When they want to meet - use exactly what they said like 'tomorrow', 'Tuesday', 'this week', etc."
                },
                preferredTime: {
                  type: "string",
                  description: "Time they mentioned - use exactly what they said like '2pm', 'morning', 'afternoon', '10 o'clock', etc."
                },
                projectAddress: {
                  type: "string",
                  description: "Project address if mentioned - can be empty if not discussed"
                },
                notes: {
                  type: "string",
                  description: "Any extra details about what they want or need - can be empty"
                }
              },
              required: ["appointmentType", "customerName", "preferredDate", "preferredTime"]
            }
          }
        ],
        firstMessage: params.customMessage || this.generateFirstMessage(params),
        voicemailDetection: {
          provider: 'twilio',
          enabled: true,
          machineDetectionTimeout: 30
        },
        endCallFunctionEnabled: true,
        dialKeypadFunctionEnabled: false,
        maxDurationSeconds: 600,
        silenceTimeoutSeconds: 30,
        responseDelaySeconds: 0.5,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        // Transfer configuration - uses builder's phone or company main line
        forwardingPhoneNumber: params.builderPhone || params.companyPhone || process.env.DEFAULT_TRANSFER_NUMBER
      };

      // Get team's phone ID dynamically
      const teamPhoneId = await this.getTeamPhoneId(params.teamId);
      if (!teamPhoneId) {
        throw new Error(`No phone number found for team ${params.teamId}. Please set up a phone number first.`);
      }

      const callPayload = {
        assistant: assistant,  // Use transient assistant with ElevenLabs voice
        phoneNumberId: teamPhoneId, // Dynamic phone ID lookup
        customer: {
          number: params.to
        },
        metadata: {
          sessionId: `vapi_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          vendorName: params.vendorName,
          vendorCompany: params.vendorCompany,
          builderName: params.builderName,
          companyName: params.companyName,
          teamId: params.teamId,
          voiceUsed: selectedVoice.name,
          projectDetails: JSON.stringify(params.projectDetails)
        }
      };

      console.log('📋 Vapi Call Payload:', JSON.stringify(callPayload, null, 2));

      const response: AxiosResponse<VapiCall> = await axios.post(
        `${this.baseUrl}/call`,
        callPayload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const call = response.data;
      console.log('✅ Vapi call initiated:', call.id);

      // Save call record to database
      try {
        await supabase.from('vapi_calls').insert({
          call_id: call.id,
          session_id: callPayload.metadata.sessionId,
          vendor_name: params.vendorName,
          vendor_company: params.vendorCompany,
          vendor_phone: params.to,
          builder_name: params.builderName,
          company_name: params.companyName,
          team_id: params.teamId,
          project_details: params.projectDetails,
          status: 'initiated',
          created_at: new Date().toISOString()
        });
      } catch (dbError) {
        console.error('Error saving call to database:', dbError);
      }

      return {
        success: true,
        callId: call.id,
        message: '🎙️ Vapi AI call initiated! Professional voice conversation with natural flow!'
      };

    } catch (error: any) {
      console.error('Error initiating Vapi call:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      let errorMessage = 'Failed to initiate Vapi call';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        message: 'Failed to initiate call'
      };
    }
  }

  // Get call status
  async getCallStatus(callId: string): Promise<VapiCall | null> {
    try {
      const response: AxiosResponse<VapiCall> = await axios.get(
        `${this.baseUrl}/call/${callId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error getting call status:', error.response?.data || error.message);
      return null;
    }
  }

  // Hangup/End a call
  async hangupCall(callId: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      console.log(`📞 Hanging up call: ${callId}`);

      await axios.delete(
        `${this.baseUrl}/call/${callId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      // Update database
      await supabase
        .from('vapi_calls')
        .update({
          status: 'ended_by_user',
          updated_at: new Date().toISOString()
        })
        .eq('call_id', callId);

      console.log('✅ Call ended successfully:', callId);

      return {
        success: true,
        message: 'Call ended successfully'
      };
    } catch (error: any) {
      console.error('Error hanging up call:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        message: 'Failed to end call'
      };
    }
  }

  // Handle Vapi webhooks
  async handleWebhook(webhookData: any): Promise<void> {
    try {
      console.log('📞 Vapi webhook received:', webhookData.type);

      const { call, type } = webhookData;

      // Enhanced logging for call type detection
      if (call) {
        const callType = call.type || 'unknown';
        const callId = call.id || 'unknown';
        console.log(`🔍 Processing ${callType} call: ${callId}`);
      }

      // Update call status in database
      if (call?.id) {
        await supabase
          .from('vapi_calls')
          .update({
            status: type,
            updated_at: new Date().toISOString(),
            webhook_data: webhookData
          })
          .eq('call_id', call.id);
      }

      // Handle different webhook types
      switch (type) {
        case 'call-start':
          console.log('📞 Call started:', call.id);
          break;

        case 'call-end':
          console.log('📞 Call ended:', call.id);
          await this.processCallEnd(call);
          break;

        case 'transcript':
          console.log('📝 Transcript:', webhookData.transcript);
          await this.processTranscript(call, webhookData.transcript);
          break;

        case 'end-of-call-report':
          console.log('📊 End of call report received for call:', webhookData.message?.call?.id);
          await this.processEndOfCallReport(webhookData.message);
          break;

        case 'function-call':
          console.log('⚡ Function call:', webhookData.functionCall);
          await this.handleFunctionCall(webhookData.functionCall, call);
          break;

        default:
          console.log('📨 Other webhook:', type);
      }

    } catch (error) {
      console.error('Error handling webhook:', error);
    }
  }

  // Handle function calls from AI during conversation
  async handleFunctionCall(functionCall: any, call: any): Promise<void> {
    try {
      const { name, parameters } = functionCall;

      console.log(`🔧 Processing function call: ${name}`, parameters);

      switch (name) {
        case 'schedule_appointment':
          await this.scheduleAppointmentFromCall(parameters, call);
          break;

        default:
          console.log(`⚠️ Unknown function call: ${name}`);
      }
    } catch (error) {
      console.error('Error handling function call:', error);
    }
  }

  // Schedule appointment from AI call
  async scheduleAppointmentFromCall(params: any, call: any): Promise<void> {
    try {
      console.log('📅 Scheduling appointment from AI call:', params);

      // Parse the natural language date/time using our AI endpoint
      const aiParseResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:4000'}/api/ai/schedule-appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: `Schedule ${params.appointmentType} with ${params.customerName} on ${params.preferredDate} at ${params.preferredTime}`,
          teamId: call.assistant?.metadata?.teamId || 'default-team',
          projects: [], // Would normally fetch from database
          currentDate: new Date().toISOString()
        })
      });

      if (!aiParseResponse.ok) {
        throw new Error('Failed to parse appointment details with AI');
      }

      const aiParsedData = await aiParseResponse.json();

      if (!aiParsedData.success) {
        throw new Error(aiParsedData.error || 'AI parsing failed');
      }

      const appointmentData = aiParsedData.appointment;

      // Create the appointment in the database
      const appointmentResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:4000'}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: call.assistant?.metadata?.teamId || 'default-team',
          title: appointmentData.title || `${params.appointmentType} with ${params.customerName}`,
          type: params.appointmentType,
          scheduledAt: `${appointmentData.date}T${appointmentData.time}:00`,
          durationMinutes: 60,
          attendeeName: params.customerName,
          attendeePhone: params.customerPhone || call.customer?.number,
          locationAddress: params.projectAddress,
          workType: params.appointmentType === 'site_visit' ? 'outdoor' : 'indoor',
          notes: `Scheduled during AI call. ${params.notes || ''}`,
          source: 'ai_call',
          createdByAi: true,
          aiCallId: call.id
        })
      });

      const appointmentResult = await appointmentResponse.json();

      if (appointmentResult.success) {
        console.log('✅ Appointment scheduled successfully:', appointmentResult.data.id);

        // Store the appointment reference in the call record
        await supabase
          .from('vapi_calls')
          .update({
            appointment_scheduled: true,
            appointment_id: appointmentResult.data.id,
            appointment_details: {
              type: params.appointmentType,
              customer: params.customerName,
              scheduled_for: `${appointmentData.date}T${appointmentData.time}:00`
            }
          })
          .eq('call_id', call.id);

      } else {
        console.error('❌ Failed to schedule appointment:', appointmentResult.error);
      }

    } catch (error) {
      console.error('Error scheduling appointment from call:', error);

      // Log the failed attempt
      await supabase
        .from('vapi_calls')
        .update({
          appointment_scheduled: false,
          appointment_error: error.message,
          attempted_scheduling: true
        })
        .eq('call_id', call.id);
    }
  }

  // Process real-time transcript data
  private async processTranscript(call: any, transcriptData: any): Promise<void> {
    try {
      console.log('🎙️ Processing live transcript for call:', call.id);

      // Store transcript segment in database
      await supabase.from('call_transcripts').insert({
        call_id: call.id,
        speaker: transcriptData.role || 'unknown', // 'assistant' or 'user'
        text: transcriptData.text || transcriptData.transcript,
        spoken_at: new Date().toISOString(),
        confidence: transcriptData.confidence || null,
        start_time: transcriptData.start_time || null,
        end_time: transcriptData.end_time || null,
        is_final: transcriptData.is_final || true
      });

      console.log('✅ Transcript segment saved:', {
        callId: call.id,
        speaker: transcriptData.role,
        text: transcriptData.text?.substring(0, 50) + '...'
      });

    } catch (error) {
      console.error('Error processing transcript:', error);
    }
  }

  // Process call completion
  private async processCallEnd(call: any): Promise<void> {
    try {
      // Get call details including analysis
      const callDetails = await this.getCallStatus(call.id);
      
      if (callDetails) {
        // Save final call data
        await supabase
          .from('vapi_calls')
          .update({
            status: 'completed',
            duration: (callDetails as any).duration || 0,
            analysis: (callDetails as any).analysis,
            transcript: (callDetails as any).transcript,
            recording_url: (callDetails as any).recordingUrl,
            completed_at: new Date().toISOString()
          })
          .eq('call_id', call.id);

        console.log('✅ Call processing completed:', call.id);
      }
    } catch (error) {
      console.error('Error processing call end:', error);
    }
  }

  // Generate first message based on briefing
  private generateFirstMessage(params: VapiCallParams): string {
    const baseMessage = `Hi, I'm calling from ${params.builderName}'s office at ${params.companyName}.`;

    if (!params.briefing?.objective) {
      return `${baseMessage} We're starting a major project at ${params.projectDetails?.address || 'a prime location'} and ${params.builderName} asked me to reach out to top contractors in the area. Is this a good time to discuss the project?`;
    }

    const objectiveMessages = {
      'site_visit': `${baseMessage} ${params.builderName} would like to schedule a site visit for a project at ${params.projectDetails?.address || 'a prime location'}. When would be a good time for you to take a look?`,
      'get_quote': `${baseMessage} We have a project at ${params.projectDetails?.address || 'a prime location'} and need a quote for ${params.projectDetails?.type || 'construction work'}. Could you provide an estimate?`,
      'check_availability': `${baseMessage} We're planning a project at ${params.projectDetails?.address || 'a prime location'} and wanted to check your availability. Are you taking on new projects?`,
      'gauge_interest': `${baseMessage} We have an interesting project opportunity at ${params.projectDetails?.address || 'a prime location'} and wanted to see if this might be something you'd be interested in.`,
      'schedule_work': `${baseMessage} We're ready to move forward with our project at ${params.projectDetails?.address || 'a prime location'} and would like to schedule the work. What's your timeline looking like?`,
      'check_progress': `${baseMessage} I'm calling to check on the progress of the work at ${params.projectDetails?.address || 'the project site'}. How are things coming along?`,
      'discuss_changes': `${baseMessage} ${params.builderName} wanted to discuss some potential changes to the project at ${params.projectDetails?.address || 'the site'}. Do you have a few minutes to talk?`,
      'coordinate_delivery': `${baseMessage} We need to coordinate material delivery for the project at ${params.projectDetails?.address || 'the site'}. What works best for your schedule?`
    };

    return objectiveMessages[params.briefing.objective as keyof typeof objectiveMessages] || `${baseMessage} We're starting a major project at ${params.projectDetails?.address || 'a prime location'} and ${params.builderName} asked me to reach out. Is this a good time to discuss the project?`;
  }

  // Get objective description for system prompt
  private getObjectiveDescription(objective?: string): string {
    const descriptions = {
      'site_visit': 'Schedule a site visit for the vendor to assess the project requirements',
      'get_quote': 'Obtain a detailed quote for the required construction work',
      'check_availability': 'Determine if the vendor has availability for upcoming project work',
      'gauge_interest': 'Assess the vendor\'s interest in participating in this project opportunity',
      'schedule_work': 'Schedule and coordinate when the vendor can begin or continue work',
      'check_progress': 'Follow up on current work progress and address any issues',
      'discuss_changes': 'Discuss modifications or changes to the existing project scope',
      'coordinate_delivery': 'Arrange material delivery schedules and logistics'
    };
    return descriptions[objective as keyof typeof descriptions] || 'Discuss general project opportunities and requirements';
  }

  // Get approach description for system prompt
  private getApproachDescription(approach?: string): string {
    const descriptions = {
      'professional': 'Maintain a formal, business-focused tone throughout the conversation',
      'friendly': 'Use a warm, personable approach to build rapport and trust',
      'direct': 'Be straightforward and get to the point quickly without extensive pleasantries',
      'consultative': 'Ask thoughtful questions and provide expert guidance and recommendations',
      'urgent': 'Convey time sensitivity and the need for quick decisions or responses',
      'relationship': 'Focus on long-term partnership building and ongoing collaboration',
      'detail_oriented': 'Thoroughly discuss specifications, requirements, and project details'
    };
    return descriptions[approach as keyof typeof descriptions] || 'Use a balanced, professional approach';
  }

  // List recent calls
  async listCalls(limit: number = 10): Promise<VapiCall[]> {
    try {
      const response: AxiosResponse<VapiCall[]> = await axios.get(
        `${this.baseUrl}/call?limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error listing calls:', error.response?.data || error.message);
      return [];
    }
  }

  // Process end-of-call report and extract transcript data
  private async processEndOfCallReport(reportData: any): Promise<void> {
    try {
      console.log('🎬 Processing end-of-call report...');

      const { call, messages, transcript } = reportData;
      const callId = call?.id;

      if (!callId) {
        console.error('❌ No call ID found in report');
        return;
      }

      console.log(`📞 Processing transcript for call ${callId} with ${messages?.length || 0} messages`);

      // Process individual messages if available
      if (messages && Array.isArray(messages)) {
        for (const message of messages) {
          // Skip system messages
          if (message.role === 'system') continue;

          try {
            const transcriptData = {
              call_id: callId,
              speaker: message.role === 'bot' ? 'AI' : 'User',
              text: message.message || message.content || '',
              spoken_at: new Date(message.time || Date.now()).toISOString(),
              confidence: null,
              start_time: message.secondsFromStart || null,
              end_time: message.secondsFromStart ? (message.secondsFromStart + (message.duration / 1000)) : null,
              is_final: true
            };

            // Store in database
            const { error } = await supabase
              .from('call_transcripts')
              .insert(transcriptData);

            if (error) {
              console.error('❌ Error storing transcript:', error);
            } else {
              console.log(`✅ Stored transcript: ${transcriptData.speaker}: "${transcriptData.text.substring(0, 50)}..."`);
            }

          } catch (messageError) {
            console.error('❌ Error processing message:', messageError);
          }
        }
      }

      // Also store the full transcript as a single record
      if (transcript) {
        try {
          const fullTranscriptData = {
            call_id: callId,
            speaker: 'FULL_TRANSCRIPT',
            text: transcript,
            spoken_at: new Date().toISOString(),
            confidence: null,
            start_time: null,
            end_time: null,
            is_final: true
          };

          const { error } = await supabase
            .from('call_transcripts')
            .insert(fullTranscriptData);

          if (error) {
            console.error('❌ Error storing full transcript:', error);
          } else {
            console.log('✅ Stored full transcript summary');
          }

        } catch (transcriptError) {
          console.error('❌ Error processing full transcript:', transcriptError);
        }
      }

      console.log(`🎉 Completed processing transcript for call ${callId}`);

    } catch (error) {
      console.error('❌ Error processing end-of-call report:', error);
    }
  }
}

export default new VapiAIService();