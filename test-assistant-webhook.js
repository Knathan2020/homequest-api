/**
 * Test the Vapi assistant-request webhook locally
 */

const axios = require('axios');

async function testAssistantWebhook() {
  const webhookUrl = 'http://localhost:4000/api/vapi/webhooks/assistant-request';

  // Simulate Vapi's assistant-request payload
  const payload = {
    call: {
      id: 'test-call-123',
      customer: {
        number: '+11234567890'
      }
    },
    phoneNumber: {
      number: '+18142610584' // The HomeQuest Construction number
    }
  };

  console.log('🧪 Testing assistant-request webhook...');
  console.log('📞 Phone number:', payload.phoneNumber.number);
  console.log('');

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Webhook responded successfully!');
    console.log('');
    console.log('📋 Response data:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.assistant) {
      console.log('');
      console.log('🤖 Assistant configured:');
      console.log('  Name:', response.data.assistant.name);
      console.log('  First message:', response.data.assistant.firstMessage);
      console.log('  Model:', response.data.assistant.model.model);
      console.log('  Voice:', response.data.assistant.voice.voiceId);
      console.log('  Tools:', response.data.assistant.model.tools?.length || 0);
    }
  } catch (error) {
    console.error('❌ Webhook test failed!');
    console.error('');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Connection refused - is the server running?');
      console.error('Run: npm run dev');
    } else {
      console.error('Error:', error.message);
    }
  }
}

testAssistantWebhook();
