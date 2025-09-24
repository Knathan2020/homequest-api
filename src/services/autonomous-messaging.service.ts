/**
 * Autonomous Messaging Service
 * Handles automated SMS conversations with AI-powered responses
 */

import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || 'ACdced5b7ba48a5d47222ee6c2fe041419',
  process.env.TWILIO_AUTH_TOKEN || 'b744e1efe1c156fd8f391be7785aa4a1'
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

interface MessageCampaign {
  id: string;
  team_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'scheduled';
  message_type: 'initial_outreach' | 'follow_up' | 'reminder' | 'promotional' | 'scheduling';
  project_details: any;
  message_template: string;
  target_vendors: MessageTarget[];
  settings: {
    send_time: string; // HH:MM format
    days_of_week: number[]; // 0-6 (Sunday-Saturday)
    max_messages_per_day: number;
    time_between_messages: number; // seconds
    auto_respond: boolean;
    response_delay: number; // seconds before AI responds
    schedule_meetings_automatically: boolean;
    forward_to_human_keywords: string[];
  };
  ai_config: {
    personality: 'professional' | 'friendly' | 'casual' | 'urgent';
    response_style: 'brief' | 'detailed' | 'conversational';
    max_response_length: number;
    use_emojis: boolean;
    scheduling_enabled: boolean;
  };
  performance: {
    total_sent: number;
    total_received: number;
    response_rate: number;
    meetings_scheduled: number;
    positive_responses: number;
  };
  created_at: string;
  updated_at: string;
}

interface MessageTarget {
  vendor_id: string;
  name: string;
  company: string;
  phone: string;
  status: 'pending' | 'sent' | 'delivered' | 'responded' | 'scheduled' | 'opted_out';
  message_sent_at?: string;
  response_received_at?: string;
  conversation_thread: MessageThread[];
  meeting_scheduled?: {
    date: string;
    time: string;
    confirmed: boolean;
  };
}

interface MessageThread {
  id: string;
  direction: 'inbound' | 'outbound';
  message: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  ai_generated: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

interface IncomingMessage {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  timestamp: string;
}

class AutonomousMessagingService {
  private activeCampaigns = new Map<string, MessageCampaign>();
  private conversationContexts = new Map<string, any>();
  private messageQueue: Array<{ campaignId: string; vendorId: string; message: string }> = [];
  private isProcessing = false;

  /**
   * Initialize the messaging service
   */
  async initialize() {
    console.log('📱 Initializing Autonomous Messaging Service...');
    
    // Load active campaigns
    await this.loadActiveCampaigns();
    
    // Start message processor
    this.startMessageProcessor();
    
    // Start response handler
    this.startResponseHandler();
    
    console.log('✅ Autonomous Messaging Service Ready');
  }

