import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function addEmailVerificationFields() {
  try {
    console.log('Adding email verification fields to profiles table...');
    
    // Execute SQL to add columns if they don't exist
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE profiles 
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS confirmation_token TEXT,
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
      `
    }).single();

    if (error) {
      // If the RPC doesn't exist, try a different approach
      console.log('RPC method not available, trying direct approach...');
      
      // Check if columns exist by trying to select them
      const { data, error: selectError } = await supabase
        .from('profiles')
        .select('email_verified, confirmation_token, verified_at')
        .limit(1);
      
      if (selectError?.message?.includes('column')) {
        console.error('Columns do not exist. Please add them manually in Supabase dashboard:');
        console.log('1. Go to Table Editor in Supabase');
        console.log('2. Select the profiles table');
        console.log('3. Add columns:');
        console.log('   - email_verified (boolean, default: false)');
        console.log('   - confirmation_token (text, nullable)');
        console.log('   - verified_at (timestamptz, nullable)');
      } else {
        console.log('✅ Columns already exist!');
      }
    } else {
      console.log('✅ Email verification fields added successfully!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

addEmailVerificationFields();