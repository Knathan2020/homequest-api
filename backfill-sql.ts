import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function backfill() {
  // Get teams with phone numbers
  const { data: teams } = await supabase
    .from('teams')
    .select('id, team_name, company_name, twilio_phone_number')
    .not('twilio_phone_number', 'is', null);

  for (const team of teams || []) {
    // Check if exists
    const { data: existing } = await supabase
      .from('team_phones')
      .select('id')
      .eq('team_id', team.id)
      .maybeSingle();

    if (existing) {
      console.log(`⏭️  ${team.team_name} - already exists`);
      continue;
    }

    // Get first user
    const { data: user } = await supabase
      .from('profiles')
      .select('email')
      .eq('team_id', team.id)
      .limit(1)
      .maybeSingle();

    const email = user?.email || `team-${team.id}@homequest.com`;

    // Use SQL insert to bypass RLS
    const { error } = await supabase.rpc('exec_sql', {
      sql: `INSERT INTO team_phones (team_id, team_name, owner_email, twilio_number, default_voice_id, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      params: [
        team.id,
        team.company_name || team.team_name,
        email,
        team.twilio_phone_number,
        'ewxUvnyvvOehYjKjUVKC',
        'active',
        new Date().toISOString()
      ]
    });

    if (error) {
      console.log(`❌ ${team.team_name}: ${error.message}`);
    } else {
      console.log(`✅ ${team.team_name} (${email}) → ${team.twilio_phone_number}`);
    }
  }
}

backfill().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
