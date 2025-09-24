// Conversational AI Service for Natural Phone Calls
// Uses Twilio with OpenAI for dynamic conversations

import twilio from 'twilio';
import OpenAI from 'openai';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || 'ACdced5b7ba48a5d47222ee6c2fe041419',
  process.env.TWILIO_AUTH_TOKEN || 'b744e1efe1c156fd8f391be7785aa4a1'
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

interface ConversationContext {
  callerName: string;
  vendorName: string;
  purpose: string;
  projectDetails?: any;
  conversationHistory: string[];
}

class ConversationalAIService {
  private conversations: Map<string, ConversationContext> = new Map();

  // Generate dynamic response based on conversation context
  async generateResponse(callSid: string, vendorInput: string): Promise<string> {
    const context = this.conversations.get(callSid);
    if (!context) return "I'm sorry, I couldn't find our conversation context.";

    try {
      // Add vendor's response to history
      context.conversationHistory.push(`Vendor: ${vendorInput}`);

      // Generate AI response using OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are ${context.callerName} from HomeQuest Construction, having a phone conversation with ${context.vendorName}. 
            You're calling about ${context.purpose}. 
            Keep responses natural, brief (1-2 sentences), and conversational.
            Ask follow-up questions when appropriate.
            Sound like a real person, not a robot.
            If they ask about specific dates or details, mention you'll send them via text.`
          },
          {
            role: "user",
            content: `Conversation so far:\n${context.conversationHistory.join('\n')}\n\nVendor just said: "${vendorInput}"\n\nYour natural response:`
          }
        ],
        max_tokens: 100,
        temperature: 0.8
      });

      const response = completion.choices[0].message.content || "Could you repeat that please?";
      context.conversationHistory.push(`Caller: ${response}`);
      
      return response;
    } catch (error) {
      console.error('Error generating response:', error);
      return "I'll send you all the details via text message. Thank you for your time!";
    }
  }

  // Start a conversational call with AI
  async startConversationalCall(params: {
    teamId: string;
    to: string;
    callerName: string;
    vendorName: string;
    purpose: string;
    projectDetails?: any;
  }) {
    try {
      // Store conversation context
      const callSid = `temp_${Date.now()}`;
      
      // Create webhook URL for handling responses
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL || 'https://miniature-space-acorn-5gwxr74xqpxhp464-4000.app.github.dev'}/api/twilio/voice-response`;
      
      // Initial greeting with ability to respond
      const call = await twilioClient.calls.create({
        to: params.to,
        from: process.env.TWILIO_PHONE_NUMBER || '+16783253060',
        twiml: `
          <Response>
            <Say voice="Polly.Matthew">
              Hello ${params.vendorName}, this is ${params.callerName} from HomeQuest Construction.
            </Say>
            <Pause length="1"/>
            <Say voice="Polly.Matthew">
              I'm calling about ${params.purpose}. Do you have a few minutes to discuss this?
            </Say>
            <Gather input="speech" timeout="3" speechTimeout="auto" action="${webhookUrl}">
              <Say>I'm listening.</Say>
            </Gather>
          </Response>
        `,
        statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/status/${params.teamId}`,
        statusCallbackEvent: ['completed']
      });

      // Store context with actual call SID
      this.conversations.set(call.sid, {
        callerName: params.callerName,
        vendorName: params.vendorName,
        purpose: params.purpose,
        projectDetails: params.projectDetails,
        conversationHistory: [
          `Caller: Hello ${params.vendorName}, this is ${params.callerName} from HomeQuest Construction.`,
          `Caller: I'm calling about ${params.purpose}. Do you have a few minutes to discuss this?`
        ]
      });

      console.log(`🤖 Started conversational AI call: ${call.sid}`);
      
      return {
        success: true,
        callSid: call.sid,
        message: 'Conversational AI call initiated'
      };
    } catch (error) {
      console.error('Error starting conversational call:', error);
      throw error;
    }
  }

  // Handle voice responses during the call
  async handleVoiceResponse(callSid: string, speechResult: string): Promise<string> {
    const response = await this.generateResponse(callSid, speechResult);
    
    // Generate TwiML to continue conversation
    return `
      <Response>
        <Say voice="Polly.Matthew">${response}</Say>
        <Gather input="speech" timeout="3" speechTimeout="auto" action="${process.env.WEBHOOK_BASE_URL}/api/twilio/voice-response">
          <Say>Please go ahead.</Say>
        </Gather>
      </Response>
    `;
  }

  // Clean up conversation after call ends
  cleanupConversation(callSid: string) {
    this.conversations.delete(callSid);
  }
}

export default new ConversationalAIService();