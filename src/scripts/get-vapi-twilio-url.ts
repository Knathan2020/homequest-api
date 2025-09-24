/**
 * Get the correct Twilio webhook URL from VAPI
 * Run: npx ts-node src/scripts/get-vapi-twilio-url.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function getVAPITwilioURL() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const PHONE_ID = '889151da-ac44-4296-a9cf-568a414815a0';
  
  try {
    // Get phone details
    const response = await axios.get(
      `https://api.vapi.ai/phone-number/${PHONE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );
    
    const phoneData = response.data;
    console.log('\n📞 Phone Configuration:');
    console.log('Number:', phoneData.number);
    console.log('Provider:', phoneData.provider);
    console.log('Status:', phoneData.status);
    console.log('Server URL:', phoneData.serverUrl);
    
    // The correct Twilio webhook URL for VAPI
    console.log('\n✅ Set this in Twilio Console as Voice Webhook URL:');
    
    // For Twilio numbers imported to VAPI, you should use your own server
    // VAPI will handle it through the import
    if (phoneData.provider === 'twilio') {
      console.log('\n⚠️  This is a Twilio number imported to VAPI');
      console.log('Option 1: Let VAPI manage it (recommended)');
      console.log('  - VAPI should automatically update Twilio webhooks');
      console.log('  - If not working, try re-importing the number');
      console.log('\nOption 2: Use your server fallback:');
      console.log('  https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/twilio/voice');
      console.log('\nOption 3: Try VAPI\'s Twilio webhook (may not work):');
      console.log('  https://api.vapi.ai/twilio/inbound/' + phoneData.orgId);
    }
    
  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getVAPITwilioURL();