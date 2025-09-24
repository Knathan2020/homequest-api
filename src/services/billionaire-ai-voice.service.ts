// BILLIONAIRE AI VOICE SYSTEM
// Ultra-intelligent conversational AI that vendors prefer over humans
// Handles outbound calls, inbound callbacks, and full project management

import twilio from 'twilio';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { VoiceResponse } from 'twilio/lib/twiml/VoiceResponse';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

interface ProjectContext {
  projectId: string;
  projectAddress: string;
  projectType: string; // "Luxury Home", "Commercial Complex", "High-Rise"
  budget: string;
  timeline: string;
  urgency: 'immediate' | 'this_week' | 'this_month';
  specificNeeds: string[];
  builderName: string;
  companyName: string;
  vendorInfo: {
    name: string;
    company: string;
    specialty: string;
    previousProjects?: any[];
    preferredWorkStyle?: string;
  };
}

interface ConversationState {
  callSid: string;
  projectContext: ProjectContext;
  conversationHistory: Array<{
    speaker: 'AI' | 'Vendor';
    text: string;
    timestamp: Date;
    sentiment?: 'positive' | 'neutral' | 'negative';
  }>;
  vendorMood: 'excited' | 'interested' | 'neutral' | 'hesitant' | 'busy';
  nextSteps: string[];
  dealProbability: number;
  keyPoints: string[];
  vendorConcerns: string[];
  agreedTerms: string[];
}

class BillionaireAIVoiceService {
  private activeConversations = new Map<string, ConversationState>();
  private vendorProfiles = new Map<string, any>();
  private projectDatabase = new Map<string, ProjectContext>();

