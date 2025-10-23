import { createClient } from '@supabase/supabase-js';
import phoneProvisioningService from './src/services/phone-provisioning.service';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function provision() {
  console.log('🏠 Provisioning Atlanta number for kwhite@yhshomes.com\n');

  // First, create a team for kwhite
  const teamId = 'team-kwhite-yhshomes';
  
  // Check if team exists
  const { data: existingTeam } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .maybeSingle();

  if (!existingTeam) {
    console.log('📝 Creating team...');
    const { error: teamError } = await supabase
      .from('teams')
      .insert({
        id: teamId,
        team_name: 'HomeQuest Properties',
        company_name: 'HomeQuest Properties',
        created_at: new Date().toISOString()
      });

    if (teamError) {
      console.error('❌ Error creating team:', teamError);
      process.exit(1);
    }
    console.log('✅ Team created\n');
  } else {
    console.log('✅ Team already exists\n');
  }

  // Provision phone with Atlanta area code (404, 470, 678, or 770)
  console.log('📞 Provisioning Atlanta phone number...');
  
  const result = await phoneProvisioningService.provisionPhoneForTeam({
    teamId: teamId,
    teamName: 'HomeQuest Properties',
    ownerEmail: 'kwhite@yhshomes.com',
    preferredAreaCode: '404' // Atlanta area code
  });

  if (!result.success) {
    console.error('\n❌ Failed to provision:', result.error);
    process.exit(1);
  }

  console.log('\n✅ SUCCESS!');
  console.log('Phone Number:', result.twilioNumber);
  console.log('VAPI Phone ID:', result.vapiPhoneId);
  console.log('Company Name: HomeQuest Properties');
  console.log('\nThis number is now connected to VAPI and ready to receive calls!');

  process.exit(0);
}

provision();
