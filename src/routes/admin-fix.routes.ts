/**
 * Admin endpoints for one-time fixes
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Backfill missing teams to team_phones table
 */
router.post('/backfill-team-phones', async (req, res) => {
  try {
    console.log('🔧 Starting team_phones backfill...\n');

    // Get all teams with phone numbers
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, team_name, company_name, twilio_phone_number')
      .not('twilio_phone_number', 'is', null);

    if (teamsError) {
      return res.status(500).json({ error: teamsError.message });
    }

    const results = [];

    for (const team of teams || []) {
      // Check if already exists
      const { data: existing } = await supabase
        .from('team_phones')
        .select('id')
        .eq('team_id', team.id)
        .single();

      if (existing) {
        results.push({ team: team.team_name, status: 'skipped', reason: 'already exists' });
        continue;
      }

      // Get first user's email
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
        results.push({ team: team.team_name, status: 'error', error: error.message });
      } else {
        results.push({ team: team.team_name, status: 'added', email: ownerEmail, phone: team.twilio_phone_number });
      }
    }

    res.json({ success: true, results });

  } catch (error: any) {
    console.error('Backfill error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