  // BILLIONAIRE OPENING: Send SMS first, then call with context
  async initiateBillionaireDeal(params: {
    teamId: string;
    vendorPhone: string;
    vendorName: string;
    vendorCompany: string;
    vendorSpecialty: string;
    projectDetails: {
      address: string;
      type: string;
      budget: string;
      timeline: string;
      urgency: 'immediate' | 'this_week' | 'this_month';
      specificWork: string;
    };
    builderName: string;
    companyName: string;
  }) {
    const projectId = `PRJ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store project context
    const projectContext: ProjectContext = {
      projectId,
      projectAddress: params.projectDetails.address,
      projectType: params.projectDetails.type,
      budget: params.projectDetails.budget,
      timeline: params.projectDetails.timeline,
      urgency: params.projectDetails.urgency,
      specificNeeds: [params.projectDetails.specificWork],
      builderName: params.builderName,
      companyName: params.companyName,
      vendorInfo: {
        name: params.vendorName,
        company: params.vendorCompany,
        specialty: params.vendorSpecialty
      }
    };

    this.projectDatabase.set(projectId, projectContext);

    // STEP 1: Send intelligent SMS with project preview
    const smsMessage = await this.generateIntelligentSMS(projectContext);
    await twilioClient.messages.create({
      body: smsMessage,
      to: params.vendorPhone,
      from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER
    });

    // STEP 2: Wait 30 seconds then call
    setTimeout(async () => {
      await this.makeIntelligentCall(params.vendorPhone, projectContext);
    }, 30000);

    return {
      success: true,
      projectId,
      message: 'Billionaire AI sequence initiated',
      smsPreview: smsMessage
    };
  }

  // Generate ultra-intelligent SMS that gets vendors excited
  private async generateIntelligentSMS(context: ProjectContext): Promise<string> {
    const urgencyText = {
      immediate: '🚨 URGENT - Starting TODAY',
      this_week: '📅 Starting THIS WEEK', 
      this_month: '📆 Starting this month'
    };

    return `${urgencyText[context.urgency]}

${context.vendorInfo.name}, you've been specifically selected for a ${context.budget} ${context.projectType} project.

📍 ${context.projectAddress}
💰 Budget: ${context.budget}
🏗️ ${context.specificNeeds.join(', ')}

${context.builderName} from ${context.companyName} will call you in 30 seconds with details.

This is a premium opportunity. The AI assistant calling you has full project details and decision-making authority.

Project ID: ${context.projectId}`;
  }

  // Make the ultra-intelligent call
  private async makeIntelligentCall(vendorPhone: string, context: ProjectContext) {
    const webhookBase = process.env.WEBHOOK_BASE_URL || 
      `https://${process.env.CODESPACE_NAME}-4000.app.github.dev`;

    // Create sophisticated opening
    const openingScript = await this.generateDynamicOpening(context);

    const call = await twilioClient.calls.create({
      to: vendorPhone,
      from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER,
      twiml: `
        <Response>
          <Say voice="Polly.Matthew-Neural">
            ${openingScript}
          </Say>
          <Gather 
            input="speech" 
            enhanced="true"
            speechModel="experimental_conversations"
            timeout="4" 
            speechTimeout="auto"
            action="${webhookBase}/api/billionaire-ai/respond"
            method="POST"
          >
            <Say voice="Polly.Matthew-Neural">
              I'm listening, and I have full authority to make decisions on this project. What questions do you have?
            </Say>
          </Gather>
        </Response>
      `,
      machineDetection: 'DetectMessageEnd',
      machineDetectionTimeout: 8000,
      statusCallback: `${webhookBase}/api/billionaire-ai/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    // Initialize conversation state
    this.activeConversations.set(call.sid, {
      callSid: call.sid,
      projectContext: context,
      conversationHistory: [{
        speaker: 'AI',
        text: openingScript,
        timestamp: new Date()
      }],
      vendorMood: 'neutral',
      nextSteps: [],
      dealProbability: 50,
      keyPoints: [],
      vendorConcerns: [],
      agreedTerms: []
    });

    return call.sid;
  }

  // Generate dynamic, intelligent opening based on vendor profile and project
  private async generateDynamicOpening(context: ProjectContext): Promise<string> {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{
        role: "system",
        content: `You are an ultra-sophisticated AI assistant representing ${context.builderName} from ${context.companyName}.
        You're calling ${context.vendorInfo.name} from ${context.vendorInfo.company} about a ${context.budget} project.
        
        Create a POWERFUL, COMPELLING opening that:
        1. Immediately establishes this as a HIGH-VALUE opportunity
        2. Shows you know their expertise in ${context.vendorInfo.specialty}
        3. Creates urgency without being pushy
        4. Demonstrates you have full decision-making authority
        5. Makes them WANT to work on this project
        
        Be confident, professional, and make them feel like they're the ONLY vendor who can handle this.`
      }, {
        role: "user",
        content: `Create a 30-second opening for calling ${context.vendorInfo.name} about:
        - ${context.projectType} at ${context.projectAddress}
        - Budget: ${context.budget}
        - Timeline: ${context.timeline}
        - Urgency: ${context.urgency}
        - Specific needs: ${context.specificNeeds.join(', ')}`
      }],
      temperature: 0.8,
      max_tokens: 200
    });

    return completion.choices[0].message.content || this.getDefaultOpening(context);
  }

  // Fallback opening
  private getDefaultOpening(context: ProjectContext): string {
    return `Hello ${context.vendorInfo.name}, this is the AI assistant for ${context.builderName} at ${context.companyName}. 
    I'm calling about the message I just sent regarding our ${context.budget} ${context.projectType} project at ${context.projectAddress}. 
    I have full authority to negotiate terms and schedule immediately. 
    We specifically selected your company based on your excellent reputation in ${context.vendorInfo.specialty}. 
    This is a premium project starting ${context.urgency === 'immediate' ? 'today' : `this ${context.urgency.split('_')[1]}`}, 
    and we're prepared to pay top rates for the right partner.`;
  }

  // Handle vendor responses with GPT-4 level intelligence
  async handleVendorResponse(callSid: string, vendorSpeech: string): Promise<string> {
    const state = this.activeConversations.get(callSid);
    if (!state) return this.handleUnknownCall(vendorSpeech);

    // Add vendor response to history
    state.conversationHistory.push({
      speaker: 'Vendor',
      text: vendorSpeech,
      timestamp: new Date(),
      sentiment: await this.analyzeSentiment(vendorSpeech)
    });

    // Analyze vendor mood and update probability
    state.vendorMood = await this.analyzeVendorMood(vendorSpeech);
    state.dealProbability = this.calculateDealProbability(state);

    // Extract key information
    await this.extractKeyInformation(vendorSpeech, state);

    // Generate ultra-intelligent response
    const aiResponse = await this.generateIntelligentResponse(state, vendorSpeech);

    // Add AI response to history
    state.conversationHistory.push({
      speaker: 'AI',
      text: aiResponse,
      timestamp: new Date()
    });

    // Save conversation to database
    await this.saveConversationState(state);

    return this.formatTwiMLResponse(aiResponse, state);
  }

  // Generate intelligent responses that close deals
  private async generateIntelligentResponse(state: ConversationState, vendorInput: string): Promise<string> {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an ultra-sophisticated AI with FULL decision-making authority for a ${state.projectContext.budget} construction project.
          
          Your personality:
          - Confident but not arrogant
          - Knowledgeable about construction
          - Empathetic to vendor concerns
          - Able to negotiate and close deals
          - Can schedule immediately
          - Can approve higher rates for quality work
          
          Current vendor mood: ${state.vendorMood}
          Deal probability: ${state.dealProbability}%
          Vendor concerns: ${state.vendorConcerns.join(', ')}
          
          Your goals:
          1. Address any concerns immediately
          2. Build excitement about the project
          3. Get verbal commitment
          4. Schedule site visit or start date
          5. Make them feel valued and essential
          
          If they mention:
          - Price/rates: You can approve 10-20% above market rate for quality
          - Timeline: You have flexibility but prefer their earliest availability
          - Other jobs: This project takes priority, willing to wait for the best
          - Questions: You have ALL information and can answer anything`
        },
        {
          role: "user",
          content: `Conversation history:
          ${state.conversationHistory.slice(-5).map(h => `${h.speaker}: ${h.text}`).join('\n')}
          
          Vendor just said: "${vendorInput}"
          
          Generate a response that moves toward closing this deal. Be natural, confident, and address their specific points.`
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    return completion.choices[0].message.content || this.getFallbackResponse(vendorInput);
  }

  // Analyze sentiment of vendor's response
  private async analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative'> {
    const positive = ['yes', 'sure', 'interested', 'great', 'excellent', 'perfect', 'available', 'can do'];
    const negative = ['no', 'busy', 'cant', 'wont', 'unavailable', 'expensive', 'difficult'];
    
    const lowerText = text.toLowerCase();
    const positiveScore = positive.filter(word => lowerText.includes(word)).length;
    const negativeScore = negative.filter(word => lowerText.includes(word)).length;
    
    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  // Analyze vendor mood from their responses
  private async analyzeVendorMood(text: string): Promise<'excited' | 'interested' | 'neutral' | 'hesitant' | 'busy'> {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('excited') || lowerText.includes('love to') || lowerText.includes('definitely')) {
      return 'excited';
    }
    if (lowerText.includes('interested') || lowerText.includes('tell me more') || lowerText.includes('sounds good')) {
      return 'interested';
    }
    if (lowerText.includes('busy') || lowerText.includes('booked') || lowerText.includes('swamped')) {
      return 'busy';
    }
    if (lowerText.includes('not sure') || lowerText.includes('maybe') || lowerText.includes('depends')) {
      return 'hesitant';
    }
    return 'neutral';
  }

  // Calculate probability of closing the deal
  private calculateDealProbability(state: ConversationState): number {
    let probability = 50; // Base probability
    
    // Mood factors
    const moodScores = {
      excited: 30,
      interested: 15,
      neutral: 0,
      hesitant: -15,
      busy: -25
    };
    probability += moodScores[state.vendorMood];
    
    // Conversation length (longer = more engaged)
    probability += Math.min(state.conversationHistory.length * 2, 20);
    
    // Positive sentiment ratio
    const positiveSentiments = state.conversationHistory.filter(h => h.sentiment === 'positive').length;
    const totalSentiments = state.conversationHistory.length;
    probability += (positiveSentiments / totalSentiments) * 20;
    
    // Concerns addressed
    probability -= state.vendorConcerns.length * 5;
    
    // Agreed terms
    probability += state.agreedTerms.length * 10;
    
    return Math.max(0, Math.min(100, probability));
  }

  // Extract key information from vendor responses
  private async extractKeyInformation(vendorInput: string, state: ConversationState) {
    const lowerInput = vendorInput.toLowerCase();
    
    // Extract concerns
    if (lowerInput.includes('concern') || lowerInput.includes('worry') || lowerInput.includes('problem')) {
      state.vendorConcerns.push(vendorInput);
    }
    
    // Extract agreements
    if (lowerInput.includes('yes') || lowerInput.includes('agree') || lowerInput.includes('sounds good')) {
      state.agreedTerms.push(`Agreed at ${new Date().toISOString()}: ${vendorInput}`);
    }
    
    // Extract scheduling preferences
    if (lowerInput.includes('monday') || lowerInput.includes('tuesday') || lowerInput.includes('week')) {
      state.nextSteps.push(`Scheduling preference: ${vendorInput}`);
    }
    
    // Extract price discussions
    if (lowerInput.includes('price') || lowerInput.includes('rate') || lowerInput.includes('cost')) {
      state.keyPoints.push(`Price discussion: ${vendorInput}`);
    }
  }

  // Format response as TwiML
  private formatTwiMLResponse(response: string, state: ConversationState): string {
    const webhookBase = process.env.WEBHOOK_BASE_URL || 
      `https://${process.env.CODESPACE_NAME}-4000.app.github.dev`;

    // Check if we should end the call
    const shouldEnd = response.toLowerCase().includes('talk to you soon') || 
                     response.toLowerCase().includes('goodbye') ||
                     state.dealProbability > 80;

    if (shouldEnd) {
      return `
        <Response>
          <Say voice="Polly.Joanna-Neural">
            ${response}
          </Say>
          <Say voice="Polly.Joanna-Neural">
            I'm sending you a detailed project summary and contract proposal right now. 
            You'll also receive my direct line for any questions.
          </Say>
          <Pause length="1"/>
          <Say voice="Polly.Joanna-Neural">
            Thank you for your time, ${state.projectContext.vendorInfo.name}. 
            We're excited to work with you on this project!
          </Say>
          <Hangup/>
        </Response>
      `;
    }

    return `
      <Response>
        <Say voice="Polly.Joanna-Neural">
          ${response}
        </Say>
        <Gather 
          input="speech" 
          enhanced="true"
          speechModel="experimental_conversations"
          timeout="4" 
          speechTimeout="auto"
          action="${webhookBase}/api/billionaire-ai/respond"
          method="POST"
        >
          <Say voice="Polly.Joanna-Neural">
            Please continue, I'm listening.
          </Say>
        </Gather>
      </Response>
    `;
  }

  // Handle incoming calls from vendors calling back
  async handleIncomingCall(fromNumber: string): Promise<string> {
    // Look up vendor and their projects
    const vendorProjects = await this.findVendorProjects(fromNumber);
    
    if (vendorProjects.length === 0) {
      return this.handleNewVendorCall(fromNumber);
    }

    const latestProject = vendorProjects[0];
    const webhookBase = process.env.WEBHOOK_BASE_URL || 
      `https://${process.env.CODESPACE_NAME}-4000.app.github.dev`;

    return `
      <Response>
        <Say voice="Polly.Joanna-Neural">
          Hello! I recognize your number. You're calling about the ${latestProject.projectType} project at ${latestProject.projectAddress}, correct?
          I'm the AI assistant with full authority on this project. I remember our last conversation.
        </Say>
        <Pause length="1"/>
        <Say voice="Polly.Joanna-Neural">
          How can I help you today? Do you have questions about the project, or are you ready to confirm your participation?
        </Say>
        <Gather 
          input="speech" 
          enhanced="true"
          speechModel="experimental_conversations"
          timeout="4" 
          speechTimeout="auto"
          action="${webhookBase}/api/billionaire-ai/inbound-response"
          method="POST"
        >
          <Say voice="Polly.Joanna-Neural">
            I'm listening and ready to address any questions or concerns.
          </Say>
        </Gather>
      </Response>
    `;
  }

  // Handle new vendor calling in
  private handleNewVendorCall(fromNumber: string): string {
    const webhookBase = process.env.WEBHOOK_BASE_URL || 
      `https://${process.env.CODESPACE_NAME}-4000.app.github.dev`;

    return `
      <Response>
        <Say voice="Polly.Joanna-Neural">
          Hello! Thank you for calling HomeQuest Construction. I'm the AI assistant with full project authority.
          I can help you with new project opportunities or existing projects.
        </Say>
        <Pause length="1"/>
        <Say voice="Polly.Joanna-Neural">
          Could you please tell me your name and company, and what type of construction work you specialize in?
        </Say>
        <Gather 
          input="speech" 
          enhanced="true"
          speechModel="experimental_conversations"
          timeout="5" 
          speechTimeout="auto"
          action="${webhookBase}/api/billionaire-ai/new-vendor"
          method="POST"
        >
          <Say voice="Polly.Joanna-Neural">
            I'm listening.
          </Say>
        </Gather>
      </Response>
    `;
  }

  // Find projects associated with a vendor phone number
  private async findVendorProjects(phoneNumber: string): Promise<ProjectContext[]> {
    const projects: ProjectContext[] = [];
    
    for (const [id, project] of this.projectDatabase) {
      // In real implementation, check database for vendor phone
      projects.push(project);
    }
    
    return projects.sort((a, b) => {
      // Sort by urgency
      const urgencyOrder = { immediate: 0, this_week: 1, this_month: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  // Save conversation state to database
  private async saveConversationState(state: ConversationState) {
    try {
      await supabase.from('ai_conversations').upsert({
        call_sid: state.callSid,
        project_id: state.projectContext.projectId,
        vendor_name: state.projectContext.vendorInfo.name,
        vendor_company: state.projectContext.vendorInfo.company,
        conversation_history: state.conversationHistory,
        vendor_mood: state.vendorMood,
        deal_probability: state.dealProbability,
        key_points: state.keyPoints,
        vendor_concerns: state.vendorConcerns,
        agreed_terms: state.agreedTerms,
        next_steps: state.nextSteps,
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  // Handle unknown calls
  private handleUnknownCall(vendorSpeech: string): string {
    return `
      <Response>
        <Say voice="Polly.Joanna-Neural">
          I apologize, but I don't have the context for this call. 
          Let me connect you with a human representative who can assist you better.
        </Say>
        <Dial>+16783253060</Dial>
      </Response>
    `;
  }

  // Get fallback response if AI fails
  private getFallbackResponse(vendorInput: string): string {
    const input = vendorInput.toLowerCase();
    
    if (input.includes('price') || input.includes('cost') || input.includes('rate')) {
      return "We're prepared to pay premium rates for quality work. Based on the project scope, we're looking at top market rates plus performance bonuses. What are your current rates?";
    }
    
    if (input.includes('when') || input.includes('start') || input.includes('timeline')) {
      return "We're flexible on the exact start date, but this is a priority project. What's your earliest availability? We can work around your schedule for the right partner.";
    }
    
    if (input.includes('busy') || input.includes('booked')) {
      return "I understand you're in high demand, which is exactly why we want you. Would you consider prioritizing this project if we made it worth your while? We can discuss premium rates and flexible scheduling.";
    }
    
    return "That's a great point. Let me address that specifically for this project. Can you tell me more about your concern so I can provide the best solution?";
  }

  // Generate post-call summary and follow-up
  async generateCallSummary(callSid: string): Promise<any> {
    const state = this.activeConversations.get(callSid);
    if (!state) return null;

    const summary = {
      projectId: state.projectContext.projectId,
      vendor: state.projectContext.vendorInfo,
      callDuration: state.conversationHistory.length * 15, // Approximate seconds
      dealProbability: state.dealProbability,
      vendorMood: state.vendorMood,
      keyPoints: state.keyPoints,
      concerns: state.vendorConcerns,
      agreements: state.agreedTerms,
      nextSteps: state.nextSteps,
      recommendedFollowUp: this.generateFollowUpRecommendation(state),
      transcriptHighlights: this.extractHighlights(state)
    };

    // Send follow-up SMS with summary
    await this.sendFollowUpSMS(state);

    return summary;
  }

  // Generate follow-up recommendations
  private generateFollowUpRecommendation(state: ConversationState): string {
    if (state.dealProbability > 80) {
      return "Send contract immediately. Follow up within 2 hours. This deal is ready to close.";
    }
    if (state.dealProbability > 60) {
      return "Send detailed project specs. Schedule site visit. Follow up tomorrow morning.";
    }
    if (state.dealProbability > 40) {
      return "Address concerns via email. Offer to meet in person. Follow up in 2 days.";
    }
    return "Vendor needs more time. Send general company portfolio. Follow up next week.";
  }

  // Extract conversation highlights
  private extractHighlights(state: ConversationState): string[] {
    return state.conversationHistory
      .filter(h => h.sentiment === 'positive' || h.speaker === 'AI')
      .slice(-5)
      .map(h => `${h.speaker}: ${h.text.substring(0, 100)}...`);
  }

  // Send intelligent follow-up SMS
  private async sendFollowUpSMS(state: ConversationState) {
    let message = `Thank you for speaking with our AI assistant about the ${state.projectContext.projectType} project.\n\n`;
    
    if (state.dealProbability > 60) {
      message += `✅ Based on our conversation, here's what we agreed on:\n`;
      state.agreedTerms.forEach(term => {
        message += `• ${term}\n`;
      });
    }
    
    message += `\n📋 Next Steps:\n`;
    message += `• Detailed project specs being sent to your email\n`;
    message += `• Contract proposal within 2 hours\n`;
    message += `• Direct line for questions: ${process.env.TWILIO_PHONE_NUMBER}\n`;
    message += `\nProject ID: ${state.projectContext.projectId}`;

    await twilioClient.messages.create({
      body: message,
      to: state.projectContext.vendorInfo.company, // Should be phone number
      from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER
    });
  }
}

export default new BillionaireAIVoiceService();