import twilio from 'twilio';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function provision() {
  console.log('📞 Step 1: Purchasing +16782470772 from Twilio...');
  
  // Purchase the number
  const number = await twilioClient.incomingPhoneNumbers.create({
    phoneNumber: '+16782470772',
    voiceUrl: 'https://homequest-api-1.onrender.com/api/vapi/webhook',
    voiceMethod: 'POST'
  });
  
  console.log('✅ Twilio number purchased:', number.phoneNumber);
  
  // Import to VAPI
  console.log('\n📞 Step 2: Importing to VAPI...');
  
  const vapiResponse = await axios.post(
    'https://api.vapi.ai/phone-number',
    {
      provider: 'twilio',
      number: '+16782470772',
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      name: 'HomeQuest Properties - Atlanta'
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const vapiPhoneId = vapiResponse.data.id;
  console.log('✅ VAPI phone ID:', vapiPhoneId);
  
  // Update database
  console.log('\n📞 Step 3: Updating database...');
  
  const { error } = await supabase
    .from('team_phones')
    .update({ vapi_phone_id: vapiPhoneId })
    .eq('twilio_number', '+16782470772');
  
  if (error) {
    console.error('❌ Database update failed:', error);
  } else {
    console.log('✅ Database updated!');
  }
  
  console.log('\n🎉 SUCCESS! Atlanta number fully provisioned with VAPI!');
  console.log('Phone: +16782470772');
  console.log('VAPI ID:', vapiPhoneId);
  console.log('Company: HomeQuest Properties');
  
  process.exit(0);
}

provision().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
