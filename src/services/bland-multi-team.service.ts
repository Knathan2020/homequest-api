/**
 * Bland.ai Multi-Team Service
 * Each team can select their own voice and have their own phone number
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface TeamVoiceConfig {
  teamId: string;
  voicePreference: string; // matt, sarah, dave, emma, etc.
  phoneNumber?: string; // Team's phone number
  script?: string; // Custom script
  companyName: string;
}

interface BlandCallRequest {
  to: string;
  from?: string;
  teamId: string;
  vendorName: string;
  vendorCompany: string;
  projectDetails: any;
}

class BlandMultiTeamService {
  private async getTeamConfig(teamId: string): Promise<TeamVoiceConfig | null> {
    // Fetch team's voice preferences from database
    const { data, error } = await supabase
      .from('team_voice_settings')
      .select('*')
      .eq('team_id', teamId)
      .single();
    
    if (error || !data) {
      // Default configuration
      return {
        teamId,
        voicePreference: 'matt',
        phoneNumber: undefined,
        companyName: 'Construction Company'
      };
    }
    
    return data;
  }

  async initiateCall(params: BlandCallRequest) {
    try {
      // Get team's voice configuration
      const teamConfig = await getTeamConfig(params.teamId);
      
      if (!teamConfig) {
        throw new Error('Team configuration not found');
      }

      // Build the task/script based on team preferences
      const task = teamConfig.script || `
        You are calling ${params.vendorName} from ${params.vendorCompany}.
        You work for ${teamConfig.companyName}.
        
        Your goal:
        1. Introduce yourself naturally
        2. Mention the project at ${params.projectDetails.address}
        3. Ask if they're available for the work
        4. Schedule a meeting if interested
        
        Be conversational, add natural pauses, sound genuinely human.
        Don't sound like a robot or salesperson.
      `;

      const response = await axios.post(
        'https://api.bland.ai/v1/calls',
        {
          phone_number: params.to,
          from: params.from || teamConfig.phoneNumber,
          task: task,
          voice: teamConfig.voicePreference,
          model: 'enhanced', // Best quality
          language: 'eng',
          voice_settings: {
            speed: 0.95, // Slightly slower for natural speech
            stability: 0.8
          },
          max_duration: 10,
          record: true,
          webhook: `${process.env.WEBHOOK_BASE_URL}/api/bland/webhook/${params.teamId}`
        },
        {
          headers: {
            'Authorization': process.env.BLAND_API_KEY || '',
            'Content-Type': 'application/json'
          }
        }
      );

      // Save call record to database
      await supabase.from('bland_calls').insert({
        call_id: response.data.call_id,
        team_id: params.teamId,
        vendor_name: params.vendorName,
        vendor_company: params.vendorCompany,
        vendor_phone: params.to,
        project_details: params.projectDetails,
        voice_used: teamConfig.voicePreference,
        status: 'initiated',
        created_at: new Date().toISOString()
      });

      return {
        success: true,
        callId: response.data.call_id,
        voice: teamConfig.voicePreference,
        message: `Call initiated with ${teamConfig.voicePreference} voice`
      };

    } catch (error: any) {
      console.error('Bland.ai error:', error.response?.data || error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Allow teams to update their voice preference
  async updateTeamVoice(teamId: string, voice: string) {
    const { error } = await supabase
      .from('team_voice_settings')
      .upsert({
        team_id: teamId,
        voice_preference: voice,
        updated_at: new Date().toISOString()
      });
    
    return !error;
  }

  // Get available voices
  getAvailableVoices() {
    return [
      { id: 'matt', name: 'Matt', gender: 'male', description: 'Natural, friendly male voice' },
      { id: 'sarah', name: 'Sarah', gender: 'female', description: 'Professional female voice' },
      { id: 'dave', name: 'Dave', gender: 'male', description: 'Deep, authoritative male voice' },
      { id: 'emma', name: 'Emma', gender: 'female', description: 'Warm, approachable female voice' },
      { id: 'michael', name: 'Michael', gender: 'male', description: 'Casual, conversational male voice' },
      { id: 'jessica', name: 'Jessica', gender: 'female', description: 'Energetic female voice' }
    ];
  }
}

export default new BlandMultiTeamService();