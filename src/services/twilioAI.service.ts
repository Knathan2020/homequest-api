// Twilio AI Calling Service for HomeQuest
// Handles automated vendor calls, bid collection, and scheduling

import twilio from 'twilio';
import { Twilio } from 'twilio';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

// Types
export interface CallConfig {
  to: string;
  vendorName: string;
  callerName: string; // The actual person making the call (e.g., "John Smith")
  callerCompany?: string; // Optional company name
  callerRole?: string; // e.g., "Project Manager", "General Contractor"
  purpose: 'bid_request' | 'schedule_confirm' | 'payment_notify' | 'material_order' | 'inspection_schedule';
  projectDetails?: {
    address?: string;
    phase?: string;
    workType?: string;
    startDate?: string;
    budget?: number;
  };
  language?: 'en' | 'es';
  callback?: string;
}

export interface CallResult {
  callSid: string;
  status: string;
  duration?: number;
  recording?: string;
  transcription?: string;
  aiSummary?: string;
  extractedData?: any;
  vendorResponse?: {
    accepted: boolean;
    bidAmount?: number;
    availability?: string;
    notes?: string;
  };
}

export interface VoiceScript {
  greeting: string;
  purpose: string;
  questions: string[];
  closing: string;
}

class TwilioAIService extends EventEmitter {
  private twilioClient: Twilio;
  private openai: OpenAI;
  private phoneNumber: string;
  private webhookBase: string;
  private isInitialized: boolean = false;

  constructor() {
    super();
    
    // Initialize with environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.webhookBase = process.env.WEBHOOK_BASE_URL || 'https://your-domain.com/api/twilio';
    
    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
      this.isInitialized = true;
    }
    
