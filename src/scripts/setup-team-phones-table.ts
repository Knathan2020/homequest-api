/**
 * Create team_phones table and provision phone for default team
 * Run: npx ts-node src/scripts/setup-team-phones-table.ts
 */

import { createClient } from '@supabase/supabase-js';
import phoneProvisioningService from '../services/phone-provisioning.service';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function setupTeamPhones() {
  console.log('🔧 Setting up team phones table and provisioning default team phone...');

  try {
    // Step 1: Create the team_phones table
    console.log('📋 Creating team_phones table...');

    const { error: createTableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS team_phones (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id TEXT NOT NULL,
          team_name TEXT NOT NULL,
          owner_email TEXT NOT NULL,
          twilio_number TEXT NOT NULL UNIQUE,
          vapi_phone_id TEXT NOT NULL UNIQUE,
          default_voice_id TEXT DEFAULT 'ewxUvnyvvOehYjKjUVKC',
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_team_phones_team_id ON team_phones(team_id);
        CREATE INDEX IF NOT EXISTS idx_team_phones_status ON team_phones(status);
      `
    });

    if (createTableError) {
      console.log('⚠️ Table creation error (may already exist):', createTableError.message);
    } else {
      console.log('✅ team_phones table created successfully');
    }

    // Step 2: Check if default team already has a phone
    const defaultTeamId = '11111111-1111-1111-1111-111111111111';

    const hasPhone = await phoneProvisioningService.teamHasPhone(defaultTeamId);

    if (hasPhone) {
      console.log('✅ Default team already has a phone provisioned');

      const phoneConfig = await phoneProvisioningService.getTeamPhoneConfig(defaultTeamId);
      console.log('📞 Phone number:', phoneConfig.twilio_number);
      console.log('🤖 VAPI ID:', phoneConfig.vapi_phone_id);
      return;
    }

    // Step 3: Provision phone for default team
    console.log('📞 Provisioning phone for default team...');

    const provisionResult = await phoneProvisioningService.provisionPhoneForTeam({
      teamId: defaultTeamId,
      teamName: 'HomeQuest Demo Team',
      ownerEmail: 'admin@homequest.com',
      preferredAreaCode: '678' // Atlanta area code
    });

    if (provisionResult.success) {
      console.log('🎉 Phone provisioned successfully!');
      console.log('📞 Phone number:', provisionResult.twilioNumber);
      console.log('🤖 VAPI ID:', provisionResult.vapiPhoneId);
      console.log('');
      console.log('✅ Setup complete! AI appointment scheduling should now work.');
      console.log('');
      console.log('🧪 To test, try making an inbound call or using the VAPI service for outbound calls.');
    } else {
      console.error('❌ Phone provisioning failed:', provisionResult.error);
    }

  } catch (error: any) {
    console.error('❌ Setup failed:', error.message);
  }
}

setupTeamPhones();