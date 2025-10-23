/**
 * One-time script to populate team_phones table for existing teams
 * Run with: npx tsx fix-team-phones.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function fixTeamPhones() {
  console.log('🔧 Fixing team_phones table...\n');

  // Get all teams with phone numbers
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, team_name, company_name, twilio_phone_number')
    .not('twilio_phone_number', 'is', null);

  if (teamsError) {
    console.error('❌ Error fetching teams:', teamsError);
    process.exit(1);
  }

  console.log(`Found ${teams?.length || 0} teams with phone numbers\n`);

  for (const team of teams || []) {
    // Check if already in team_phones
    const { data: existing } = await supabase
      .from('team_phones')
      .select('id')
      .eq('team_id', team.id)
      .single();

    if (existing) {
      console.log(`⏭️  ${team.team_name} - already in team_phones`);
      continue;
    }

    // Get first user's email from this team
    const { data: user } = await supabase
      .from('profiles')
      .select('email')
      .eq('team_id', team.id)
      .limit(1)
      .single();

    const ownerEmail = user?.email || `team-${team.id}@homequest.com`;

    // Insert into team_phones
    const { error } = await supabase
      .from('team_phones')
      .insert({
        team_id: team.id,
        team_name: team.company_name || team.team_name,
        owner_email: ownerEmail,
        twilio_number: team.twilio_phone_number,
        default_voice_id: 'ewxUvnyvvOehYjKjUVKC',
        status: 'active',
        created_at: new Date().toISOString()
      });

    if (error) {
      console.log(`❌ ${team.team_name}: ${error.message}`);
    } else {
      console.log(`✅ ${team.team_name} (${ownerEmail}) → ${team.twilio_phone_number}`);
    }
  }

  console.log('\n✅ Done!');
  process.exit(0);
}

fixTeamPhones().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
