/**
 * AI Receptionist Service
 * Intelligent call routing with transfer capabilities
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  phoneNumber: string;
  email: string;
  availability: 'available' | 'busy' | 'offline';
  expertise: string[];
}

interface TransferRules {
  keywords: string[];
  department: string;
  urgencyLevel: number;
}

class AIReceptionistService {
  private vapiApiKey: string;
  
  constructor() {
    this.vapiApiKey = process.env.VAPI_API_KEY || '';
  }

  /**
   * Create AI receptionist assistant for team
   */
  async createTeamReceptionist(teamId: string, teamName: string) {
    try {
      // Get team members
      const teamMembers = await this.getTeamMembers(teamId);
      
      // Create Vapi assistant with transfer capabilities
      const assistant = {
        name: `${teamName} AI Receptionist`,
        model: {
          provider: "openai",
          model: "gpt-4",
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: this.buildReceptionistPrompt(teamName, teamMembers)
            }
          ]
        },
        voice: {
          provider: "11labs",
          voiceId: "ewxUvnyvvOehYjKjUVKC", // Your custom voice
          stability: 0.5,
          similarityBoost: 0.75
        },
        functions: [
          {
            name: "transferCall",
            description: "Transfer call to team member",
            parameters: {
              type: "object",
              properties: {
                department: { type: "string" },
                memberName: { type: "string" },
                reason: { type: "string" }
              }
            }
          },
          {
            name: "takeMessage",
            description: "Take a message for team member",
            parameters: {
              type: "object",
              properties: {
                for: { type: "string" },
                from: { type: "string" },
                phone: { type: "string" },
                message: { type: "string" },
                urgent: { type: "boolean" }
              }
            }
          },
          {
            name: "scheduleCallback",
            description: "Schedule a callback",
            parameters: {
              type: "object",
              properties: {
                callerName: { type: "string" },
                callerPhone: { type: "string" },
                preferredTime: { type: "string" },
                topic: { type: "string" }
              }
            }
          }
        ],
        transferList: this.buildTransferList(teamMembers),
        endCallPhrases: ["goodbye", "bye", "talk to you later", "thank you"],
        voicemailDetectionEnabled: true,
        backgroundDenoising: true
      };

      // Create assistant in Vapi
      const response = await axios.post(
        'https://api.vapi.ai/assistant',
        assistant,
        {
          headers: {
            'Authorization': `Bearer ${this.vapiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;

    } catch (error: any) {
      console.error('Error creating receptionist:', error);
      throw error;
    }
  }

  /**
   * Build receptionist system prompt
   */
  private buildReceptionistPrompt(teamName: string, members: TeamMember[]): string {
    const departmentList = [...new Set(members.map(m => m.department))].join(', ');
    
    return `You are the AI receptionist for ${teamName}. Your role is to:

1. ANSWER QUESTIONS about the company, services, and projects
2. PROVIDE INFORMATION about pricing, timelines, and availability
3. SCHEDULE appointments and callbacks
4. TRANSFER CALLS only when necessary

TEAM STRUCTURE:
${members.map(m => `- ${m.name}: ${m.role} (${m.department})`).join('\n')}

DEPARTMENTS: ${departmentList}

TRANSFER RULES:
- Only transfer if you cannot answer the question
- Only transfer if caller specifically requests a person/department
- Always try to help first before transferring
- If transferring, explain why and to whom

COMMON QUESTIONS YOU CAN ANSWER:
- Project status and timelines
- General pricing and estimates
- Company services and capabilities
- Scheduling consultations
- Business hours and location
- Basic technical questions

WHEN TO TRANSFER:
- Billing issues → Billing Department
- Technical emergencies → Project Manager
- Legal matters → Owner/Manager
- Complex project details → Project Manager
- Complaints → Customer Service Manager

PROFESSIONAL TONE:
- Be friendly but professional
- Sound human and natural
- Use the caller's name when known
- Offer to take messages if person unavailable
- Thank them for calling ${teamName}

If you need to transfer, say: "I'll connect you with [name] in our [department]. One moment please."
If unavailable, say: "They're not available right now, but I can take a detailed message or schedule a callback."`;
  }

  /**
   * Build transfer list for Vapi
   */
  private buildTransferList(members: TeamMember[]) {
    return members.map(member => ({
      name: member.name,
      number: member.phoneNumber,
      department: member.department,
      role: member.role,
      transferMessage: `Transferring you to ${member.name}, our ${member.role}. Please hold.`
    }));
  }

  /**
   * Get team members from database
   */
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('department', { ascending: true });

    if (error) {
      console.error('Error fetching team members:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Add or update team member
   */
  async upsertTeamMember(member: Partial<TeamMember> & { teamId: string }) {
    const { error } = await supabase
      .from('team_members')
      .upsert({
        team_id: member.teamId,
        name: member.name,
        role: member.role,
        department: member.department,
        phone_number: member.phoneNumber,
        email: member.email,
        availability: member.availability || 'available',
        expertise: member.expertise || [],
        updated_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }

    // Update the Vapi assistant with new transfer list
    if (member.teamId) {
      await this.updateAssistantTransferList(member.teamId);
    }

    return { success: true };
  }

  /**
   * Update assistant's transfer list when team changes
   */
  private async updateAssistantTransferList(teamId: string) {
    try {
      const members = await this.getTeamMembers(teamId);
      const transferList = this.buildTransferList(members);

      // Get team's assistant ID
      const { data: teamPhone } = await supabase
        .from('team_phones')
        .select('vapi_assistant_id')
        .eq('team_id', teamId)
        .single();

      if (teamPhone?.vapi_assistant_id) {
        // Update assistant in Vapi
        await axios.patch(
          `https://api.vapi.ai/assistant/${teamPhone.vapi_assistant_id}`,
          { transferList },
          {
            headers: {
              'Authorization': `Bearer ${this.vapiApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }
    } catch (error) {
      console.error('Error updating transfer list:', error);
    }
  }

  /**
   * Handle transfer request from Vapi webhook
   */
  async handleTransferRequest(callId: string, transferData: any) {
    try {
      const { department, memberName, reason } = transferData;

      // Log transfer request
      await supabase.from('call_transfers').insert({
        call_id: callId,
        to_department: department,
        to_member: memberName,
        reason: reason,
        transferred_at: new Date().toISOString()
      });

      // Get member's phone number
      const { data: member } = await supabase
        .from('team_members')
        .select('phone_number')
        .eq('name', memberName)
        .single();

      if (member) {
        // Return transfer instructions to Vapi
        return {
          action: 'transfer',
          number: member.phone_number,
          whisperMessage: `Call from AI receptionist: ${reason}`
        };
      } else {
        return {
          action: 'continue',
          message: `I'm sorry, ${memberName} is not available right now. Can I take a message?`
        };
      }

    } catch (error) {
      console.error('Transfer error:', error);
      return {
        action: 'continue',
        message: "I apologize, I'm having trouble transferring your call. Can I take a message instead?"
      };
    }
  }

  /**
   * Get transfer analytics
   */
  async getTransferAnalytics(teamId: string, period: string = '7d') {
    const startDate = this.getStartDate(period);
    
    const { data, error } = await supabase
      .from('call_transfers')
      .select('to_department, to_member, reason')
      .eq('team_id', teamId)
      .gte('transferred_at', startDate.toISOString());

    if (error) {
      return null;
    }

    // Analyze transfer patterns
    const analytics = {
      totalTransfers: data.length,
      byDepartment: this.groupBy(data, 'to_department'),
      byMember: this.groupBy(data, 'to_member'),
      commonReasons: this.analyzeReasons(data.map(d => d.reason))
    };

    return analytics;
  }

  private getStartDate(period: string): Date {
    const now = new Date();
    const days = parseInt(period) || 7;
    return new Date(now.setDate(now.getDate() - days));
  }

  private groupBy(data: any[], key: string) {
    return data.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});
  }

  private analyzeReasons(reasons: string[]) {
    const keywords: Record<string, number> = {};
    reasons.forEach(reason => {
      const words = reason.toLowerCase().split(' ');
      words.forEach(word => {
        if (word.length > 4) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    });
    
    return Object.entries(keywords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
  }
}

export default new AIReceptionistService();