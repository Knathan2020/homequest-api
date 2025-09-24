/**
 * Confirm user email for testing
 * Run: npx ts-node src/scripts/confirm-user.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

async function confirmUser() {
  console.log('📧 Confirming user email...\n');
  
  try {
    // Update the user's email confirmation status
    const { data, error } = await supabase.auth.admin.updateUserById(
      'e2f20bfa-287d-4fbc-87a0-2d37cf42c304',
      { email_confirm: true }
    );
    
    if (error) {
      console.error('Error confirming user:', error);
      
      // Try alternative approach - update in users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          email_verified: true,
          email_verified_at: new Date().toISOString()
        })
        .eq('email', 'demo@homequest.com');
        
      if (updateError) {
        console.error('Alternative update failed:', updateError);
      } else {
        console.log('✅ User email confirmed via users table!');
      }
    } else {
      console.log('✅ User email confirmed!');
    }
    
    console.log('\n📝 Login credentials:');
    console.log('Email: demo@homequest.com');
    console.log('Password: Demo123!');
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

confirmUser();