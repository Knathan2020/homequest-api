/**
 * Force VAPI to take control of the Twilio number
 * Run: npx ts-node src/scripts/force-vapi-control.ts
 */

import axios from 'axios';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

async function forceVAPIControl() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
  
  const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  
  console.log('🔧 Forcing VAPI to control the Twilio number...\n');
  
  try {
    // Step 1: Delete the number from VAPI
    console.log('1️⃣ Removing number from VAPI...');
    try {
      await axios.delete(
        'https://api.vapi.ai/phone-number/889151da-ac44-4296-a9cf-568a414815a0',
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`
          }
        }
      );
      console.log('   ✅ Removed from VAPI');
    } catch (e) {
      console.log('   ⚠️  Number might not exist in VAPI');
    }
    
    // Step 2: Update Twilio number to point to VAPI
    console.log('\n2️⃣ Updating Twilio webhook to VAPI...');
    
    // Find the phone number in Twilio
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: PHONE_NUMBER
    });
    
    if (numbers.length === 0) {
      throw new Error('Phone number not found in Twilio');
    }
    
    const twilioNumber = numbers[0];
    
    // Update to VAPI's webhook
    await twilioNumber.update({
      voiceUrl: 'https://api.vapi.ai/twilio/incoming-call',
      voiceMethod: 'POST',
      statusCallbackUrl: 'https://api.vapi.ai/twilio/call-status',
      statusCallbackMethod: 'POST'
    });
    
    console.log('   ✅ Twilio webhook updated to VAPI');
    
    // Step 3: Re-import to VAPI
    console.log('\n3️⃣ Re-importing number to VAPI...');
    
    const importResponse = await axios.post(
      'https://api.vapi.ai/phone-number',
      {
        provider: 'twilio',
        number: PHONE_NUMBER,
        name: 'HomeQuest Main',
        twilioAccountSid: TWILIO_ACCOUNT_SID,
        twilioAuthToken: TWILIO_AUTH_TOKEN,
        serverUrl: 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook',
        assistantId: null  // Use transient assistants
      },
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('   ✅ Number re-imported to VAPI');
    console.log('   📞 VAPI Phone ID:', importResponse.data.id);
    
    // Step 4: Verify
    console.log('\n4️⃣ Verifying configuration...');
    
    const verifyResponse = await twilioClient.incomingPhoneNumbers(twilioNumber.sid).fetch();
    
    console.log('\n✅ SUCCESS! Configuration complete:');
    console.log('   Phone: ' + PHONE_NUMBER);
    console.log('   Voice URL: ' + verifyResponse.voiceUrl);
    console.log('   VAPI ID: ' + importResponse.data.id);
    console.log('\n🎉 VAPI now controls inbound calls with AI voices!');
    console.log('📞 Test by calling: ' + PHONE_NUMBER);
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

forceVAPIControl();