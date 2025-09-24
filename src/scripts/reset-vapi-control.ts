/**
 * Reset VAPI control over the Twilio number
 * This will make VAPI update the Twilio webhooks to point to VAPI's servers
 * Run: npx ts-node src/scripts/reset-vapi-control.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function resetVAPIControl() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  
  console.log('🔄 Resetting VAPI control over Twilio numbers...');
  
  try {
    // Get all VAPI phone numbers
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
    
    for (const phone of phoneNumbers) {
      console.log(`\n📱 Resetting control for: ${phone.number}`);
      
      // Update the phone to ensure VAPI has full control
      // This should trigger VAPI to update Twilio's webhooks
      const updateResponse = await axios.patch(
        `https://api.vapi.ai/phone-number/${phone.id}`,
        {
          // Re-provide Twilio credentials so VAPI can update the webhooks
          twilioAccountSid: TWILIO_ACCOUNT_SID,
          twilioAuthToken: TWILIO_AUTH_TOKEN,
          // Ensure serverUrl is set for assistant configuration
          serverUrl: 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook',
          // No fixed assistant - use transient
          assistantId: null
        },
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`   ✅ VAPI control restored`);
      console.log(`   📝 VAPI will handle all inbound calls`);
    }
    
    console.log('\n✨ Done! VAPI now controls the Twilio webhooks');
    console.log('\n⚠️  IMPORTANT: Do NOT set any webhook URL in Twilio Console');
    console.log('    Let VAPI manage the Twilio webhooks automatically');
    
  } catch (error: any) {
    console.error('❌ Failed:', error.response?.data || error.message);
  }
}

// Run the reset
resetVAPIControl();