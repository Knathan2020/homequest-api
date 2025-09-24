/**
 * Test inbound call webhook sequence
 */

import axios from 'axios';

async function testInboundCallSequence() {
  try {
    console.log('🧪 Testing inbound call webhook sequence...');

    const baseUrl = 'http://localhost:4000/api/vapi/webhook';
    const callId = `inbound-test-${Date.now()}`;

    // Step 1: Simulate assistant-request (when someone calls in)
    console.log('\n📞 Step 1: Simulating assistant-request webhook...');

    const assistantRequestData = {
      type: 'assistant-request',
      call: {
        id: callId,
        type: 'inboundPhoneCall',
        phoneNumberId: process.env.VAPI_PHONE_NUMBER || '',
        customer: {
          number: '+16789005531'
        }
      }
    };

    const assistantResponse = await axios.post(baseUrl, assistantRequestData, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('✅ Assistant request response:', assistantResponse.status);
    console.log('🤖 Assistant config returned:', assistantResponse.data.assistant?.name);

    // Wait a moment to simulate call duration
    console.log('\n⏳ Simulating call in progress...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Simulate end-of-call-report (when call ends)
    console.log('\n📊 Step 2: Simulating end-of-call-report webhook...');

    const endOfCallData = {
      type: 'end-of-call-report',
      message: {
        call: {
          id: callId,
          type: 'inboundPhoneCall'
        },
        messages: [
          {
            role: 'bot',
            message: 'Good afternoon, our company. How may I assist you?',
            time: Date.now() - 30000,
            secondsFromStart: 1.5,
            duration: 2500
          },
          {
            role: 'user',
            message: 'Hi, I need some information about your services.',
            time: Date.now() - 25000,
            secondsFromStart: 6.2,
            duration: 1800
          },
          {
            role: 'bot',
            message: 'I\'d be happy to help you with information about our services. What specific area are you interested in?',
            time: Date.now() - 20000,
            secondsFromStart: 9.1,
            duration: 3200
          },
          {
            role: 'user',
            message: 'I\'m looking for construction services.',
            time: Date.now() - 15000,
            secondsFromStart: 14.5,
            duration: 1500
          },
          {
            role: 'bot',
            message: 'Perfect! We offer a full range of construction services. Let me connect you with our construction department.',
            time: Date.now() - 10000,
            secondsFromStart: 17.8,
            duration: 4100
          }
        ],
        transcript: 'AI: Good afternoon, our company. How may I assist you?\\nUser: Hi, I need some information about your services.\\nAI: I\'d be happy to help you with information about our services. What specific area are you interested in?\\nUser: I\'m looking for construction services.\\nAI: Perfect! We offer a full range of construction services. Let me connect you with our construction department.',
        endedReason: 'customer-ended-call',
        durationSeconds: 25.3
      }
    };

    const transcriptResponse = await axios.post(baseUrl, endOfCallData, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('✅ End-of-call report response:', transcriptResponse.status);

    // Step 3: Check if transcript was stored
    console.log('\n📋 Step 3: Checking if transcript was stored...');

    await new Promise(resolve => setTimeout(resolve, 1000));

    const transcriptCheckResponse = await axios.get('http://localhost:4000/api/vapi/transcripts');
    console.log('✅ Transcript API response:', transcriptCheckResponse.status);

    const transcripts = transcriptCheckResponse.data;
    const ourCallTranscripts = transcripts.transcripts[callId];

    if (ourCallTranscripts && ourCallTranscripts.length > 0) {
      console.log(`🎉 SUCCESS! Found ${ourCallTranscripts.length} transcript entries for inbound call ${callId}`);
      console.log('📝 Sample transcript:', ourCallTranscripts[0]);
    } else {
      console.log('❌ No transcripts found for this call ID');
      console.log('Available transcripts:', Object.keys(transcripts.transcripts || {}));
    }

    console.log('\n🎯 Inbound call test completed!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

testInboundCallSequence();