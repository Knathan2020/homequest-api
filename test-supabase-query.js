const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function test() {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      *,
      profile:profiles!team_members_user_id_fkey(
        id,
        email,
        full_name,
        phone_number
      )
    `)
    .eq('team_id', '0101cf94-918a-46a6-9910-9f771d917506');

  console.log('ERROR:', error);
  console.log('DATA:', JSON.stringify(data, null, 2));
}

test();
