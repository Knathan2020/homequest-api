import { createClient } from '@supabase/supabase-js';
import phoneProvisioningService from './src/services/phone-provisioning.service';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function addPhone() {
  // Get kwhite's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, team_id')
    .eq('email', 'kwhite@yhshomes.com')
    .single();

  console.log('Found profile:', profile);

  if (!profile?.team_id) {
    console.error('No team found');
    process.exit(1);
  }

  // Get team details
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', profile.team_id)
    .single();

  console.log('Team:', team);

  // Check if already has phone
  const { data: existing } = await supabase
    .from('team_phones')
    .select('*')
    .eq('team_id', profile.team_id)
    .maybeSingle();

  if (existing) {
    console.log('\n⚠️  Team already has phone:', existing.twilio_number);
    console.log('Company:', existing.team_name);
    process.exit(0);
  }

  // Provision Atlanta number
  console.log('\n📞 Provisioning Atlanta phone...');
  
  const result = await phoneProvisioningService.provisionPhoneForTeam({
    teamId: profile.team_id,
    teamName: team.team_name || 'HomeQuest Properties',
    ownerEmail: profile.email,
    preferredAreaCode: '404'
  });

  if (!result.success) {
    console.error('Failed:', result.error);
    process.exit(1);
  }

  console.log('\n✅ SUCCESS!');
  console.log('Phone:', result.twilioNumber);
  console.log('VAPI ID:', result.vapiPhoneId);

  // Update team
  await supabase
    .from('teams')
    .update({
      twilio_phone_number: result.twilioNumber,
      phone_system_active: true
    })
    .eq('id', profile.team_id);

  process.exit(0);
}

addPhone();
