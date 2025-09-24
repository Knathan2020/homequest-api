/**
 * Configure webhook for existing VAPI phone number
 * Run this to add transcript capability to your existing phone
 */

import axios from 'axios';

const VAPI_API_KEY = process.env.VAPI_API_KEY || '';
const VAPI_PHONE_ID = '051ecb0e-0db4-4bbb-96d7-4b47b8ec2f94'; // Your existing phone ID from the dashboard
const WEBHOOK_URL = 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';

async function configureWebhook() {
  try {
    console.log(`📞 Configuring webhook for phone: ${VAPI_PHONE_ID}`);
    console.log(`🔗 Webhook URL: ${WEBHOOK_URL}`);

    const response = await axios.patch(
      `https://api.vapi.ai/phone-number/${VAPI_PHONE_ID}`,
      {
        serverUrl: WEBHOOK_URL,
        serverUrlSecret: null
      },
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Webhook configured successfully!');
    console.log('📋 Response:', response.data);

    console.log('\n🎯 Next steps:');
    console.log('1. Make a test call to +1 (470) 570-9476');
    console.log('2. Check your server logs for webhook events');
    console.log('3. View live transcripts in the Transcript tab');

  } catch (error: any) {
    console.error('❌ Failed to configure webhook:');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      console.log('\n💡 Check your VAPI_API_KEY environment variable');
    }
  }
}

configureWebhook();