  /**
   * Create a new messaging campaign
   */
  async createMessageCampaign(params: {
    teamId: string;
    name: string;
    messageType: MessageCampaign['message_type'];
    projectDetails: any;
    messageTemplate: string;
    vendors: Array<{ id: string; name: string; company: string; phone: string }>;
    settings?: Partial<MessageCampaign['settings']>;
    aiConfig?: Partial<MessageCampaign['ai_config']>;
    scheduledStart?: string;
  }): Promise<MessageCampaign> {
    const campaign: MessageCampaign = {
      id: `msg_campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      team_id: params.teamId,
      name: params.name,
      status: params.scheduledStart ? 'scheduled' : 'active',
      message_type: params.messageType,
      project_details: params.projectDetails,
      message_template: params.messageTemplate,
      target_vendors: params.vendors.map(v => ({
        vendor_id: v.id,
        name: v.name,
        company: v.company,
        phone: v.phone,
        status: 'pending',
        conversation_thread: []
      })),
      settings: {
        send_time: '10:00',
        days_of_week: [1, 2, 3, 4, 5], // Monday-Friday
        max_messages_per_day: 100,
        time_between_messages: 5, // 5 seconds
        auto_respond: true,
        response_delay: 3, // 3 seconds to seem human
        schedule_meetings_automatically: true,
        forward_to_human_keywords: ['lawyer', 'legal', 'sue', 'complaint', 'emergency'],
        ...params.settings
      },
      ai_config: {
        personality: 'friendly',
        response_style: 'conversational',
        max_response_length: 160, // SMS character limit
        use_emojis: true,
        scheduling_enabled: true,
        ...params.aiConfig
      },
      performance: {
        total_sent: 0,
        total_received: 0,
        response_rate: 0,
        meetings_scheduled: 0,
        positive_responses: 0
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Save to database
    const { data, error } = await supabase
      .from('message_campaigns')
      .insert([campaign])
      .select()
      .single();

    if (error) {
      console.error('Error creating message campaign:', error);
      return campaign;
    }

    // Add to active campaigns
    if (campaign.status === 'active') {
      this.activeCampaigns.set(campaign.id, campaign);
      this.startCampaignMessaging(campaign.id);
    }

    return data || campaign;
  }

  /**
   * Start message processor
   */
  private startMessageProcessor() {
    setInterval(async () => {
      if (this.isProcessing) return;
      
      this.isProcessing = true;
      await this.processMessageQueue();
      this.isProcessing = false;
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process message queue
   */
  private async processMessageQueue() {
    for (const [campaignId, campaign] of this.activeCampaigns) {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      // Check if we should send messages now
      if (!campaign.settings.days_of_week.includes(currentDay)) continue;
      
      // Check daily limit
      const todaysMessages = await this.getTodaysMessageCount(campaignId);
      if (todaysMessages >= campaign.settings.max_messages_per_day) continue;
      
      // Find next vendor to message
      const nextVendor = this.getNextVendorToMessage(campaign);
      if (!nextVendor) {
        // Check if campaign is complete
        const allMessaged = campaign.target_vendors.every(v => v.status !== 'pending');
        if (allMessaged) {
          await this.completeCampaign(campaignId);
        }
        continue;
      }
      
      // Send message
      await this.sendAutomatedMessage(campaign, nextVendor);
      
      // Wait between messages
      await new Promise(resolve => setTimeout(resolve, campaign.settings.time_between_messages * 1000));
    }
  }

  /**
   * Get next vendor to message
   */
  private getNextVendorToMessage(campaign: MessageCampaign): MessageTarget | null {
    return campaign.target_vendors.find(v => v.status === 'pending') || null;
  }

  /**
   * Send automated message
   */
  private async sendAutomatedMessage(campaign: MessageCampaign, vendor: MessageTarget) {
    try {
      // Personalize message
      const personalizedMessage = this.personalizeMessage(campaign.message_template, {
        vendor_name: vendor.name,
        company: vendor.company,
        project_address: campaign.project_details.address,
        project_type: campaign.project_details.type,
        budget: campaign.project_details.budget,
        timeline: campaign.project_details.timeline
      });
      
      // Send via Twilio
      const message = await twilioClient.messages.create({
        body: personalizedMessage,
        from: process.env.TWILIO_PHONE_NUMBER || '+16783253060',
        to: vendor.phone,
        statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/messaging/status`
      });
      
      // Update vendor status
      vendor.status = 'sent';
      vendor.message_sent_at = new Date().toISOString();
      vendor.conversation_thread.push({
        id: message.sid,
        direction: 'outbound',
        message: personalizedMessage,
        timestamp: new Date().toISOString(),
        status: 'sent',
        ai_generated: true
      });
      
      // Update campaign performance
      campaign.performance.total_sent++;
      
      // Save to database
      await this.updateCampaign(campaign);
      
