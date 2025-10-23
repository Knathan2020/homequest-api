import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function get() {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, team_id, full_name')
    .eq('email', 'kentrill@yhshomes.com')
    .single();

  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

get();
