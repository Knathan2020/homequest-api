/**
 * Test webhook endpoint manually
 */

import axios from 'axios';

async function testWebhook() {
  try {
    console.log('🧪 Testing webhook endpoint...');

    const testData = {
      type: 'transcript',
      call: {
        id: 'test-call-123'
      },
      transcript: {
        role: 'assistant',
        text: 'Hello, this is a test transcript.',
        confidence: 0.95,
        timestamp: new Date().toISOString()
      }
    };

    const response = await axios.post(
      'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook',
      testData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Webhook test successful:', response.status);
    console.log('Response:', response.data);

  } catch (error: any) {
    console.error('❌ Webhook test failed:', error.response?.data || error.message);
  }
}

testWebhook();