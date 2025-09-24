/**
 * Create a working test account without email verification
 * Run: npx ts-node src/scripts/create-working-account.ts
 */

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

async function createWorkingAccount() {
  console.log('🔧 Creating working test account...\n');
  
  try {
    const email = 'test@homequest.com';
    const password = 'Test1234';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // First, delete any existing account with this email
    await supabase
      .from('users')
      .delete()
      .eq('email', email);
    
    // Create new user directly in users table with verified email
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email,
        password: hashedPassword,
        name: 'Test User',
        phone: '+14045551234',
        role: 'builder',
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating user:', error);
      
      // Try to sign up through Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            name: 'Test User',
            phone: '+14045551234'
          },
          emailRedirectTo: 'http://localhost:3000/dashboard'
        }
      });
      
      if (authError) {
        console.error('Auth signup failed:', authError);
      } else {
        console.log('✅ Account created via Auth!');
        console.log('User ID:', authData.user?.id);
      }
    } else {
      console.log('✅ Account created successfully!');
      console.log('User ID:', user.id);
    }
    
    console.log('\n📝 Login Credentials:');
    console.log('=====================================');
    console.log('Email: test@homequest.com');
    console.log('Password: Test1234');
    console.log('=====================================');
    console.log('\n✅ You can now login with these credentials!');
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

createWorkingAccount();