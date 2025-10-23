import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function verify() {
  const { data } = await supabase
    .from('team_phones')
    .select('*')
    .eq('twilio_number', '+16782470772')
    .single();

  console.log('Atlanta 678 number in database:');
  console.log(JSON.stringify(data, null, 2));
  
  process.exit(0);
}

verify();
