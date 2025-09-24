/**
 * Fix VAPI inbound calls by updating phone number configuration
 * Run: npx ts-node src/scripts/fix-vapi-inbound.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function fixVAPIInbound() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  
  // Your webhook URL
  const WEBHOOK_URL = process.env.NODE_ENV === 'production' 
    ? 'https://api.homequesttech.com/api/vapi/webhook'
    : 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';
  
  console.log('🔧 Fixing VAPI inbound configuration...');
  console.log(`🔗 Webhook URL: ${WEBHOOK_URL}`);
  
  try {
    // Step 1: List all VAPI phone numbers
    const listResponse = await axios.get(
      'https://api.vapi.ai/phone-number',
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );
    
    const phoneNumbers = listResponse.data;
    console.log(`\n📞 Found ${phoneNumbers.length} phone number(s) in VAPI`);
    
    // Step 2: Update each phone number with the correct serverUrl
    for (const phone of phoneNumbers) {
      console.log(`\n📱 Updating: ${phone.number}`);
      console.log(`   ID: ${phone.id}`);
      console.log(`   Current serverUrl: ${phone.serverUrl || 'NOT SET'}`);
      
      // Update the phone number configuration
      const updateResponse = await axios.patch(
        `https://api.vapi.ai/phone-number/${phone.id}`,
        {
          serverUrl: WEBHOOK_URL,
          // Remove any fixed assistantId so we can use transient assistants
          assistantId: null
        },
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`   ✅ Updated with serverUrl: ${WEBHOOK_URL}`);
    }
    
    console.log('\n🎉 Configuration fixed!');
    console.log('\n📞 Test by calling your number. You should see:');
    console.log('   "📞 Vapi webhook received: assistant-request"');
    console.log('   in your server logs');
    
  } catch (error: any) {
    console.error('❌ Failed:', error.response?.data || error.message);
  }
}

// Run the fix
fixVAPIInbound();