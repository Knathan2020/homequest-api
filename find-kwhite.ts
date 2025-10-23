import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function find() {
  // Find profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, team_id')
    .eq('email', 'kwhite@yhshomes.com')
    .single();

  console.log('Profile:', profile);

  if (profile?.team_id) {
    // Get team
    const { data: team } = await supabase
      .from('teams')
      .select('id, team_name, twilio_phone_number')
      .eq('id', profile.team_id)
      .single();

    console.log('\nTeam:', team);

    // Get team_phones
    const { data: teamPhone } = await supabase
      .from('team_phones')
      .select('*')
      .eq('team_id', profile.team_id)
      .maybeSingle();

    console.log('\nteam_phones:', teamPhone);
  }

  process.exit(0);
}

find();
