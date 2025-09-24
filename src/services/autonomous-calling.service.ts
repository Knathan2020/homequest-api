/**
 * Autonomous Calling Service
 * Fully automated AI calling system that runs without human intervention
 */

import { createClient } from '@supabase/supabase-js';
import openaiRealtimeApiService from './openai-realtime-api.service';
import conversationTranscriptService from './conversation-transcript.service';
import callPreparationService, { BuilderBriefing } from './call-preparation.service';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

interface CallCampaign {
  id: string;
  team_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'scheduled';
  project_details: {
    address: string;
    type: string;
    budget: string;
    timeline: string;
    urgency: string;
    specificWork: string;
  };
  target_vendors: VendorTarget[];
  call_settings: {
    max_calls_per_day: number;
    call_hours: { start: string; end: string };
    retry_failed: boolean;
    max_retries: number;
    time_between_calls: number; // minutes
    ai_personality: 'professional' | 'friendly' | 'enthusiastic' | 'urgent';
    success_criteria: {
      meeting_scheduled: boolean;
      quote_requested: boolean;
      interest_shown: boolean;
      callback_requested: boolean;
    };
  };
  automation_rules: {
    auto_schedule_followup: boolean;
    followup_delay_hours: number;
    auto_send_details: boolean;
    auto_book_meetings: boolean;
    escalate_to_human_after_failures: number;
  };
  performance: {
    total_calls: number;
    successful_calls: number;
    meetings_scheduled: number;
    quotes_received: number;
    conversion_rate: number;
  };
  builder_briefing?: BuilderBriefing; // NEW: Optional builder briefing for all calls
  created_at: string;
  updated_at: string;
  scheduled_start?: string;
  completed_at?: string;
}

interface VendorTarget {
  vendor_id: string;
  name: string;
  company: string;
  phone: string;
  email?: string;
  priority: 'high' | 'medium' | 'low';
  best_call_time?: string;
  call_status: 'pending' | 'calling' | 'completed' | 'failed' | 'scheduled';
  attempts: number;
  last_attempt?: string;
  result?: {
    interested: boolean;
    meeting_scheduled?: boolean;
    callback_time?: string;
    notes?: string;
  };
}

class AutonomousCallingService {
  private activeCampaigns = new Map<string, CallCampaign>();
  private campaignIntervals = new Map<string, NodeJS.Timeout>();
  private isProcessing = false;

  /**
   * Start autonomous calling system
   */
  async initialize() {
    console.log('🤖 Initializing Autonomous Calling System...');
    
    // Load active campaigns
    await this.loadActiveCampaigns();
    
    // Start campaign processor
    this.startCampaignProcessor();
    
    console.log('✅ Autonomous Calling System Ready');
  }

