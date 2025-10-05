/**
 * Fix Vapi-Twilio integration by re-importing the phone number
 */
const axios = require('axios');

const VAPI_API_KEY = '867b5449-8493-4373-840e-2cd1d4a21a7b';
const TWILIO_ACCOUNT_SID = 'ACdced5b7ba48a5d47222ee6c2fe041419';
const TWILIO_AUTH_TOKEN = '6c414ed027a88b242d67bab50f1f76e6';
const PHONE_NUMBER = '+18142610584';
const OLD_PHONE_ID = '86d21bb9-4562-4fcf-a834-cbfdccc0de5f';

async function fixVapiTwilioIntegration() {
  console.log('🔧 Fixing Vapi-Twilio integration for', PHONE_NUMBER);
  console.log('');

  try {
    // Step 1: Delete the old import
    console.log('1️⃣ Deleting old phone import...');
    try {
      await axios.delete(
        `https://api.vapi.ai/phone-number/${OLD_PHONE_ID}`,
        {
          headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
        }
      );
      console.log('✅ Old import deleted');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('⚠️  Phone already deleted or not found');
      } else {
        throw error;
      }
    }

    console.log('');

    // Step 2: Re-import from Twilio
    console.log('2️⃣ Re-importing phone number from Twilio...');

    const importPayload = {
      provider: 'twilio',
      number: PHONE_NUMBER,
      twilioAccountSid: TWILIO_ACCOUNT_SID,
      twilioAuthToken: TWILIO_AUTH_TOKEN,
      serverUrl: 'https://homequest-api-1.onrender.com/api/vapi-webhooks/vapi/webhooks/assistant-request',
      name: 'HomeQuest Construction Business Line'
    };

    const importResponse = await axios.post(
      'https://api.vapi.ai/phone-number',
      importPayload,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const newPhone = importResponse.data;
    console.log('✅ Phone re-imported successfully!');
    console.log('');
    console.log('New Phone Details:');
    console.log('  ID:', newPhone.id);
    console.log('  Number:', newPhone.number);
    console.log('  Provider:', newPhone.provider);
    console.log('  Server URL:', newPhone.serverUrl);
    console.log('  Status:', newPhone.status);
    console.log('');

    // Step 3: Update database with new phone ID
    console.log('3️⃣ Update your database with new phone ID:');
    console.log('');
    console.log('Run this SQL in Supabase:');
    console.log('');
    console.log(`UPDATE team_phones
SET vapi_phone_id = '${newPhone.id}',
    updated_at = NOW()
WHERE twilio_number = '+18142610584';`);
    console.log('');
    console.log('🎉 Done! Wait 30 seconds, then call', PHONE_NUMBER);

  } catch (error) {
    console.error('❌ Error:', error.response ? error.response.data : error.message);
  }
}

fixVapiTwilioIntegration();
