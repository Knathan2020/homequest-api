/**
 * Check VAPI phone status and Twilio configuration
 * Run: npx ts-node src/scripts/check-vapi-status.ts
 */

import axios from 'axios';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

async function checkVAPIStatus() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
  const PHONE_ID = '86c3e687-5341-41b0-ace4-99de82452de0';
  
  const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  
  console.log('🔍 Checking VAPI and Twilio Configuration...\n');
  
  try {
    // Step 1: Check Twilio webhook configuration
    console.log('1️⃣ Checking Twilio webhooks...');
    
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: PHONE_NUMBER
    });
    
    if (numbers.length === 0) {
      console.log('   ❌ Phone number not found in Twilio');
      return;
    }
    
    const twilioNumber = numbers[0];
    console.log('   📞 Phone SID:', twilioNumber.sid);
    console.log('   🔗 Voice URL:', twilioNumber.voiceUrl);
    console.log('   📝 Voice Method:', twilioNumber.voiceMethod);
    console.log('   🔔 Status Callback:', twilioNumber.statusCallback);
    
    // Step 2: Try to get VAPI phone details
    console.log('\n2️⃣ Checking VAPI phone configuration...');
    
    try {
      const phoneResponse = await axios.get(
        `https://api.vapi.ai/phone-number/${PHONE_ID}`,
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`
          }
        }
      );
      
      const phoneData = phoneResponse.data;
      console.log('   ✅ Phone exists in VAPI');
      console.log('   📱 Number:', phoneData.number);
      console.log('   🏢 Provider:', phoneData.provider);
      console.log('   🤖 Assistant ID:', phoneData.assistantId);
      console.log('   🔗 Server URL:', phoneData.serverUrl);
      console.log('   📅 Created:', new Date(phoneData.createdAt).toLocaleString());
      
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('   ❌ Phone NOT found in VAPI! Need to re-import.');
      } else {
        console.log('   ❌ Error checking VAPI:', error.response?.data || error.message);
      }
    }
    
    // Step 3: List all VAPI phone numbers
    console.log('\n3️⃣ Listing all VAPI phone numbers...');
    
    try {
      const listResponse = await axios.get(
        'https://api.vapi.ai/phone-number',
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`
          }
        }
      );
      
      const phones = listResponse.data;
      console.log(`   Found ${phones.length} phone numbers in VAPI:`);
      
      phones.forEach((phone: any) => {
        console.log(`\n   📞 ${phone.number}`);
        console.log(`      ID: ${phone.id}`);
        console.log(`      Provider: ${phone.provider}`);
        console.log(`      Assistant: ${phone.assistantId || 'None'}`);
        console.log(`      Server URL: ${phone.serverUrl || 'None'}`);
      });
      
      // Check if our number is in the list
      const ourPhone = phones.find((p: any) => p.number === PHONE_NUMBER);
      if (ourPhone) {
        console.log('\n   ✅ Our number IS in VAPI with ID:', ourPhone.id);
        if (ourPhone.id !== PHONE_ID) {
          console.log('   ⚠️  WARNING: Phone ID mismatch!');
          console.log('      Expected:', PHONE_ID);
          console.log('      Actual:', ourPhone.id);
        }
      } else {
        console.log('\n   ❌ Our number is NOT in VAPI!');
      }
      
    } catch (error: any) {
      console.log('   ❌ Error listing phones:', error.response?.data || error.message);
    }
    
    // Step 4: Check the correct VAPI webhook URL
    console.log('\n4️⃣ VAPI Webhook URLs:');
    console.log('   For Twilio integration, webhooks should be:');
    console.log('   Voice URL: https://api.vapi.ai/twilio/incoming-call');
    console.log('   Status Callback: https://api.vapi.ai/twilio/call-status');
    console.log('\n   Current Twilio configuration:');
    console.log('   Voice URL:', twilioNumber.voiceUrl);
    console.log('   Status Callback:', twilioNumber.statusCallback);
    
    if (twilioNumber.voiceUrl !== 'https://api.vapi.ai/twilio/incoming-call') {
      console.log('\n   ⚠️  TWILIO WEBHOOKS NOT POINTING TO VAPI!');
      console.log('   Need to update Twilio webhooks to VAPI URLs');
    } else {
      console.log('\n   ✅ Twilio webhooks are correctly set to VAPI');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkVAPIStatus();