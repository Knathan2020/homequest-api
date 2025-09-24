/**
 * Setup default VAPI assistant for phone number
 * This enables the assistant-request webhook to fire
 * Run: npx ts-node src/scripts/setup-vapi-assistant.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function setupVAPIAssistant() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const PHONE_ID = '86c3e687-5341-41b0-ace4-99de82452de0';
  const WEBHOOK_URL = 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';
  
  console.log('🤖 Setting up VAPI Assistant...\n');
  
  try {
    // Step 1: Create a minimal default assistant
    console.log('1️⃣ Creating default assistant...');
    
    const assistantResponse = await axios.post(
      'https://api.vapi.ai/assistant',
      {
        name: 'HomeQuest Default Receptionist',
        model: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: 'You are a professional receptionist. Be helpful and friendly. Ask for their name and the purpose of their call.'
            }
          ]
        },
        voice: {
          provider: '11labs',
          voiceId: 'OYTbf65OHHFELVut7v2H', // Hope voice
          model: 'eleven_turbo_v2'
        },
        firstMessage: 'Thank you for calling. How may I help you today?',
        serverUrl: WEBHOOK_URL, // This will allow override
        serverUrlSecret: null
      },
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const assistant = assistantResponse.data;
    console.log('   ✅ Assistant created with ID:', assistant.id);
    
    // Step 2: Update phone number to use this assistant
    console.log('\n2️⃣ Assigning assistant to phone number...');
    
    const phoneResponse = await axios.patch(
      `https://api.vapi.ai/phone-number/${PHONE_ID}`,
      {
        assistantId: assistant.id,
        serverUrl: WEBHOOK_URL // Keep server URL for override
      },
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('   ✅ Assistant assigned to phone number');
    
    // Step 3: Verify configuration
    console.log('\n3️⃣ Verifying configuration...');
    
    const verifyResponse = await axios.get(
      `https://api.vapi.ai/phone-number/${PHONE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );
    
    const phoneData = verifyResponse.data;
    console.log('\n✅ Phone Configuration Updated:');
    console.log('  Phone:', phoneData.number);
    console.log('  Assistant ID:', phoneData.assistantId);
    console.log('  Server URL:', phoneData.serverUrl);
    console.log('  Provider:', phoneData.provider);
    
    console.log('\n📞 IMPORTANT: How it works now:');
    console.log('1. When someone calls +16783253060');
    console.log('2. VAPI will use the default assistant');
    console.log('3. BUT will also call our webhook at:', WEBHOOK_URL);
    console.log('4. Our webhook can override with a dynamic assistant');
    console.log('5. This allows per-company customization');
    
    console.log('\n🔥 Ready to test!');
    console.log('Call +16783253060 and watch the server logs');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      console.log('\n📋 Error details:', error.response.data.error);
    }
  }
}

setupVAPIAssistant();