    // Initialize OpenAI for conversation intelligence
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // Generate AI-powered voice script based on purpose
  async generateVoiceScript(config: CallConfig): Promise<VoiceScript> {
    const callerIntro = config.callerCompany 
      ? `${config.callerName} from ${config.callerCompany}`
      : config.callerName;
    
    const prompts = {
      bid_request: `Generate a professional phone script where ${callerIntro} is calling ${config.vendorName} to request a construction bid.
        Caller: ${config.callerName} (${config.callerRole || 'Project Manager'})
        Project: ${config.projectDetails?.workType} at ${config.projectDetails?.address}
        Phase: ${config.projectDetails?.phase}
        Start Date: ${config.projectDetails?.startDate}
        Budget Range: $${config.projectDetails?.budget}
        
        Make it conversational and personal, as if ${config.callerName} is actually speaking. Include:
        1. Personal greeting from ${config.callerName}
        2. Project overview
        3. Ask for availability and rough estimate
        4. Next steps
        Keep responses under 30 seconds each.`,
      
      schedule_confirm: `Generate a brief confirmation call script where ${config.callerName} is calling ${config.vendorName}.
        Caller: ${config.callerName} (${config.callerRole || 'Project Manager'})
        Confirm they will be at ${config.projectDetails?.address} on ${config.projectDetails?.startDate}
        Work type: ${config.projectDetails?.workType}
        
        Make it personal from ${config.callerName}. Be concise and clear. Get verbal confirmation.`,
      
      payment_notify: `Generate a payment notification script where ${config.callerName} is calling ${config.vendorName}.
        Caller: ${config.callerName} (${config.callerRole || 'Project Manager'})
        Payment amount and method will be provided.
        Be professional and informative, speaking as ${config.callerName}.`
    };

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are creating voice scripts for automated construction vendor calls. Be professional, clear, and conversational. Keep each segment under 30 seconds when spoken."
          },
          {
            role: "user",
            content: prompts[config.purpose] || prompts.bid_request
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const scriptText = completion.choices[0].message.content || '';
      
      // Parse the AI response into structured script
      return this.parseScriptFromAI(scriptText);
    } catch (error) {
      console.error('Error generating voice script:', error);
      return this.getDefaultScript(config);
    }
  }

  // Parse AI-generated text into structured script
  private parseScriptFromAI(text: string): VoiceScript {
    const lines = text.split('\n').filter(line => line.trim());
    
    return {
      greeting: lines[0] || "Hello, this is HomeQuest automated system calling.",
      purpose: lines[1] || "We have a construction project opportunity for you.",
      questions: lines.slice(2, -1),
      closing: lines[lines.length - 1] || "Thank you for your time. We'll follow up via email."
    };
  }

  // Default scripts as fallback
  private getDefaultScript(config: CallConfig): VoiceScript {
    const callerIntro = config.callerCompany 
      ? `${config.callerName} from ${config.callerCompany}`
      : config.callerName;
    
    const scripts = {
      bid_request: {
        greeting: `Hi, is this ${config.vendorName}? This is ${callerIntro}. How are you doing today?`,
        purpose: `I'm calling about a ${config.projectDetails?.workType} project we have coming up at ${config.projectDetails?.address}. We're looking to start around ${config.projectDetails?.startDate}.`,
        questions: [
          "Are you available to take on new projects around that time?",
          "Would you be interested in giving us a bid for this work?",
          "When would be a good time for you to come look at the site?",
          "Do you have any questions about the project?"
        ],
        closing: `Great talking with you. I'll send you the details by email and we can follow up from there. Thanks ${config.vendorName}!`
      },
      schedule_confirm: {
        greeting: `Hi ${config.vendorName}, this is ${config.callerName}. Got a minute?`,
        purpose: `I'm just calling to confirm you're still good for ${config.projectDetails?.workType} at ${config.projectDetails?.address} on ${config.projectDetails?.startDate}.`,
        questions: [
          "Are you still able to make it?",
          "Do you need directions to the site?",
          "Do you have all the materials you need?",
          "Any questions before you come out?"
        ],
        closing: `Perfect! I'll see you there. Call me if anything comes up. Thanks ${config.vendorName}!`
      },
      payment_notify: {
        greeting: `Hi ${config.vendorName}, it's ${config.callerName}. I've got good news for you!`,
        purpose: "Your invoice has been approved and we've sent out the payment. Should hit your account in a couple days.",
        questions: [
          "Did you want me to text you the payment confirmation?",
          "Or would you prefer I email you the details?",
          "Everything good with the work from your end?"
        ],
        closing: `Appreciate your hard work on this project. Talk to you soon!`
      }
    };

    return scripts[config.purpose] || scripts.bid_request;
  }

  // Make an automated call
  async makeCall(config: CallConfig): Promise<CallResult> {
    if (!this.isInitialized) {
      throw new Error('Twilio service not initialized. Check environment variables.');
    }

    try {
      // Generate voice script
      const script = await this.generateVoiceScript(config);
      
      // Create TwiML for the call
      const twiml = this.generateTwiML(script, config);
      
      // Store TwiML for webhook retrieval
      await this.storeTwiMLForCall(config, twiml);
      
      // Make the call
      const call = await this.twilioClient.calls.create({
        to: config.to,
        from: this.phoneNumber,
        url: `${this.webhookBase}/voice/${config.to}`,
        statusCallback: `${this.webhookBase}/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingStatusCallback: `${this.webhookBase}/recording`,
        machineDetection: 'DetectMessageEnd',
        asyncAmd: 'true' as any, // Twilio SDK type issue
        asyncAmdStatusCallback: `${this.webhookBase}/amd`
      });

      // Emit call initiated event
      this.emit('callInitiated', {
        callSid: call.sid,
        to: config.to,
        vendor: config.vendorName,
        purpose: config.purpose
      });

      return {
        callSid: call.sid,
        status: call.status,
        vendorResponse: undefined // Will be updated via webhook
      };
    } catch (error) {
      console.error('Error making call:', error);
      throw error;
    }
  }

  // Generate TwiML for call flow with natural conversation
  private generateTwiML(script: VoiceScript, config: CallConfig): string {
    // Use more natural voice options
    const voiceOptions = {
      'en': 'Polly.Matthew', // Natural male voice
      'en-female': 'Polly.Joanna', // Natural female voice
      'es': 'Polly.Miguel', // Spanish male voice
      'es-female': 'Polly.Penelope' // Spanish female voice
    };
    
    const voice = voiceOptions[config.language || 'en'];
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <!-- Greeting -->
    <Say voice="${voice}">${script.greeting}</Say>
    <Pause length="1"/>
    
    <!-- Listen for response with speech recognition -->
    <Gather input="speech" timeout="3" speechTimeout="auto" 
            action="${this.webhookBase}/speech/${config.to}" method="POST">
        <Say voice="${voice}">I'm listening...</Say>
    </Gather>
    
    <!-- Main purpose -->
    <Say voice="${voice}">${script.purpose}</Say>
    <Pause length="2"/>`;

    // Add conversational questions with speech recognition
    script.questions.forEach((question, index) => {
      twiml += `
    <!-- Question ${index + 1} -->
    <Gather input="speech" timeout="5" speechTimeout="auto" 
            action="${this.webhookBase}/speech/${config.to}?q=${index}" method="POST">
        <Say voice="${voice}">${question}</Say>
    </Gather>
    <Pause length="2"/>`;
    });
    
    twiml += `
    <!-- Allow them to leave a message if needed -->
    <Say voice="${voice}">Feel free to leave me any additional details or questions.</Say>
    <Record maxLength="120" 
            playBeep="true"
            action="${this.webhookBase}/recording/${config.to}" 
            transcribe="true"
            transcribeCallback="${this.webhookBase}/transcription/${config.to}"/>
    
    <!-- Closing -->
    <Say voice="${voice}">${script.closing}</Say>
</Response>`;

    return twiml;
  }

  // Store TwiML for webhook retrieval
  private async storeTwiMLForCall(config: CallConfig, twiml: string): Promise<void> {
    // In production, store in Redis or database
    // For now, using in-memory storage
    global.twilioCallData = global.twilioCallData || {};
    global.twilioCallData[config.to] = {
      config,
      twiml,
      timestamp: new Date()
    };
  }

  // Process call recording with AI
  async processRecording(recordingUrl: string, callSid: string): Promise<any> {
    try {
      // Download and transcribe recording
      const transcription = await this.transcribeRecording(recordingUrl);
      
      // Analyze with AI
      const analysis = await this.analyzeConversation(transcription);
      
      // Extract structured data
      const extractedData = await this.extractVendorResponse(transcription, analysis);
      
      // Update call result
      this.emit('callAnalyzed', {
        callSid,
        transcription,
        analysis,
        extractedData
      });
      
      return {
        transcription,
        aiSummary: analysis,
        extractedData
      };
    } catch (error) {
      console.error('Error processing recording:', error);
      throw error;
    }
  }

  // Transcribe recording
  private async transcribeRecording(recordingUrl: string): Promise<string> {
    // Twilio provides transcription, but we can also use OpenAI Whisper
    try {
      // For now, return placeholder - implement actual transcription
      return "Vendor confirmed availability for the project and quoted $5,000 for the work.";
    } catch (error) {
      console.error('Error transcribing:', error);
      return "";
    }
  }

  // Analyze conversation with AI
  private async analyzeConversation(transcription: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "Analyze this construction vendor call transcription and provide a brief summary of key points, commitments, and any concerns raised."
          },
          {
            role: "user",
            content: transcription
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      });

      return completion.choices[0].message.content || '';
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      return "Unable to analyze conversation";
    }
  }

  // Extract structured vendor response
  private async extractVendorResponse(transcription: string, analysis: string): Promise<any> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `Extract structured data from this vendor call. Return JSON with:
              - accepted: boolean
              - bidAmount: number or null
              - availability: string or null
              - concerns: array of strings
              - nextSteps: array of strings`
          },
          {
            role: "user",
            content: `Transcription: ${transcription}\nAnalysis: ${analysis}`
          }
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content || '{}';
      return JSON.parse(content);
    } catch (error) {
      console.error('Error extracting vendor response:', error);
      return {
        accepted: false,
        bidAmount: null,
        availability: null,
        concerns: [],
        nextSteps: []
      };
    }
  }

  // Send SMS follow-up
  async sendSMS(to: string, message: string): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Twilio service not initialized');
    }

    try {
      const sms = await this.twilioClient.messages.create({
        body: message,
        to,
        from: this.phoneNumber
      });

      this.emit('smsSent', {
        messageSid: sms.sid,
        to,
        message
      });

      return sms;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  }

  // Get call status
  async getCallStatus(callSid: string): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Twilio service not initialized');
    }

    try {
      const call = await this.twilioClient.calls(callSid).fetch();
      return {
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
        direction: call.direction,
        answeredBy: call.answeredBy
      };
    } catch (error) {
      console.error('Error getting call status:', error);
      throw error;
    }
  }

  // List recent calls
  async listRecentCalls(limit: number = 20): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Twilio service not initialized');
    }

    try {
      const calls = await this.twilioClient.calls.list({ limit });
      return calls.map(call => ({
        sid: call.sid,
        to: call.to,
        from: call.from,
        status: call.status,
        startTime: call.startTime,
        duration: call.duration,
        direction: call.direction
      }));
    } catch (error) {
      console.error('Error listing calls:', error);
      return [];
    }
  }
}

// Create singleton instance
const twilioAIService = new TwilioAIService();

export default twilioAIService;