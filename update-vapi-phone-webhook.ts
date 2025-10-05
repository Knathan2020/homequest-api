/**
 * Update Vapi phone number to use dynamic assistant webhook
 * Run: npx ts-node update-vapi-phone-webhook.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_PHONE_ID = '86d21bb9-4562-4fcf-a834-cbfdccc0de5f';
const WEBHOOK_URL = 'https://homequest-api-1.onrender.com/api/vapi-webhooks/vapi/webhooks/assistant-request';

async function updateVapiPhone() {
  if (!VAPI_API_KEY) {
    console.error('❌ VAPI_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('🔧 Updating Vapi phone number configuration...\n');
  console.log('Phone ID:', VAPI_PHONE_ID);
  console.log('Webhook URL:', WEBHOOK_URL);
  console.log('');

  try {
    // First, get the current configuration
    console.log('1️⃣ Fetching current phone configuration...');
    const getResponse = await axios.get(
      `https://api.vapi.ai/phone-number/${VAPI_PHONE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );

    const currentConfig = getResponse.data;
    console.log('✅ Current configuration:');
    console.log('   Number:', currentConfig.number);
    console.log('   Provider:', currentConfig.provider);
    console.log('   Assistant ID:', currentConfig.assistantId || 'None');
    console.log('   Server URL:', currentConfig.serverUrl || 'None');
    console.log('');

    // Update to use serverUrl for dynamic assistant
    console.log('2️⃣ Updating phone to use dynamic assistant...');
    const updatePayload = {
      serverUrl: WEBHOOK_URL,
      assistantId: null // Remove static assistant, use dynamic
    };

    const updateResponse = await axios.patch(
      `https://api.vapi.ai/phone-number/${VAPI_PHONE_ID}`,
      updatePayload,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Phone number updated successfully!');
    console.log('');
    console.log('New configuration:');
    console.log('   Number:', updateResponse.data.number);
    console.log('   Server URL:', updateResponse.data.serverUrl);
    console.log('   Assistant ID:', updateResponse.data.assistantId || 'None (using dynamic)');
    console.log('');
    console.log('🎉 Done! Call', updateResponse.data.number, 'to test the dynamic assistant');

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);

    if (error.response?.status === 404) {
      console.error('\nPhone number not found. Available phone IDs:');
      console.error('Run: npx ts-node src/scripts/check-vapi-status.ts');
    }
  }
}

updateVapiPhone();
