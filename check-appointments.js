const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fbwmkkskdrvaipmkddwm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY4MjgxNywiZXhwIjoyMDY3MjU4ODE3fQ.OWTZvvdvjfbNl5nT_3Xd61fQl5JggavHPq5wdHd_TNw',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkAppointments() {
  const teamId = '0101cf94-918a-46a6-9910-9f771d917506';

  console.log('🔍 Checking appointments for HomeQuest Construction...\n');

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.log('❌ Error:', error.message);
  } else if (appointments.length === 0) {
    console.log('⚠️  No appointments found');
  } else {
    console.log(`✅ Found ${appointments.length} appointments:\n`);
    appointments.forEach(apt => {
      console.log(`ID: ${apt.id}`);
      console.log(`Title: ${apt.title}`);
      console.log(`Type: ${apt.type}`);
      console.log(`Status: ${apt.status}`);
      console.log(`Scheduled: ${apt.scheduled_at}`);
      console.log(`Attendee: ${apt.attendee_name} (${apt.attendee_phone})`);
      console.log(`Location: ${apt.location_details}`);
      console.log(`Created by AI: ${apt.created_by_ai}`);
      console.log(`Created: ${apt.created_at}`);
      console.log('---');
    });
  }
}

checkAppointments();
