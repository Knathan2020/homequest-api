const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2ODI4MTcsImV4cCI6MjA2NzI1ODgxN30.-rBrI8a56Pc-5ROhiZaGtK6QwH1qrZOt7Osmj-lqeJc'
);

async function verify() {
  console.log('Checking for team phone...');

  const { data, error } = await supabase
    .from('team_phones')
    .select('*')
    .eq('team_id', '0101cf94-918a-46a6-9910-9f771d917506')
    .eq('status', 'active');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Found records:', data);
    console.log('Count:', data?.length);
    if (data && data.length > 0) {
      console.log('✅ Phone configured:', data[0]);
    } else {
      console.log('❌ No phone found for team');
    }
  }
}

verify();