  /**
   * Create a new autonomous campaign
   */
  async createCampaign(params: {
    teamId: string;
    name: string;
    projectDetails: any;
    vendors: Array<{ id: string; name: string; company: string; phone: string; priority?: string }>;
    settings?: Partial<CallCampaign['call_settings']>;
    automationRules?: Partial<CallCampaign['automation_rules']>;
    scheduledStart?: string;
  }): Promise<CallCampaign> {
    const campaign: CallCampaign = {
      id: `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      team_id: params.teamId,
      name: params.name,
      status: params.scheduledStart ? 'scheduled' : 'active',
      project_details: params.projectDetails,
      target_vendors: params.vendors.map(v => ({
        vendor_id: v.id,
        name: v.name,
        company: v.company,
        phone: v.phone,
        priority: (v.priority as any) || 'medium',
        call_status: 'pending',
        attempts: 0
      })),
      call_settings: {
        max_calls_per_day: 50,
        call_hours: { start: '09:00', end: '17:00' },
        retry_failed: true,
        max_retries: 3,
        time_between_calls: 2, // 2 minutes between calls
        ai_personality: 'friendly',
        success_criteria: {
          meeting_scheduled: true,
          quote_requested: true,
          interest_shown: true,
          callback_requested: false
        },
        ...params.settings
      },
      automation_rules: {
        auto_schedule_followup: true,
        followup_delay_hours: 24,
        auto_send_details: true,
        auto_book_meetings: true,
        escalate_to_human_after_failures: 3,
        ...params.automationRules
      },
      performance: {
        total_calls: 0,
        successful_calls: 0,
        meetings_scheduled: 0,
        quotes_received: 0,
        conversion_rate: 0
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      scheduled_start: params.scheduledStart
    };

    // Save to database
    const { data, error } = await supabase
      .from('call_campaigns')
      .insert([campaign])
      .select()
      .single();

    if (error) {
      console.error('Error creating campaign:', error);
      return campaign;
    }

    // Add to active campaigns if not scheduled
    if (campaign.status === 'active') {
      this.activeCampaigns.set(campaign.id, campaign);
      this.startCampaignExecution(campaign.id);
    }

    return data || campaign;
  }

  /**
   * Start campaign processor that runs every minute
   */
  private startCampaignProcessor() {
    setInterval(async () => {
      if (this.isProcessing) return;
      
      this.isProcessing = true;
      await this.processCampaigns();
      this.isProcessing = false;
    }, 60000); // Check every minute
  }

  /**
   * Process all active campaigns
   */
  private async processCampaigns() {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    for (const [campaignId, campaign] of this.activeCampaigns) {
      // Check if within call hours
      if (!this.isWithinCallHours(currentTime, campaign.call_settings.call_hours)) {
        continue;
      }

      // Check daily limit
      const todaysCalls = await this.getTodaysCallCount(campaignId);
      if (todaysCalls >= campaign.call_settings.max_calls_per_day) {
        console.log(`📊 Campaign ${campaign.name} reached daily limit`);
        continue;
      }

      // Find next vendor to call
      const nextVendor = this.getNextVendorToCall(campaign);
      if (!nextVendor) {
        // Check if campaign is complete
        const allComplete = campaign.target_vendors.every(
          v => v.call_status === 'completed' || v.attempts >= campaign.call_settings.max_retries
        );
        
        if (allComplete) {
          await this.completeCampaign(campaignId);
        }
        continue;
      }

      // Make the call
      await this.makeAutonomousCall(campaign, nextVendor);
    }
  }

  /**
   * Get next vendor to call based on priority and status
   */
  private getNextVendorToCall(campaign: CallCampaign): VendorTarget | null {
    // Sort by priority and attempts
    const pendingVendors = campaign.target_vendors
      .filter(v => {
        if (v.call_status === 'completed') return false;
        if (v.call_status === 'calling') return false;
        if (v.attempts >= campaign.call_settings.max_retries) return false;
        
        // Check if enough time has passed since last attempt
        if (v.last_attempt) {
          const lastAttempt = new Date(v.last_attempt);
          const timeSinceLastCall = (Date.now() - lastAttempt.getTime()) / 60000; // minutes
          if (timeSinceLastCall < campaign.call_settings.time_between_calls) {
            return false;
          }
        }
        
        return true;
      })
      .sort((a, b) => {
        // Priority order: high > medium > low
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Then by attempts (fewer attempts first)
        return a.attempts - b.attempts;
      });

    return pendingVendors[0] || null;
  }

  /**
   * Make an autonomous call
   */
  private async makeAutonomousCall(campaign: CallCampaign, vendor: VendorTarget) {
    console.log(`🤖 Autonomous call starting: ${vendor.name} from ${vendor.company}`);
    
    // Update vendor status
    vendor.call_status = 'calling';
    vendor.attempts++;
    vendor.last_attempt = new Date().toISOString();
    await this.updateCampaign(campaign);

    try {
      // Get builder info from team
      const { data: team } = await supabase
        .from('teams')
        .select('name, company_name, builder_name')
        .eq('id', campaign.team_id)
        .single();

      const builderName = team?.builder_name || 'the team';
      const companyName = team?.company_name || 'our construction company';

      // ENHANCED: Prepare intelligent call context (with builder briefing)
      console.log('🧠 Preparing intelligent call context...');
      if (campaign.builder_briefing) {
        console.log('📋 Campaign includes builder briefing:', campaign.builder_briefing.primary_objective);
      }

      const enhancedContext = await callPreparationService.prepareCallContext({
        vendorId: vendor.vendor_id,
        vendorName: vendor.name,
        vendorCompany: vendor.company,
        vendorPhone: vendor.phone,
        projectDetails: campaign.project_details,
        teamId: campaign.team_id,
        builderName,
        companyName,
        builderBriefing: campaign.builder_briefing // Pass the briefing
      });

      // Make the call using OpenAI Realtime API with enhanced context
      const callResult = await openaiRealtimeApiService.initiateEnhancedRealtimeCall({
        to: vendor.phone,
        vendorName: vendor.name,
        vendorCompany: vendor.company,
        projectDetails: campaign.project_details,
        builderName,
        companyName,
        teamId: campaign.team_id,
        enhancedContext
      });

      if (callResult.success) {
        // Wait for call to complete (with timeout)
        const transcript = await this.waitForCallCompletion(callResult.sessionId, 300000); // 5 min timeout
        
        // Analyze call results
        const analysis = this.analyzeCallResults(transcript);
        
        // Update vendor with results
        vendor.call_status = analysis.success ? 'completed' : 'failed';
        vendor.result = {
          interested: analysis.interested,
          meeting_scheduled: analysis.meetingScheduled,
          callback_time: analysis.callbackTime,
          notes: analysis.summary
        };

        // Update campaign performance
        campaign.performance.total_calls++;
        if (analysis.success) {
          campaign.performance.successful_calls++;
          if (analysis.meetingScheduled) {
            campaign.performance.meetings_scheduled++;
          }
        }
        campaign.performance.conversion_rate = 
          (campaign.performance.successful_calls / campaign.performance.total_calls) * 100;

        // Handle automation rules
        await this.handleAutomationRules(campaign, vendor, analysis);
        
        console.log(`✅ Autonomous call completed: ${vendor.name} - ${analysis.success ? 'Success' : 'Failed'}`);
      } else {
        vendor.call_status = 'failed';
        console.error(`❌ Autonomous call failed: ${vendor.name}`);
      }
    } catch (error) {
      console.error('Error in autonomous call:', error);
      vendor.call_status = 'failed';
    }

    // Update campaign in database
    await this.updateCampaign(campaign);
  }

  /**
   * Wait for call to complete and get transcript
   */
  private async waitForCallCompletion(sessionId: string, timeout: number): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Check if transcript is complete
      const transcripts = await conversationTranscriptService.getRecentTranscripts(sessionId, 1);
      
      if (transcripts.length > 0 && transcripts[0].call_status !== 'in_progress') {
        return transcripts[0];
      }
      
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('Call timeout');
  }

  /**
   * Analyze call results using AI
   */
  private analyzeCallResults(transcript: any): {
    success: boolean;
    interested: boolean;
    meetingScheduled: boolean;
    callbackTime?: string;
    summary: string;
  } {
    // Analyze transcript messages for success indicators
    const messages = transcript.messages || [];
    const vendorMessages = messages.filter((m: any) => m.role === 'user');
    
    const positiveIndicators = [
      'yes', 'interested', 'sounds good', 'tell me more', 
      'when can we meet', 'send me', 'definitely', 'absolutely'
    ];
    
    const negativeIndicators = [
      'not interested', 'no thanks', 'busy', 'already have',
      'don\'t need', 'maybe later', 'call back'
    ];
    
    let positiveScore = 0;
    let negativeScore = 0;
    let meetingScheduled = false;
    let callbackTime = undefined;
    
    vendorMessages.forEach((msg: any) => {
      const content = msg.content.toLowerCase();
      
      positiveIndicators.forEach(indicator => {
        if (content.includes(indicator)) positiveScore++;
      });
      
      negativeIndicators.forEach(indicator => {
        if (content.includes(indicator)) negativeScore++;
      });
      
      if (content.includes('meet') || content.includes('appointment')) {
        meetingScheduled = true;
      }
      
      // Extract callback time if mentioned
      const timeMatch = content.match(/call.*?(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/i);
      if (timeMatch) {
        callbackTime = timeMatch[1];
      }
    });
    
    const success = positiveScore > negativeScore && transcript.call_duration > 30;
    
    return {
      success,
      interested: positiveScore > 0,
      meetingScheduled,
      callbackTime,
      summary: transcript.result_summary || 'Call completed'
    };
  }

  /**
   * Handle automation rules after call
   */
  private async handleAutomationRules(campaign: CallCampaign, vendor: VendorTarget, analysis: any) {
    const rules = campaign.automation_rules;
    
    // Auto-schedule follow-up
    if (rules.auto_schedule_followup && !analysis.success && vendor.attempts < campaign.call_settings.max_retries) {
      const followupTime = new Date();
      followupTime.setHours(followupTime.getHours() + rules.followup_delay_hours);
      
      console.log(`📅 Scheduling follow-up for ${vendor.name} at ${followupTime.toISOString()}`);
      // Schedule follow-up call
      vendor.call_status = 'scheduled';
    }
    
    // Auto-send project details
    if (rules.auto_send_details && analysis.interested) {
      console.log(`📧 Sending project details to ${vendor.name}`);
      // Send email/SMS with project details
      await this.sendProjectDetails(vendor, campaign.project_details);
    }
    
    // Auto-book meetings
    if (rules.auto_book_meetings && analysis.meetingScheduled) {
      console.log(`📅 Booking meeting with ${vendor.name}`);
      // Create calendar event
      await this.bookMeeting(vendor, campaign);
    }
    
    // Escalate to human if needed
    if (vendor.attempts >= rules.escalate_to_human_after_failures && !analysis.success) {
      console.log(`⚠️ Escalating ${vendor.name} to human agent`);
      await this.escalateToHuman(vendor, campaign);
    }
  }

  /**
   * Send project details to vendor
   */
  private async sendProjectDetails(vendor: VendorTarget, projectDetails: any) {
    // Implementation for sending SMS/email with project details
    console.log(`Sending details to ${vendor.phone}: ${JSON.stringify(projectDetails)}`);
  }

  /**
   * Book a meeting
   */
  private async bookMeeting(vendor: VendorTarget, campaign: CallCampaign) {
    // Implementation for calendar integration
    console.log(`Booking meeting with ${vendor.name} for project ${campaign.name}`);
  }

  /**
   * Escalate to human agent
   */
  private async escalateToHuman(vendor: VendorTarget, campaign: CallCampaign) {
    // Create notification for human agent
    await supabase.from('notifications').insert({
      team_id: campaign.team_id,
      type: 'escalation',
      title: `Vendor ${vendor.name} needs human follow-up`,
      description: `Automated calls failed after ${vendor.attempts} attempts`,
      metadata: { vendor, campaign_id: campaign.id },
      created_at: new Date().toISOString()
    });
  }

  /**
   * Check if current time is within call hours
   */
  private isWithinCallHours(currentTime: string, callHours: { start: string; end: string }): boolean {
    const [currentHour, currentMin] = currentTime.split(':').map(Number);
    const [startHour, startMin] = callHours.start.split(':').map(Number);
    const [endHour, endMin] = callHours.end.split(':').map(Number);
    
    const currentMinutes = currentHour * 60 + currentMin;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Get today's call count for a campaign
   */
  private async getTodaysCallCount(campaignId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count } = await supabase
      .from('conversation_transcripts')
      .select('*', { count: 'exact', head: true })
      .eq('metadata.campaign_id', campaignId)
      .gte('created_at', today.toISOString());
    
    return count || 0;
  }

  /**
   * Load active campaigns from database
   */
  private async loadActiveCampaigns() {
    const { data, error } = await supabase
      .from('call_campaigns')
      .select('*')
      .in('status', ['active', 'scheduled']);
    
    if (error) {
      console.error('Error loading campaigns:', error);
      return;
    }
    
    (data || []).forEach(campaign => {
      // Check if scheduled campaign should start
      if (campaign.status === 'scheduled' && campaign.scheduled_start) {
        if (new Date(campaign.scheduled_start) <= new Date()) {
          campaign.status = 'active';
        }
      }
      
      if (campaign.status === 'active') {
        this.activeCampaigns.set(campaign.id, campaign);
        this.startCampaignExecution(campaign.id);
      }
    });
  }

  /**
   * Start executing a campaign
   */
  private startCampaignExecution(campaignId: string) {
    console.log(`🚀 Starting campaign execution: ${campaignId}`);
    // Campaign processing happens in the main processor loop
  }

  /**
   * Update campaign in database
   */
  private async updateCampaign(campaign: CallCampaign) {
    campaign.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('call_campaigns')
      .update(campaign)
      .eq('id', campaign.id);
    
    if (error) {
      console.error('Error updating campaign:', error);
    }
  }

  /**
   * Complete a campaign
   */
  private async completeCampaign(campaignId: string) {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) return;
    
    campaign.status = 'completed';
    campaign.completed_at = new Date().toISOString();
    
    await this.updateCampaign(campaign);
    this.activeCampaigns.delete(campaignId);
    
    console.log(`✅ Campaign completed: ${campaign.name}`);
    console.log(`📊 Results: ${campaign.performance.successful_calls}/${campaign.performance.total_calls} successful`);
    console.log(`📅 Meetings scheduled: ${campaign.performance.meetings_scheduled}`);
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string) {
    const campaign = this.activeCampaigns.get(campaignId);
    if (campaign) {
      campaign.status = 'paused';
      await this.updateCampaign(campaign);
      this.activeCampaigns.delete(campaignId);
    }
  }

  /**
   * Resume a campaign
   */
  async resumeCampaign(campaignId: string) {
    const { data } = await supabase
      .from('call_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    
    if (data && data.status === 'paused') {
      data.status = 'active';
      await this.updateCampaign(data);
      this.activeCampaigns.set(campaignId, data);
      this.startCampaignExecution(campaignId);
    }
  }

  /**
   * Get campaign status and analytics
   */
  async getCampaignAnalytics(campaignId: string) {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) {
      const { data } = await supabase
        .from('call_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();
      return data;
    }
    return campaign;
  }
}

export default new AutonomousCallingService();