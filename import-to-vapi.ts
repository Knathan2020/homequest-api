import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function importToVapi() {
  console.log('📞 Importing +16782470772 to VAPI...');
  console.log('Using key:', process.env.VAPI_API_KEY?.substring(0, 10) + '...');
  
  try {
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
          'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const vapiPhoneId = vapiResponse.data.id;
    console.log('✅ VAPI phone ID:', vapiPhoneId);
    
    // Update database
    const { error } = await supabase
      .from('team_phones')
      .update({ vapi_phone_id: vapiPhoneId })
      .eq('twilio_number', '+16782470772');
    
    if (error) {
      console.error('❌ Database update failed:', error);
    } else {
      console.log('✅ Database updated!');
      console.log('\n🎉 Atlanta 678 number fully provisioned!');
    }
    
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
  
  process.exit(0);
}

importToVapi();
