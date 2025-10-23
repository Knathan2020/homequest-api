import { createClient } from '@supabase/supabase-js';
import phoneProvisioningService from './src/services/phone-provisioning.service';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function setup() {
  const teamId = 'team-kwhite-yhshomes-' + Date.now();
  
  console.log('🏗️  Creating team for kwhite@yhshomes.com\n');

  // Create team
  const { error: teamError } = await supabase
    .from('teams')
    .insert({
      id: teamId,
      team_name: 'HomeQuest Properties',
      company_name: 'HomeQuest Properties',
      created_at: new Date().toISOString()
    });

  if (teamError) {
    console.error('❌ Team creation failed:', teamError);
    process.exit(1);
  }

  console.log('✅ Team created:', teamId);

  // Provision Atlanta phone with VAPI
  console.log('\n📞 Provisioning Atlanta phone number with VAPI integration...');
  
  const result = await phoneProvisioningService.provisionPhoneForTeam({
    teamId: teamId,
    teamName: 'HomeQuest Properties',
    ownerEmail: 'kwhite@yhshomes.com',
    preferredAreaCode: '404'
  });

  if (!result.success) {
    console.error('\n❌ Phone provisioning failed:', result.error);
    process.exit(1);
  }

  console.log('\n✅ SUCCESS! Phone provisioned with VAPI:');
  console.log('   Phone Number:', result.twilioNumber);
  console.log('   VAPI Phone ID:', result.vapiPhoneId);
  console.log('   Company: HomeQuest Properties');
  console.log('   Email: kwhite@yhshomes.com');
  console.log('\n🎉 This number is now live and connected to VAPI AI receptionist!');

  // Update team with phone number
  await supabase
    .from('teams')
    .update({
      twilio_phone_number: result.twilioNumber,
      phone_system_active: true
    })
    .eq('id', teamId);

  console.log('✅ Team updated with phone number\n');

  process.exit(0);
}

setup();
