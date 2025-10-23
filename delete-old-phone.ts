import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function deleteOld() {
  // Delete the Minnesota number
  const { error } = await supabase
    .from('team_phones')
    .delete()
    .eq('twilio_number', '+13203358363');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('✅ Deleted old Minnesota number +13203358363');
  process.exit(0);
}

deleteOld();
