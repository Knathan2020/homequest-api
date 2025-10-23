import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function check() {
  const { data } = await supabase
    .from('team_phones')
    .select('*')
    .eq('twilio_number', '+19786849778')
    .single();

  console.log('New phone record:');
  console.log(JSON.stringify(data, null, 2));
  
  process.exit(0);
}

check();
