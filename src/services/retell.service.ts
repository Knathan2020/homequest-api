/**
 * Retell.ai Service - Natural sounding voice AI for sales calls
 * Better conversation flow than Vapi, more natural than Bland
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Retell Configuration
const RETELL_API_KEY = process.env.RETELL_API_KEY || '';
const RETELL_BASE_URL = 'https://api.retellai.com';

interface RetellCallParams {
  to: string;
  vendorName: string;
  vendorCompany: string;
  projectDetails: any;
  builderName: string;
  companyName: string;
  teamId?: string;
  agentId?: string; // Use existing agent or create new
}

class RetellAIService {
  private apiKey: string;

  constructor() {
    this.apiKey = RETELL_API_KEY;
  }

  // Create agent for the call
  private async createAgent(params: RetellCallParams) {
    const prompt = `You are ${params.builderName} from ${params.companyName}, a construction project manager who genuinely needs subcontractor services.

CRITICAL INSTRUCTIONS:
- Sound naturally tired but friendly, like you've been making calls all day
- Use casual language: "Hey", "Look", "Honestly", "Between you and me"
- Add natural hesitations: "So, um...", "Let me think...", "Actually, wait..."
- Breathe audibly between sentences
- If they sound suspicious: "Yeah I know, everyone thinks this is AI now, but I'm actually calling because we need help"

PROJECT DETAILS:
- Location: ${params.projectDetails.address}
- Type: ${params.projectDetails.type}
- Budget: ${params.projectDetails.budget}
- Timeline: ${params.projectDetails.timeline}

YOUR GOALS:
1. Build genuine rapport - you actually need their help
2. Mention you heard good things about their work
3. Ask about their availability
4. If interested, schedule a site visit
5. Get their email for project details

Keep it conversational and authentic. You're hiring, not selling.`;

    try {
      const response = await axios.post(
        `${RETELL_BASE_URL}/create-agent`,
        {
          agent_name: `${params.builderName} - Construction PM`,
          voice_id: 'eleven_labs_rachel', // Natural female voice, change as needed
          language: 'en-US',
          llm_websocket_url: `wss://api.retellai.com/llm-websocket/${this.apiKey}`,
          agent_prompt: prompt,
          boosted_keywords: [params.vendorCompany, params.projectDetails.type],
          reminder_trigger_ms: 10000,
          reminder_prompt: 'Ask if they have any questions about the project',
          enable_backchannel: true, // Natural "uh-huh", "right", "got it"
          backchannel_frequency: 0.8,
          end_call_after_silence_ms: 10000,
          max_call_duration_ms: 300000 // 5 minutes max
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.agent_id;
    } catch (error: any) {
      console.error('Error creating agent:', error.response?.data || error);
      throw error;
    }
  }

  // Initiate outbound call
  async initiateCall(params: RetellCallParams) {
    try {
      console.log('📞 Initiating Retell.ai call to', params.vendorName);

      // Create or use existing agent
      const agentId = params.agentId || await this.createAgent(params);

      // Make the call
      const response = await axios.post(
        `${RETELL_BASE_URL}/create-phone-call`,
        {
          agent_id: agentId,
          to_number: params.to,
          from_number: process.env.TWILIO_PHONE_NUMBER || '+16783253060',
          metadata: {
            vendor_name: params.vendorName,
            vendor_company: params.vendorCompany,
            team_id: params.teamId,
            project_address: params.projectDetails.address
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const call = response.data;
      console.log('✅ Retell call initiated:', call.call_id);

      // Save to database
      try {
        await supabase.from('retell_calls').insert({
          call_id: call.call_id,
          agent_id: agentId,
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
        console.error('Error saving to database:', dbError);
      }

      return {
        success: true,
        callId: call.call_id,
        agentId: agentId,
        message: '📞 Retell.ai call initiated with natural conversation!'
      };

    } catch (error: any) {
      console.error('Error initiating Retell call:', error.response?.data || error);
      
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        message: 'Failed to initiate call'
      };
    }
  }

  // Get call details
  async getCall(callId: string) {
    try {
      const response = await axios.get(
        `${RETELL_BASE_URL}/get-call/${callId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error fetching call:', error);
      return null;
    }
  }

  // List available voices
  getAvailableVoices() {
    return [
      { id: 'eleven_labs_rachel', name: 'Rachel', description: 'Natural female voice' },
      { id: 'eleven_labs_josh', name: 'Josh', description: 'Friendly male voice' },
      { id: 'eleven_labs_matt', name: 'Matt', description: 'Professional male voice' },
      { id: 'openai_alloy', name: 'Alloy', description: 'Neutral voice' },
      { id: 'openai_nova', name: 'Nova', description: 'Energetic female' },
      { id: 'deepgram_nova', name: 'Nova DG', description: 'Clear neutral voice' }
    ];
  }

  // Handle webhooks
  async handleWebhook(webhookData: any) {
    const { event_type, call } = webhookData;

    console.log('🔔 Retell webhook:', event_type);

    try {
      // Update call status in database
      if (call?.call_id) {
        await supabase
          .from('retell_calls')
          .update({
            status: event_type,
            duration: call.duration_ms,
            transcript: call.transcript,
            recording_url: call.recording_url,
            analysis: call.call_analysis,
            updated_at: new Date().toISOString()
          })
          .eq('call_id', call.call_id);
      }

      // Handle different events
      switch (event_type) {
        case 'call_started':
          console.log('📞 Call started:', call.call_id);
          break;
        
        case 'call_ended':
          console.log('📞 Call ended:', call.call_id);
          console.log('Duration:', call.duration_ms / 1000, 'seconds');
          break;
        
        case 'call_analyzed':
          console.log('📊 Call analysis ready:', call.call_analysis);
          break;
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
    }
  }
}

export default new RetellAIService();