      console.log(`📤 Message sent to ${vendor.name}: ${personalizedMessage.substring(0, 50)}...`);
      
    } catch (error) {
      console.error(`Error sending message to ${vendor.name}:`, error);
      vendor.status = 'pending'; // Retry later
    }
  }

  /**
   * Handle incoming messages
   */
  async handleIncomingMessage(message: IncomingMessage) {
    console.log(`📥 Incoming message from ${message.from}: ${message.body}`);
    
    // Find relevant campaign and vendor
    const { campaign, vendor } = await this.findCampaignAndVendor(message.from);
    
    if (!campaign || !vendor) {
      console.log('No active campaign for this number');
      return;
    }
    
    // Update vendor status
    vendor.status = 'responded';
    vendor.response_received_at = new Date().toISOString();
    vendor.conversation_thread.push({
      id: message.messageSid,
      direction: 'inbound',
      message: message.body,
      timestamp: message.timestamp,
      status: 'delivered',
      ai_generated: false,
      sentiment: await this.analyzeSentiment(message.body)
    });
    
    // Update campaign performance
    campaign.performance.total_received++;
    campaign.performance.response_rate = 
      (campaign.performance.total_received / campaign.performance.total_sent) * 100;
    
    // Check for human escalation keywords
    const shouldEscalate = campaign.settings.forward_to_human_keywords.some(
      keyword => message.body.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (shouldEscalate) {
      await this.escalateToHuman(campaign, vendor, message);
      return;
    }
    
    // Generate and send AI response if enabled
    if (campaign.settings.auto_respond) {
      setTimeout(async () => {
        const aiResponse = await this.generateAIResponse(campaign, vendor, message.body);
        await this.sendResponse(campaign, vendor, aiResponse);
      }, campaign.settings.response_delay * 1000);
    }
    
    // Check for meeting scheduling intent
    if (campaign.settings.schedule_meetings_automatically) {
      const schedulingIntent = await this.detectSchedulingIntent(message.body);
      if (schedulingIntent) {
        await this.handleScheduling(campaign, vendor, schedulingIntent);
      }
    }
    
    // Save updates
    await this.updateCampaign(campaign);
  }

  /**
   * Generate AI response
   */
  private async generateAIResponse(
    campaign: MessageCampaign, 
    vendor: MessageTarget, 
    incomingMessage: string
  ): Promise<string> {
    try {
      // Get conversation context
      const context = this.getConversationContext(vendor);
      
      const prompt = `You are ${campaign.ai_config.personality} representative for a construction company.
      
      Project: ${campaign.project_details.type} at ${campaign.project_details.address}
      Budget: ${campaign.project_details.budget}
      Timeline: ${campaign.project_details.timeline}
      
      Vendor: ${vendor.name} from ${vendor.company}
      
      Conversation history:
      ${context}
      
      They just said: "${incomingMessage}"
      
      Respond in a ${campaign.ai_config.response_style} way. 
      ${campaign.ai_config.use_emojis ? 'Use emojis sparingly.' : 'Do not use emojis.'}
      Keep response under ${campaign.ai_config.max_response_length} characters.
      ${campaign.ai_config.scheduling_enabled ? 'If they want to schedule, suggest specific times.' : ''}
      
      Your goal is to:
      1. Answer their question
      2. Keep them interested in the project
      3. Move toward scheduling a meeting if possible`;
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: incomingMessage }
        ],
        max_tokens: 100,
        temperature: 0.7
      });
      
      return completion.choices[0].message.content || 'Thanks for your message! When would be a good time to discuss this project?';
      
    } catch (error) {
      console.error('Error generating AI response:', error);
      return 'Thanks for your interest! Can we schedule a call to discuss the details?';
    }
  }

  /**
   * Send response message
   */
  private async sendResponse(campaign: MessageCampaign, vendor: MessageTarget, message: string) {
    try {
      const response = await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER || '+16783253060',
        to: vendor.phone
      });
      
      vendor.conversation_thread.push({
        id: response.sid,
        direction: 'outbound',
        message: message,
        timestamp: new Date().toISOString(),
        status: 'sent',
        ai_generated: true
      });
      
      console.log(`🤖 AI Response sent to ${vendor.name}: ${message.substring(0, 50)}...`);
      
      await this.updateCampaign(campaign);
      
    } catch (error) {
      console.error('Error sending response:', error);
    }
  }

  /**
   * Detect scheduling intent
   */
  private async detectSchedulingIntent(message: string): Promise<any> {
    const schedulingKeywords = [
      'when', 'schedule', 'meet', 'available', 'time', 'date',
      'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      'morning', 'afternoon', 'evening', 'pm', 'am'
    ];
    
    const hasSchedulingIntent = schedulingKeywords.some(
      keyword => message.toLowerCase().includes(keyword)
    );
    
    if (hasSchedulingIntent) {
      // Extract potential date/time
      const timeMatches = message.match(/\b(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)\b/gi);
      const dayMatches = message.match(/\b(monday|tuesday|wednesday|thursday|friday|tomorrow|today)\b/gi);
      
      return {
        hasIntent: true,
        suggestedTime: timeMatches?.[0],
        suggestedDay: dayMatches?.[0]
      };
    }
    
    return null;
  }

  /**
   * Handle scheduling
   */
  private async handleScheduling(campaign: MessageCampaign, vendor: MessageTarget, schedulingIntent: any) {
    // Parse the scheduling intent
    const proposedDate = this.parseSchedulingDate(schedulingIntent.suggestedDay);
    const proposedTime = schedulingIntent.suggestedTime || '2:00 PM';
    
    // Create meeting
    vendor.meeting_scheduled = {
      date: proposedDate,
      time: proposedTime,
      confirmed: false
    };
    
    // Send confirmation
    const confirmationMessage = `Perfect! I've scheduled our meeting for ${proposedDate} at ${proposedTime}. 
    I'll send you a calendar invite and call you then to discuss the ${campaign.project_details.type} project. 
    Reply YES to confirm or suggest another time.`;
    
    await this.sendResponse(campaign, vendor, confirmationMessage);
    
    // Update campaign metrics
    campaign.performance.meetings_scheduled++;
    
    // Create calendar event (integrate with calendar service)
    await this.createCalendarEvent(vendor, campaign, proposedDate, proposedTime);
  }

  /**
   * Parse scheduling date
   */
  private parseSchedulingDate(dayString?: string): string {
    if (!dayString) return new Date(Date.now() + 86400000).toLocaleDateString(); // Tomorrow
    
    const today = new Date();
    const dayMap: { [key: string]: number } = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };
    
    if (dayString.toLowerCase() === 'today') {
      return today.toLocaleDateString();
    }
    
    if (dayString.toLowerCase() === 'tomorrow') {
      return new Date(Date.now() + 86400000).toLocaleDateString();
    }
    
    const targetDay = dayMap[dayString.toLowerCase()];
    if (targetDay !== undefined) {
      const daysUntil = (targetDay - today.getDay() + 7) % 7 || 7;
      return new Date(Date.now() + daysUntil * 86400000).toLocaleDateString();
    }
    
    return new Date(Date.now() + 86400000).toLocaleDateString(); // Default to tomorrow
  }

  /**
   * Create calendar event
   */
  private async createCalendarEvent(vendor: MessageTarget, campaign: MessageCampaign, date: string, time: string) {
    // Implementation for calendar integration
    console.log(`📅 Creating calendar event for ${vendor.name} on ${date} at ${time}`);
    
    // Save to database
    await supabase.from('scheduled_meetings').insert({
      campaign_id: campaign.id,
      vendor_id: vendor.vendor_id,
      vendor_name: vendor.name,
      vendor_company: vendor.company,
      date: date,
      time: time,
      project_details: campaign.project_details,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Analyze sentiment
   */
  private async analyzeSentiment(message: string): Promise<'positive' | 'neutral' | 'negative'> {
    const positiveWords = ['yes', 'interested', 'great', 'good', 'perfect', 'sure', 'definitely', 'absolutely'];
    const negativeWords = ['no', 'not', 'busy', 'cant', 'wont', 'never', 'stop', 'remove'];
    
    const messageLower = message.toLowerCase();
    const positiveCount = positiveWords.filter(word => messageLower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => messageLower.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Personalize message template
   */
  private personalizeMessage(template: string, variables: any): string {
    let message = template;
    
    Object.keys(variables).forEach(key => {
      const placeholder = `{{${key}}}`;
      message = message.replace(new RegExp(placeholder, 'g'), variables[key]);
    });
    
    return message;
  }

  /**
   * Get conversation context
   */
  private getConversationContext(vendor: MessageTarget): string {
    return vendor.conversation_thread
      .slice(-5) // Last 5 messages
      .map(msg => `${msg.direction === 'inbound' ? 'Vendor' : 'You'}: ${msg.message}`)
      .join('\n');
  }

  /**
   * Find campaign and vendor by phone
   */
  private async findCampaignAndVendor(phone: string): Promise<{ campaign?: MessageCampaign; vendor?: MessageTarget }> {
    for (const [campaignId, campaign] of this.activeCampaigns) {
      const vendor = campaign.target_vendors.find(v => v.phone === phone);
      if (vendor) {
        return { campaign, vendor };
      }
    }
    
    return {};
  }

  /**
   * Escalate to human
   */
  private async escalateToHuman(campaign: MessageCampaign, vendor: MessageTarget, message: IncomingMessage) {
    console.log(`⚠️ Escalating conversation with ${vendor.name} to human agent`);
    
    // Create notification
    await supabase.from('notifications').insert({
      team_id: campaign.team_id,
      type: 'message_escalation',
      title: `Urgent: ${vendor.name} needs human response`,
      description: `Message contains sensitive keywords: "${message.body}"`,
      metadata: { 
        vendor, 
        campaign_id: campaign.id,
        message: message.body 
      },
      created_at: new Date().toISOString()
    });
    
    // Send acknowledgment to vendor
    const ackMessage = 'Thanks for your message. I\'m connecting you with our team lead who can better assist you. They\'ll be in touch shortly.';
    await this.sendResponse(campaign, vendor, ackMessage);
  }

  /**
   * Start response handler
   */
  private startResponseHandler() {
    // This would typically listen to Twilio webhooks
    console.log('📱 Response handler started');
  }

  /**
   * Get today's message count
   */
  private async getTodaysMessageCount(campaignId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count } = await supabase
      .from('message_logs')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .gte('created_at', today.toISOString());
    
    return count || 0;
  }

  /**
   * Load active campaigns
   */
  private async loadActiveCampaigns() {
    const { data, error } = await supabase
      .from('message_campaigns')
      .select('*')
      .in('status', ['active', 'scheduled']);
    
    if (error) {
      console.error('Error loading message campaigns:', error);
      return;
    }
    
    (data || []).forEach(campaign => {
      if (campaign.status === 'active') {
        this.activeCampaigns.set(campaign.id, campaign);
      }
    });
  }

  /**
   * Start campaign messaging
   */
  private startCampaignMessaging(campaignId: string) {
    console.log(`📤 Starting message campaign: ${campaignId}`);
  }

  /**
   * Update campaign
   */
  private async updateCampaign(campaign: MessageCampaign) {
    campaign.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('message_campaigns')
      .update(campaign)
      .eq('id', campaign.id);
    
    if (error) {
      console.error('Error updating message campaign:', error);
    }
  }

  /**
   * Complete campaign
   */
  private async completeCampaign(campaignId: string) {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) return;
    
    campaign.status = 'completed';
    await this.updateCampaign(campaign);
    this.activeCampaigns.delete(campaignId);
    
    console.log(`✅ Message campaign completed: ${campaign.name}`);
    console.log(`📊 Results: ${campaign.performance.response_rate}% response rate, ${campaign.performance.meetings_scheduled} meetings scheduled`);
  }
}

export default new AutonomousMessagingService();