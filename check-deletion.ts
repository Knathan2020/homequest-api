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
    .eq('twilio_number', '+13203358363');

  console.log('Records found:', data?.length);
  console.log(JSON.stringify(data, null, 2));
  
  process.exit(0);
}

check();
