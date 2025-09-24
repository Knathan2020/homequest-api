/**
 * Import Twilio number to VAPI
 * Run: npx ts-node src/scripts/import-twilio-to-vapi.ts
 */

import axios from 'axios';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

async function importTwilioToVAPI() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
  const WEBHOOK_URL = 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';
  
  const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  
  console.log('📞 Importing Twilio number to VAPI...\n');
  
  try {
    // Step 1: Update Twilio webhook to VAPI
    console.log('1️⃣ Updating Twilio webhooks...');
    
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: PHONE_NUMBER
    });
    
    if (numbers.length === 0) {
      throw new Error('Phone number not found in Twilio');
    }
    
    const twilioNumber = numbers[0];
    
    // Update to VAPI's webhook URL for Twilio
    await twilioNumber.update({
      voiceUrl: 'https://api.vapi.ai/twilio/incoming-call',
      voiceMethod: 'POST',
      statusCallbackUrl: 'https://api.vapi.ai/twilio/call-status',
      statusCallbackMethod: 'POST'
    });
    
    console.log('   ✅ Twilio webhooks updated');
    
    // Step 2: Import to VAPI
    console.log('\n2️⃣ Importing number to VAPI...');
    
    const importResponse = await axios.post(
      'https://api.vapi.ai/phone-number',
      {
        provider: 'twilio',
        number: PHONE_NUMBER,
        name: 'HomeQuest Main',
        twilioAccountSid: TWILIO_ACCOUNT_SID,
        twilioAuthToken: TWILIO_AUTH_TOKEN,
        serverUrl: WEBHOOK_URL,
        assistantId: null  // Use transient assistants
      },
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const phoneData = importResponse.data;
    
    console.log('   ✅ Number imported to VAPI');
    console.log('   📞 VAPI Phone ID:', phoneData.id);
    console.log('   📱 Phone Number:', phoneData.number);
    console.log('   🔗 Server URL:', phoneData.serverUrl);
    
    // Step 3: Save the new phone ID
    console.log('\n3️⃣ Important: Update your .env file with:');
    console.log(`   VAPI_PHONE_NUMBER=${phoneData.id}`);
    
    // Step 4: Test instructions
    console.log('\n✅ SUCCESS! VAPI now controls inbound calls');
    console.log('\n📞 Test Instructions:');
    console.log('1. Call: ' + PHONE_NUMBER);
    console.log('2. You should hear an AI assistant');
    console.log('3. Check server logs for webhook activity');
    console.log('\n🔗 Webhook URL: ' + WEBHOOK_URL);
    console.log('   Make sure your server is running on port 4000');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    
    if (error.response?.status === 400) {
      console.log('\n⚠️  Phone might already be imported. Try deleting it first.');
      console.log('   Or the credentials might be incorrect.');
    }
  }
}

importTwilioToVAPI();