const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fbwmkkskdrvaipmkddwm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY4MjgxNywiZXhwIjoyMDY3MjU4ODE3fQ.OWTZvvdvjfbNl5nT_3Xd61fQl5JggavHPq5wdHd_TNw',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkSetup() {
  const teamId = '0101cf94-918a-46a6-9910-9f771d917506';

  console.log('🔍 Checking HomeQuest Construction setup...\n');

  // Check team members for transfers
  console.log('1️⃣ Checking team_members table...');
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('name, phone_number, department')
    .eq('team_id', teamId)
    .not('phone_number', 'is', null);

  if (membersError) {
    console.log('   ❌ Error:', membersError.message);
    console.log('   Table might not exist or have wrong permissions');
  } else if (members.length === 0) {
    console.log('   ⚠️  No team members found');
    console.log('   Transfers will not work - need to add team members');
  } else {
    console.log('   ✅ Found', members.length, 'team members for transfers:');
    members.forEach(m => {
      console.log('      -', m.name, '→', m.phone_number, '('+m.department+')');
    });
  }

  console.log('');

  // Check appointments table for scheduling
  console.log('2️⃣ Checking appointments table...');
  const { data: appointments, error: appointmentsError } = await supabase
    .from('appointments')
    .select('id')
    .eq('team_id', teamId)
    .limit(1);

  if (appointmentsError) {
    console.log('   ❌ Error:', appointmentsError.message);
    console.log('   Appointments table might not exist');
  } else {
    console.log('   ✅ Appointments table exists');
    console.log('   Scheduling should work');
  }

  console.log('');
  console.log('Summary:');
  console.log('--------');

  if (!membersError && members.length > 0) {
    console.log('✅ Transfers: READY');
  } else {
    console.log('❌ Transfers: NOT SETUP - need team_members');
  }

  if (!appointmentsError) {
    console.log('✅ Scheduling: READY');
  } else {
    console.log('❌ Scheduling: NOT SETUP - need appointments table');
  }
}

checkSetup();
