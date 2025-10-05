/**
 * EMERGENCY FIX - Configure Vapi Phone to Use Dynamic Assistant
 * Run: npx ts-node fix-vapi-now.ts
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY || process.env.VAPI_PRIVATE_KEY;
const WEBHOOK_URL = 'https://homequest-api-1.onrender.com';

async function fixVapi() {
  console.log('🚨 EMERGENCY FIX - Configuring Vapi Phone\n');

  if (!VAPI_API_KEY) {
    console.error('❌ Error: VAPI_API_KEY not found in .env file');
    console.log('\nAdd this to your .env file:');
    console.log('VAPI_API_KEY=your_api_key_here');
    return;
  }

  try {
    // Step 1: List all phones
    console.log('1️⃣ Fetching your Vapi phone numbers...\n');
    const response = await axios.get('https://api.vapi.ai/phone-number', {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });

    const phones = response.data;
    console.log(`Found ${phones.length} phone number(s):\n`);

    phones.forEach((phone: any, i: number) => {
      console.log(`${i + 1}. ${phone.number}`);
      console.log(`   ID: ${phone.id}`);
      console.log(`   Current Assistant ID: ${phone.assistantId || 'None'}`);
      console.log(`   Current Server URL: ${phone.serverUrl || 'None'}`);
      console.log('');
    });

    // Step 2: Update each phone
    console.log('\n2️⃣ Fixing phone configuration...\n');

    for (const phone of phones) {
      console.log(`Updating ${phone.number}...`);

      try {
        await axios.patch(
          `https://api.vapi.ai/phone-number/${phone.id}`,
          {
            assistantId: null,  // Remove static assistant
            serverUrl: `${WEBHOOK_URL}/api/vapi/webhook`  // Use dynamic webhook
          },
          {
            headers: {
              'Authorization': `Bearer ${VAPI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`✅ Fixed ${phone.number}\n`);
      } catch (error: any) {
        console.error(`❌ Failed to update ${phone.number}:`);
        console.error(error.response?.data || error.message);
        console.log('');
      }
    }

    // Step 3: Verify
    console.log('3️⃣ Verifying...\n');
    const verify = await axios.get('https://api.vapi.ai/phone-number', {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });

    verify.data.forEach((phone: any) => {
      const hasWebhook = phone.serverUrl?.includes('/api/vapi/webhook');
      const noStaticAssistant = !phone.assistantId;
      const status = (hasWebhook && noStaticAssistant) ? '✅ WORKING' : '❌ NOT FIXED';

      console.log(`${status} ${phone.number}`);
      console.log(`   Assistant ID: ${phone.assistantId || 'None (correct!)'}`);
      console.log(`   Webhook: ${phone.serverUrl || 'NOT SET'}`);
      console.log('');
    });

    console.log('\n✅ DONE!');
    console.log('\n📞 NOW TEST:');
    console.log('   1. Call your number');
    console.log('   2. Say: "I need to schedule an appointment"');
    console.log('   3. AI should now use the scheduleAppointment function!');

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

fixVapi();
