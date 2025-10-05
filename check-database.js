const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fbwmkkskdrvaipmkddwm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY4MjgxNywiZXhwIjoyMDY3MjU4ODE3fQ.OWTZvvdvjfbNl5nT_3Xd61fQl5JggavHPq5wdHd_TNw',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  }
);

async function checkDatabase() {
  console.log('🔍 Checking team_phones table...\n');

  // Check what the webhook is looking for
  const phoneNumber = '+18142610584';

  console.log('Looking for phone number:', phoneNumber);
  console.log('');

  // Try the exact query the webhook uses
  const { data, error } = await supabase
    .from('team_phones')
    .select('team_id, team_name')
    .eq('twilio_number', phoneNumber)
    .single();

  if (error) {
    console.error('❌ Error (this is what webhook sees):', error.message);
    console.log('');

    // Let's see ALL records in the table
    console.log('Checking ALL records in team_phones table...');
    const { data: allData, error: allError } = await supabase
      .from('team_phones')
      .select('*');

    if (allError) {
      console.error('Cannot query table:', allError.message);
      console.log('\nTable might not exist. Run insert-team-phone.sql first!');
    } else {
      console.log('Found', allData.length, 'records:');
      allData.forEach(record => {
        console.log('  -', record.twilio_number, '→', record.team_name);
      });
    }
  } else {
    console.log('✅ Found team:', data);
  }
}

checkDatabase();
