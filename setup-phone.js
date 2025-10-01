const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fbwmkkskdrvaipmkddwm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY4MjgxNywiZXhwIjoyMDY3MjU4ODE3fQ.6tyw7VFduYkN-ByjJb1wvZZRQOPyUy_dPNOhPIjNh0A'
);

async function setupPhone() {
  console.log('Creating team_phones table...');

  const createTableSQL = `
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
  `;

  // Try to create table via RPC
  const { error: rpcError } = await supabase.rpc('exec_sql', { sql: createTableSQL });

  if (rpcError) {
    console.log('RPC failed, trying direct insert to create table structure...');
    console.log('Error:', rpcError.message);
  } else {
    console.log('✅ Table created successfully');
  }

  // Insert the phone record
  console.log('Inserting phone record...');
  const { data, error } = await supabase
    .from('team_phones')
    .insert({
      team_id: '11111111-1111-1111-1111-111111111111',
      team_name: 'YHS Homes',
      owner_email: 'kentrill@yhshomes.com',
      twilio_number: '+18142610584',
      vapi_phone_id: '86d21bb9-4562-4fcf-a834-cbfdccc0de5f',
      default_voice_id: 'ewxUvnyvvOehYjKjUVKC',
      status: 'active'
    })
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Phone registered successfully!');
  console.log('Data:', data);
  process.exit(0);
}

setupPhone();
