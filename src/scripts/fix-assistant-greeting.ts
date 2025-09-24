/**
 * Fix VAPI assistant greeting and end call behavior
 * Run: npx ts-node src/scripts/fix-assistant-greeting.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function fixAssistantGreeting() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const ASSISTANT_ID = '29cb6658-7227-4779-b8df-315de7f69c73';
  
  console.log('🔧 Fixing Assistant Greeting and End Call Behavior...\n');
  
  try {
    const updateData = {
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are a professional receptionist for a construction company. When answering calls, greet callers professionally without mentioning any personal names. Be helpful, ask for their name and the purpose of their call. If they need to speak to someone specific, offer to transfer them or take a message. Always be courteous and professional. When the caller says goodbye or indicates they want to end the call, respond politely and end the call.'
          }
        ]
      },
      voice: {
        provider: '11labs',
        voiceId: 'ewxUvnyvvOehYjKjUVKC', // Kentrill
        model: 'eleven_turbo_v2',
        stability: 0.5,
        similarityBoost: 0.75
      },
      firstMessage: 'Thank you for calling. How may I help you today?',
      endCallMessage: 'Thank you for calling. Have a great day!',
      endCallFunctionEnabled: true,
      endCallPhrases: ['goodbye', 'bye', 'have a good day', 'talk to you later', 'see you', 'take care', 'thanks for calling'],
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
      responseDelaySeconds: 0.5
    };
    
    const response = await axios.patch(
      `https://api.vapi.ai/assistant/${ASSISTANT_ID}`,
      updateData,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Assistant updated successfully!');
    console.log('\n📞 New behavior:');
    console.log('• Greeting: "Thank you for calling. How may I help you today?"');
    console.log('• Voice: Kentrill (professional male voice)');
    console.log('• Will end call when caller says goodbye');
    console.log('• 30 second silence timeout');
    console.log('• Max call duration: 10 minutes');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

fixAssistantGreeting();