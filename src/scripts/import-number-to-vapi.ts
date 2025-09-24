/**
 * Script to import your Twilio phone number to VAPI
 * This enables VAPI to handle inbound calls with AI voices
 * 
 * Run this script: npx ts-node src/scripts/import-number-to-vapi.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function importNumberToVAPI() {
  const TWILIO_PHONE_NUMBER = '+14042743100'; // YOUR TWILIO NUMBER - CHANGE THIS!
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  
  // Your webhook URL - VAPI will call this to get assistant config
  const WEBHOOK_URL = process.env.NODE_ENV === 'production' 
    ? 'https://api.homequesttech.com/api/vapi/webhook'
    : 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';
  
  console.log('🚀 Importing Twilio number to VAPI...');
  console.log(`📞 Number: ${TWILIO_PHONE_NUMBER}`);
  console.log(`🔗 Webhook: ${WEBHOOK_URL}`);
  
  try {
    // Step 1: Import the number to VAPI
    const importResponse = await axios.post(
      'https://api.vapi.ai/phone-number',
      {
        provider: 'twilio',
        number: TWILIO_PHONE_NUMBER,
        name: 'HomeQuest Main Line',
        twilioAccountSid: TWILIO_ACCOUNT_SID,
        twilioAuthToken: TWILIO_AUTH_TOKEN,
        // This tells VAPI where to get assistant configuration
        serverUrl: WEBHOOK_URL,
        // Don't assign a fixed assistant - we'll use transient ones
        assistantId: null
      },
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Number imported successfully!');
    console.log('📊 VAPI Phone ID:', importResponse.data.id);
    console.log('\n✨ VAPI will now handle inbound calls with AI voices!');
    console.log('📞 Test it by calling:', TWILIO_PHONE_NUMBER);
    
    // Step 2: Verify the import
    console.log('\n🔍 Verifying import...');
    const verifyResponse = await axios.get(
      `https://api.vapi.ai/phone-number/${importResponse.data.id}`,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );
    
    console.log('📋 Phone configuration:', JSON.stringify(verifyResponse.data, null, 2));
    
  } catch (error: any) {
    console.error('❌ Failed to import number:', error.response?.data || error.message);
    
    if (error.response?.data?.message?.includes('already exists')) {
      console.log('\n💡 This number might already be imported to VAPI.');
      console.log('Check your VAPI dashboard: https://dashboard.vapi.ai');
    }
  }
}

// Run the import
importNumberToVAPI();