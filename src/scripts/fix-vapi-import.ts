/**
 * Fix VAPI phone import with correct configuration
 * Run: npx ts-node src/scripts/fix-vapi-import.ts
 */

import axios from 'axios';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

async function fixVAPIImport() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const PHONE_NUMBER = '+16783253060';
  const PHONE_ID = '86c3e687-5341-41b0-ace4-99de82452de0';
  const ASSISTANT_ID = '29cb6658-7227-4779-b8df-315de7f69c73';
  const WEBHOOK_URL = 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';
  
  console.log('🔧 Fixing VAPI Phone Import...\n');
  
  try {
    // Step 1: Delete the existing phone from VAPI
    console.log('1️⃣ Deleting existing phone from VAPI...');
    
    try {
      await axios.delete(
        `https://api.vapi.ai/phone-number/${PHONE_ID}`,
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`
          }
        }
      );
      console.log('   ✅ Phone deleted from VAPI');
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('   ℹ️  Phone already deleted or not found');
      } else {
        console.log('   ⚠️  Could not delete:', error.response?.data?.message || error.message);
      }
    }
    
    // Step 2: Re-import the phone with proper configuration
    console.log('\n2️⃣ Re-importing phone to VAPI...');
    
    const importData = {
      provider: 'twilio',
      number: PHONE_NUMBER,
      twilioAccountSid: TWILIO_ACCOUNT_SID,
      twilioAuthToken: TWILIO_AUTH_TOKEN,
      name: 'HomeQuest Main Line',
      assistantId: ASSISTANT_ID,
      serverUrl: WEBHOOK_URL
    };
    
    console.log('   Import configuration:');
    console.log('   Number:', PHONE_NUMBER);
    console.log('   Account SID:', TWILIO_ACCOUNT_SID);
    console.log('   Assistant ID:', ASSISTANT_ID);
    console.log('   Server URL:', WEBHOOK_URL);
    
    try {
      const importResponse = await axios.post(
        'https://api.vapi.ai/phone-number',
        importData,
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const phoneData = importResponse.data;
      console.log('\n   ✅ Phone successfully imported!');
      console.log('   New Phone ID:', phoneData.id);
      console.log('   Number:', phoneData.number);
      console.log('   Provider:', phoneData.provider);
      console.log('   Assistant:', phoneData.assistantId);
      console.log('   Server URL:', phoneData.serverUrl);
      
      // Step 3: Verify Twilio webhooks
      console.log('\n3️⃣ Verifying Twilio webhooks...');
      
      const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const numbers = await twilioClient.incomingPhoneNumbers.list({
        phoneNumber: PHONE_NUMBER
      });
      
      if (numbers.length > 0) {
        const twilioNumber = numbers[0];
        console.log('   Voice URL:', twilioNumber.voiceUrl);
        console.log('   Status Callback:', twilioNumber.statusCallback);
        
        if (twilioNumber.voiceUrl?.includes('api.vapi.ai')) {
          console.log('   ✅ Twilio webhooks are pointing to VAPI');
        } else {
          console.log('   ⚠️  Twilio webhooks may need manual update');
        }
      }
      
      console.log('\n✅ SUCCESS! Phone is re-imported to VAPI');
      console.log('\n📞 Test Instructions:');
      console.log('1. Call: ' + PHONE_NUMBER);
      console.log('2. You should hear the AI assistant');
      console.log('3. Check server logs for webhook activity');
      
      console.log('\n⚠️  IMPORTANT: Update your .env file:');
      console.log(`VAPI_PHONE_NUMBER=${phoneData.id}`);
      
    } catch (error: any) {
      console.error('❌ Import failed:', error.response?.data || error.message);
      
      if (error.response?.data?.message?.includes('already exists')) {
        console.log('\n⚠️  Phone already exists in VAPI');
        console.log('Try running the force-vapi-control.ts script instead');
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

fixVAPIImport();