import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const VAPI_API_KEY = process.env.VAPI_API_KEY || '';
const VAPI_BASE_URL = 'https://api.vapi.ai';

interface VapiAssistant {
  id: string;
  name: string;
  firstMessage: string;
  model: any;
  voice: any;
  functions?: any[];
}

class VapiAssistantService {
  private apiKey: string;

  constructor() {
    this.apiKey = VAPI_API_KEY;
  }

  /**
   * Create a new VAPI assistant for a company
   */
  async createCompanyAssistant(companyName: string, teamId: string): Promise<VapiAssistant> {
    try {
      console.log(`🤖 Creating VAPI assistant for ${companyName}`);

      // Fetch team members for transfer destinations
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('name, phone_number, department')
        .eq('team_id', teamId)
        .not('phone_number', 'is', null);

      const transferDestinations = (teamMembers || [])
        .filter((m: any) => m.phone_number && m.phone_number.trim())
        .map((m: any) => ({
          type: 'number',
          number: m.phone_number,
          description: `${m.name} - ${m.department}`
        }));

      const assistantConfig = {
        name: `${companyName} Receptionist`,
        firstMessage: `Good ${this.getTimeOfDay()}, ${companyName}. How may I assist you today?`,
        model: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `You are a receptionist for ${companyName}.

When someone wants to schedule an appointment:
1. Collect: their name, phone number, preferred date/time, type of service (site visit/inspection/consultation/meeting), and address if needed
2. Confirm the details back to them: "Perfect! I have you scheduled for [DATE] at [TIME] for [SERVICE TYPE]. We'll send you a confirmation text shortly."
3. Ask if there's anything else you can help with

For transfers: Use the transferCall tool to connect them to team members.

Be friendly and professional.`
            }
          ],
          tools: transferDestinations.length > 0 ? [
            {
              type: 'transferCall',
              destinations: transferDestinations
            }
          ] : []
        },
        voice: {
          provider: '11labs',
          voiceId: 'OYTbf65OHHFELVut7v2H', // Hope voice as default
          model: 'eleven_turbo_v2',
          stability: 0.5,
          similarityBoost: 0.75
        },
        endCallFunctionEnabled: true,
        dialKeypadFunctionEnabled: true,
        maxDurationSeconds: 600,
        silenceTimeoutSeconds: 30,
        responseDelaySeconds: 0.5,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        serverUrl: `${process.env.API_BASE_URL || 'https://homequest-api-1.onrender.com'}/api/vapi-webhooks/vapi/webhooks/end-of-call`
      };

      const response = await axios.post(
        `${VAPI_BASE_URL}/assistant`,
        assistantConfig,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const assistant = response.data;
      console.log(`✅ Created VAPI assistant: ${assistant.id} for ${companyName}`);

      // Save assistant ID to database
      const { error } = await supabase
        .from('teams')
        .update({ 
          vapi_assistant_id: assistant.id,
          vapi_assistant_name: assistant.name 
        })
        .eq('id', teamId);

      if (error) {
        console.error('Error saving assistant ID:', error);
      }

      return assistant;
    } catch (error: any) {
      console.error('Error creating VAPI assistant:', error.response?.data || error);
      throw new Error(`Failed to create VAPI assistant: ${error.message}`);
    }
  }

  /**
   * Update an existing VAPI assistant
   */
  async updateAssistant(assistantId: string, updates: Partial<VapiAssistant>): Promise<VapiAssistant> {
    try {
      const response = await axios.patch(
        `${VAPI_BASE_URL}/assistant/${assistantId}`,
        updates,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error updating VAPI assistant:', error.response?.data || error);
      throw new Error(`Failed to update VAPI assistant: ${error.message}`);
    }
  }

  /**
   * Delete a VAPI assistant
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    try {
      await axios.delete(
        `${VAPI_BASE_URL}/assistant/${assistantId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      console.log(`🗑️ Deleted VAPI assistant: ${assistantId}`);
    } catch (error: any) {
      console.error('Error deleting VAPI assistant:', error.response?.data || error);
      throw new Error(`Failed to delete VAPI assistant: ${error.message}`);
    }
  }

  /**
   * Get an assistant by ID
   */
  async getAssistant(assistantId: string): Promise<VapiAssistant> {
    try {
      const response = await axios.get(
        `${VAPI_BASE_URL}/assistant/${assistantId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error fetching VAPI assistant:', error.response?.data || error);
      throw new Error(`Failed to fetch VAPI assistant: ${error.message}`);
    }
  }

  /**
   * List all assistants
   */
  async listAssistants(): Promise<VapiAssistant[]> {
    try {
      const response = await axios.get(
        `${VAPI_BASE_URL}/assistant`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error listing VAPI assistants:', error.response?.data || error);
      throw new Error(`Failed to list VAPI assistants: ${error.message}`);
    }
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
}

export default new VapiAssistantService();