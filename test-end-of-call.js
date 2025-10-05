const axios = require('axios');

// Simulate the exact payload Vapi sends
const payload = {
  "message": {
    "timestamp": 1759678945459,
    "type": "hang",
    "artifact": {
      "messages": [
        {
          "role": "system",
          "message": "You are a receptionist for HomeQuest Construction..."
        },
        {
          "role": "bot",
          "message": "Good afternoon. Homequest Construction. How may I assist you today?",
          "time": 1759678888347,
          "secondsFromStart": 0.913
        },
        {
          "role": "user",
          "message": "Hi. Yes. I'd like to schedule an appointment",
          "time": 1759678892717,
          "secondsFromStart": 5.283
        },
        {
          "role": "bot",
          "message": "Of course. I'll need your name, phone number, preferred date and time, type of service.",
          "time": 1759678897167,
          "secondsFromStart": 9.733
        },
        {
          "role": "user",
          "message": "Yes. It's gonna be a site visit for 3296 Big Cove Way, Lawrenceville, Georgia 30045. My name is Ken White. And my phone number is 678-900-5531. The appointment is for tomorrow at 2 PM.",
          "time": 1759678907397,
          "secondsFromStart": 19.963
        }
      ]
    },
    "call": {
      "id": "test-call-123",
      "createdAt": "2025-10-05T15:41:26.650Z",
      "phoneNumberId": "08ad79d1-ef97-4424-aa7e-65aca515e165",
      "customer": {
        "number": "+16789005531"
      }
    },
    "phoneNumber": {
      "id": "08ad79d1-ef97-4424-aa7e-65aca515e165"
    }
  }
};

async function testEndOfCall() {
  console.log('🧪 Testing end-of-call webhook...\n');

  try {
    const response = await axios.post(
      'http://localhost:4000/api/vapi-webhooks/vapi/webhooks/end-of-call',
      payload,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log('✅ Response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testEndOfCall();
