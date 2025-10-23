import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function checkExisting() {
  const phoneNumbers = [
    '+16783253060',
    '+14045551234',
    '+17705556789',
    '+16073258388',
    '+13203358363',
    '+14407396780',
    '+19787751893'
  ];

  console.log('Checking which teams already exist in team_phones:\n');

  const { data, error } = await supabase
    .from('team_phones')
    .select('team_id, team_name, twilio_number')
    .in('twilio_number', phoneNumbers);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('EXISTING in team_phones:');
  console.log(data);
  console.log(`\nTotal: ${data?.length || 0} of ${phoneNumbers.length}`);

  // Now get teams from teams table
  const { data: teams } = await supabase
    .from('teams')
    .select('id, team_name, company_name, twilio_phone_number')
    .in('twilio_phone_number', phoneNumbers);

  console.log('\n\nALL teams with these numbers:');
  console.log(teams);

  // Find missing
  const existingNumbers = new Set(data?.map(d => d.twilio_number) || []);
  const missing = phoneNumbers.filter(n => !existingNumbers.has(n));

  console.log('\n\nMISSING from team_phones:');
  console.log(missing);

  process.exit(0);
}

checkExisting();
