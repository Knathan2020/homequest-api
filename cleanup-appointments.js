const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fbwmkkskdrvaipmkddwm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY4MjgxNywiZXhwIjoyMDY3MjU4ODE3fQ.OWTZvvdvjfbNl5nT_3Xd61fQl5JggavHPq5wdHd_TNw',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function cleanup() {
  const teamId = '0101cf94-918a-46a6-9910-9f771d917506';

  console.log('🧹 Cleaning up duplicate appointments...\n');

  // Delete all appointments created by AI for Ken White
  const { data: deleted, error } = await supabase
    .from('appointments')
    .delete()
    .eq('team_id', teamId)
    .eq('created_by_ai', true)
    .select();

  if (error) {
    console.log('❌ Error:', error.message);
  } else {
    console.log(`✅ Deleted ${deleted.length} AI-created appointments`);
  }
}

cleanup();
