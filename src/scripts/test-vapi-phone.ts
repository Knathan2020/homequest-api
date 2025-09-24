/**
 * Test VAPI phone configuration
 * Run: npx ts-node src/scripts/test-vapi-phone.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testVAPIPhone() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const PHONE_ID = '889151da-ac44-4296-a9cf-568a414815a0';
  
  console.log('🔍 Testing VAPI Phone Configuration...\n');
  
  try {
    // Get phone details
    console.log('📞 Fetching phone details from VAPI...');
    const response = await axios.get(
      `https://api.vapi.ai/phone-number/${PHONE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );
    
    const phoneData = response.data;
    console.log('\n✅ Phone Configuration:');
    console.log('  Number:', phoneData.number);
    console.log('  Provider:', phoneData.provider);
    console.log('  Status:', phoneData.status);
    console.log('  Server URL:', phoneData.serverUrl);
    console.log('  Assistant ID:', phoneData.assistantId || 'None (using transient)');
    console.log('  Created:', new Date(phoneData.createdAt).toLocaleString());
    console.log('  Updated:', new Date(phoneData.updatedAt).toLocaleString());
    
    // Check if server URL is correct
    const expectedUrl = 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';
    if (phoneData.serverUrl !== expectedUrl) {
      console.log('\n⚠️  WARNING: Server URL mismatch!');
      console.log('  Current:', phoneData.serverUrl);
      console.log('  Expected:', expectedUrl);
      console.log('\n  Updating server URL...');
      
      // Update the phone with correct server URL
      const updateResponse = await axios.patch(
        `https://api.vapi.ai/phone-number/${PHONE_ID}`,
        {
          serverUrl: expectedUrl,
          assistantId: null  // Use transient assistants
        },
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('  ✅ Server URL updated successfully!');
    } else {
      console.log('\n✅ Server URL is correct!');
    }
    
    // List recent calls to see if any came in
    console.log('\n📋 Recent calls on this number:');
    const callsResponse = await axios.get(
      'https://api.vapi.ai/call',
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        },
        params: {
          phoneNumberId: PHONE_ID,
          limit: 5
        }
      }
    );
    
    const calls = callsResponse.data;
    if (calls && calls.length > 0) {
      calls.forEach((call: any, index: number) => {
        console.log(`\n  Call ${index + 1}:`);
        console.log(`    ID: ${call.id}`);
        console.log(`    Type: ${call.type}`);
        console.log(`    Status: ${call.status}`);
        console.log(`    Created: ${new Date(call.createdAt).toLocaleString()}`);
        console.log(`    Duration: ${call.cost?.minutes || 0} minutes`);
      });
    } else {
      console.log('  No recent calls found');
    }
    
    console.log('\n');
    console.log('📞 Test Instructions:');
    console.log('1. Call the number: +16783253060');
    console.log('2. You should hear an AI assistant answer');
    console.log('3. Check the server logs for webhook activity');
    console.log('4. If nothing happens, check Twilio console webhooks');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n⚠️  API Key might be invalid. Check VAPI_API_KEY in .env');
    }
  }
}

testVAPIPhone();