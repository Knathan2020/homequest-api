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
    .select('team_id, team_name, owner_email, twilio_number')
    .eq('owner_email', 'kentrill@yhshomes.com')
    .single();

  console.log('Current state for kentrill@yhshomes.com:');
  console.log(data);

  process.exit(0);
}

check();
