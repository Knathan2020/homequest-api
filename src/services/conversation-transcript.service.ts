/**
 * Conversation Transcript Service
 * Manages AI conversation transcripts and analytics
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export interface ConversationMessage {
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: string;
  speaker_name?: string; // e.g., "AI (as John)", "Mike"
}

export interface ConversationTranscript {
  id?: string;
  session_id: string;
  call_sid: string;
  team_id: string;
  vendor_name: string;
  vendor_company: string;
  vendor_phone: string;
  builder_name: string;
  company_name: string;
  project_details: any;
  messages: ConversationMessage[];
  call_duration: number; // in seconds
  call_status: 'in_progress' | 'successful' | 'failed' | 'follow_up_needed';
  result_summary?: string;
  scheduled_meeting?: {
    date: string;
    time: string;
    location: string;
  };
  ai_score?: number; // 1-10
  success_metrics?: {
    engagement_level: number;
    interest_shown: boolean;
    commitment_made: boolean;
    objections_handled: number;
  };
  created_at: string;
  ended_at?: string;
}

class ConversationTranscriptService {
  private activeTranscripts = new Map<string, ConversationTranscript>();
  private storedTranscripts: ConversationTranscript[] = []; // In-memory fallback storage

  constructor() {
    // Add demo conversation for testing
    this.storedTranscripts.push({
      id: 'demo-1',
      session_id: 'demo-session-1',
      call_sid: 'CA' + Math.random().toString(36).substring(2, 15),
      team_id: '11111111-1111-1111-1111-111111111111',
      vendor_name: 'John Smith',
      vendor_company: 'ABC Plumbing',
      vendor_phone: '+14045551234',
      builder_name: 'Demo User',
      company_name: 'HomeQuest Premium',
      project_details: {
        address: '123 Luxury Lane',
        type: 'Custom Home',
        budget: '$2.5M',
        timeline: '6 months'
      },
      messages: [
        { role: 'assistant', content: 'Hello John! This is Sarah from HomeQuest Premium. I\'m calling about our luxury custom home project at 123 Luxury Lane.', timestamp: new Date(Date.now() - 180000).toISOString() },
        { role: 'user', content: 'Oh hi Sarah! Yes, I\'d love to hear more about that project.', timestamp: new Date(Date.now() - 170000).toISOString() },
        { role: 'assistant', content: 'Great! It\'s a $2.5 million custom home and we need top-quality plumbing work. Are you available this week to discuss?', timestamp: new Date(Date.now() - 160000).toISOString() },
        { role: 'user', content: 'Absolutely! That sounds like a fantastic opportunity. I can meet Thursday afternoon.', timestamp: new Date(Date.now() - 150000).toISOString() },
        { role: 'assistant', content: 'Perfect! Let\'s schedule for Thursday at 2 PM at the project site. I\'ll send you the details.', timestamp: new Date(Date.now() - 140000).toISOString() },
        { role: 'user', content: 'Sounds great! I\'ll see you Thursday at 2. Thanks for reaching out!', timestamp: new Date(Date.now() - 130000).toISOString() }
      ],
      call_duration: 120,
      call_status: 'successful',
      result_summary: 'Successfully scheduled meeting with vendor for Thursday at 2 PM',
      scheduled_meeting: {
        date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        time: '2:00 PM',
        location: '123 Luxury Lane'
      },
      ai_score: 9,
      success_metrics: {
        engagement_level: 0.9,
        interest_shown: true,
        commitment_made: true,
        objections_handled: 0
      },
      created_at: new Date(Date.now() - 180000).toISOString(),
      ended_at: new Date(Date.now() - 60000).toISOString()
    });
  }

  /**
   * Start a new conversation transcript
   */
  async startTranscript(params: {
    sessionId: string;
    callSid: string;
    teamId: string;
    vendorName: string;
    vendorCompany: string;
    vendorPhone: string;
    builderName: string;
    companyName: string;
    projectDetails: any;
  }): Promise<ConversationTranscript> {
    const transcript: ConversationTranscript = {
      session_id: params.sessionId,
      call_sid: params.callSid,
      team_id: params.teamId,
      vendor_name: params.vendorName,
      vendor_company: params.vendorCompany,
      vendor_phone: params.vendorPhone,
      builder_name: params.builderName,
      company_name: params.companyName,
      project_details: params.projectDetails,
      messages: [],
      call_duration: 0,
      call_status: 'in_progress',
      created_at: new Date().toISOString()
    };

    // Store in memory for real-time updates
    this.activeTranscripts.set(params.sessionId, transcript);

    // Save initial record to database
    const { data, error } = await supabase
      .from('conversation_transcripts')
      .insert([transcript])
      .select()
      .single();

    if (error) {
      console.error('Error creating transcript in Supabase:', error);
      // Fallback to in-memory storage
      transcript.id = `local-${Date.now()}`;
      this.storedTranscripts.push(transcript);
      return transcript;
    }

    transcript.id = data.id;
    return transcript;
  }

  /**
   * Add a message to the conversation
   */
  async addMessage(sessionId: string, message: ConversationMessage) {
    const transcript = this.activeTranscripts.get(sessionId);
    if (!transcript) {
      console.error('No active transcript for session:', sessionId);
      return;
    }

    // Add message with timestamp
    message.timestamp = new Date().toISOString();
    transcript.messages.push(message);

    // Update in database every 5 messages to reduce DB calls
    if (transcript.messages.length % 5 === 0 && transcript.id) {
      await this.updateTranscript(transcript.id, {
        messages: transcript.messages
      });
    }
  }

  /**
   * End a conversation and save final transcript
   */
  async endTranscript(sessionId: string, result: {
    status: 'successful' | 'failed' | 'follow_up_needed';
    duration: number;
    resultSummary?: string;
    scheduledMeeting?: any;
    aiScore?: number;
  }) {
    const transcript = this.activeTranscripts.get(sessionId);
    if (!transcript) {
      console.error('No active transcript for session:', sessionId);
      return;
    }

    // Update transcript with final data
    transcript.call_status = result.status;
    transcript.call_duration = result.duration;
    transcript.result_summary = result.resultSummary;
    transcript.scheduled_meeting = result.scheduledMeeting;
    transcript.ai_score = result.aiScore || this.calculateAIScore(transcript);
    transcript.ended_at = new Date().toISOString();
    transcript.success_metrics = this.calculateSuccessMetrics(transcript);

    // Save final transcript to database
    if (transcript.id) {
      await this.updateTranscript(transcript.id, transcript);
    } else {
      // Create if it doesn't exist
      const { data, error } = await supabase
        .from('conversation_transcripts')
        .insert([transcript])
        .select()
        .single();
      
      if (error) {
        console.error('Error saving transcript:', error);
      }
    }

    // Clean up memory
    this.activeTranscripts.delete(sessionId);

    return transcript;
  }

  /**
   * Update transcript in database
   */
  private async updateTranscript(id: string, updates: Partial<ConversationTranscript>) {
    const { error } = await supabase
      .from('conversation_transcripts')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating transcript:', error);
    }
  }

  /**
   * Calculate AI performance score
   */
  private calculateAIScore(transcript: ConversationTranscript): number {
    let score = 5; // Base score

    // Positive indicators
    if (transcript.call_status === 'successful') score += 2;
    if (transcript.scheduled_meeting) score += 1.5;
    if (transcript.messages.length > 10) score += 0.5; // Good engagement
    
    // Check for positive responses in messages
    const positiveWords = ['yes', 'great', 'interested', 'sounds good', 'perfect', 'excellent'];
    const vendorMessages = transcript.messages.filter(m => m.role === 'user');
    const positiveResponses = vendorMessages.filter(m => 
      positiveWords.some(word => m.content.toLowerCase().includes(word))
    ).length;
    score += (positiveResponses * 0.3);

    // Cap at 10
    return Math.min(10, Math.max(1, score));
  }

  /**
   * Calculate success metrics
   */
  private calculateSuccessMetrics(transcript: ConversationTranscript) {
    const vendorMessages = transcript.messages.filter(m => m.role === 'user');
    const totalMessages = transcript.messages.length;
    
    return {
      engagement_level: vendorMessages.length / Math.max(1, totalMessages / 2),
      interest_shown: vendorMessages.some(m => 
        m.content.toLowerCase().includes('interested') || 
        m.content.toLowerCase().includes('tell me more')
      ),
      commitment_made: !!transcript.scheduled_meeting,
      objections_handled: vendorMessages.filter(m => 
        m.content.includes('but') || 
        m.content.includes('however') || 
        m.content.includes('concern')
      ).length
    };
  }

  /**
   * Get recent transcripts for a team
   */
  async getRecentTranscripts(teamId: string, limit = 10): Promise<ConversationTranscript[]> {
    // Fetch from both conversation_transcripts (vendor AI calls) and call_transcripts (Vapi phone calls)
    const [conversationData, callData] = await Promise.all([
      supabase
        .from('conversation_transcripts')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(limit),

      // Fetch Vapi call transcripts
      supabase
        .from('call_transcripts')
        .select('call_id, speaker, text, spoken_at, phone_number, created_at, team_id')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(limit * 20) // Get more rows to group by call_id
    ]);

    const transcripts: ConversationTranscript[] = [];

    // Add conversation transcripts
    if (conversationData.data) {
      transcripts.push(...conversationData.data);
    }

    // Process call_transcripts - group by call_id and format
    if (callData?.data) {
      const groupedCalls = new Map<string, any[]>();
      callData.data.forEach((row: any) => {
        if (!groupedCalls.has(row.call_id)) {
          groupedCalls.set(row.call_id, []);
        }
        groupedCalls.get(row.call_id)!.push(row);
      });

      // Convert each call to ConversationTranscript format
      groupedCalls.forEach((messages, callId) => {
        const firstMsg = messages[0];
        transcripts.push({
          id: callId,
          session_id: callId,
          call_sid: callId,
          team_id: teamId,
          vendor_name: firstMsg.phone_number || 'Unknown Caller',
          vendor_company: 'Phone Call',
          vendor_phone: firstMsg.phone_number || '',
          builder_name: 'AI Receptionist',
          company_name: 'HomeQuest',
          project_details: {},
          messages: messages.map(m => ({
            role: m.speaker === 'user' ? 'user' : 'assistant',
            content: m.text,
            timestamp: m.spoken_at || m.created_at
          })),
          call_duration: 0,
          call_status: 'successful',
          created_at: firstMsg.created_at || firstMsg.spoken_at
        });
      });
    }

    // Sort all transcripts by date and limit
    return transcripts
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  /**
   * Get analytics for a team
   */
  async getAnalytics(teamId: string) {
    const { data, error } = await supabase
      .from('conversation_transcripts')
      .select('*')
      .eq('team_id', teamId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    if (error) {
      console.error('Error fetching analytics:', error);
      return null;
    }

    const transcripts = data || [];
    const successful = transcripts.filter(t => t.call_status === 'successful').length;
    const totalDuration = transcripts.reduce((sum, t) => sum + (t.call_duration || 0), 0);
    const avgScore = transcripts.reduce((sum, t) => sum + (t.ai_score || 0), 0) / Math.max(1, transcripts.length);

    return {
      totalCalls: transcripts.length,
      successRate: (successful / Math.max(1, transcripts.length)) * 100,
      avgDuration: totalDuration / Math.max(1, transcripts.length),
      avgAIScore: avgScore,
      recentTranscripts: transcripts.slice(0, 5)
    };
  }

  /**
   * Search transcripts
   */
  async searchTranscripts(teamId: string, query: string): Promise<ConversationTranscript[]> {
    const { data, error } = await supabase
      .from('conversation_transcripts')
      .select('*')
      .eq('team_id', teamId)
      .or(`vendor_name.ilike.%${query}%,vendor_company.ilike.%${query}%,result_summary.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error searching transcripts:', error);
      return [];
    }

    return data || [];
  }
}

export default new ConversationTranscriptService();