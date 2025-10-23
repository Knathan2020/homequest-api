import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function provision() {
  // Find profile for kwhite@yhshomes.com
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, team_id, full_name')
    .eq('email', 'kwhite@yhshomes.com')
    .maybeSingle();

  console.log('Profile:', profile);

  if (!profile) {
    console.log('\n❌ kwhite@yhshomes.com does not have an account yet.');
    console.log('They need to sign up first at the login page.');
    process.exit(1);
  }

  if (!profile.team_id) {
    console.log('\n❌ User has no team_id.');
    process.exit(1);
  }

  // Get team
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', profile.team_id)
    .single();

  console.log('\nTeam:', team);

  // Check if team already has a phone
  const { data: existingPhone } = await supabase
    .from('team_phones')
    .select('*')
    .eq('team_id', profile.team_id)
    .maybeSingle();

  if (existingPhone) {
    console.log('\n⚠️  Team already has a phone number:', existingPhone.twilio_number);
    console.log('Company name:', existingPhone.team_name);
  } else {
    console.log('\n✅ Team does not have a phone yet. Ready to provision!');
    console.log('Use the Phone tab "Get your business number" button to provision.');
  }

  process.exit(0);
}

provision();
