/**
 * Test transcript webhook with real VAPI data
 */

import axios from 'axios';

async function testTranscriptWebhook() {
  try {
    console.log('🧪 Testing transcript webhook with real VAPI data...');

    // This is the exact webhook data we received from VAPI
    const realWebhookData = {
      "type": "end-of-call-report",
      "message": {
        "timestamp": 1757966200132,
        "type": "end-of-call-report",
        "call": {
          "id": "external-webhook-test-" + Date.now()
        },
        "messages": [
          {
            "role": "bot",
            "message": "Good. How may I assist you?",
            "time": 1757966162204,
            "endTime": 1757966164354,
            "secondsFromStart": 1.172,
            "duration": 1910
          },
          {
            "role": "user",
            "message": "1 2 3. Testing 1 2 3.",
            "time": 1757966167684,
            "endTime": 1757966169544,
            "secondsFromStart": 6.652,
            "duration": 1860
          },
          {
            "role": "bot",
            "message": "Hello. How may I assist you today?",
            "time": 1757966171034,
            "endTime": 1757966173444,
            "secondsFromStart": 10.002,
            "duration": 2410
          },
          {
            "role": "user",
            "message": "Hello?",
            "time": 1757966179484,
            "endTime": 1757966179984,
            "secondsFromStart": 18.452,
            "duration": 500
          },
          {
            "role": "bot",
            "message": "Hello. How may I assist you today? Could I have your name and the purpose of your call? Please?",
            "time": 1757966181574,
            "endTime": 1757966187934,
            "secondsFromStart": 20.542,
            "duration": 5334.9990234375
          }
        ],
        "transcript": "AI: Good. How may I assist you?\\nUser: 1 2 3. Testing 1 2 3.\\nAI: Hello. How may I assist you today?\\nUser: Hello?\\nAI: Hello. How may I assist you today? Could I have your name and the purpose of your call? Please?\\n"
      }
    };

    console.log('📤 Sending webhook to server...');

    const response = await axios.post(
      'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook',
      realWebhookData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Webhook sent successfully:', response.status);
    console.log('Response:', response.data);

    // Give it a moment to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Now test the transcript API
    console.log('📋 Testing transcript API...');

    const transcriptResponse = await axios.get(
      'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/transcripts'
    );

    console.log('✅ Transcript API response:', transcriptResponse.status);
    console.log('Transcripts found:', transcriptResponse.data);

  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

testTranscriptWebhook();