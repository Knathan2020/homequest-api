/**
 * Add existing VAPI phone to team_phones table
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function addPhoneToTeam() {
  // First get the user's team_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id, first_name, last_name')
    .eq('id', '97a80628-cb34-4ca2-8c40-fd1091ef9efc')
    .single();

  console.log('User profile:', profile);

  if (!profile?.team_id) {
    console.error('No team_id found for user');
    return;
  }

  // Get team name
  const { data: team } = await supabase
    .from('teams')
    .select('name, company_name')
    .eq('id', profile.team_id)
    .single();

  console.log('Team:', team);

  // Check if phone already exists
  const { data: existing } = await supabase
    .from('team_phones')
    .select('*')
    .eq('team_id', profile.team_id);

  console.log('Existing phones:', existing);

  if (existing && existing.length > 0) {
    console.log('Phone already exists, updating...');
    const { error } = await supabase
      .from('team_phones')
      .update({
        vapi_phone_id: '86d21bb9-4562-4fcf-a834-cbfdccc0de5f',
        twilio_number: '+18142610584',
        status: 'active'
      })
      .eq('team_id', profile.team_id);

    if (error) {
      console.error('Update error:', error);
    } else {
      console.log('✅ Phone updated successfully');
    }
  } else {
    console.log('Adding new phone...');
    const { error } = await supabase
      .from('team_phones')
      .insert({
        team_id: profile.team_id,
        team_name: team?.company_name || team?.name || 'HomeQuest Construction',
        owner_email: 'kentrill@yhshomes.com',
        twilio_number: '+18142610584',
        vapi_phone_id: '86d21bb9-4562-4fcf-a834-cbfdccc0de5f',
        default_voice_id: 'ewxUvnyvvOehYjKjUVKC',
        status: 'active'
      });

    if (error) {
      console.error('Insert error:', error);
    } else {
      console.log('✅ Phone added successfully');
    }
  }
}

addPhoneToTeam();
