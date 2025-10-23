import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function find() {
  // Search team_phones
  const { data: phones } = await supabase
    .from('team_phones')
    .select('*')
    .ilike('owner_email', '%kentrill%');

  console.log('team_phones with "kentrill":');
  console.log(phones);

  // Also check profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('email, team_id')
    .ilike('email', '%kentrill%');

  console.log('\nprofiles with "kentrill":');
  console.log(profiles);

  process.exit(0);
}

find();
