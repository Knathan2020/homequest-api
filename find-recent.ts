import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function find() {
  // Get most recent team_phones entries
  const { data } = await supabase
    .from('team_phones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Most recent team_phones entries:');
  console.log(JSON.stringify(data, null, 2));

  process.exit(0);
}

find();
