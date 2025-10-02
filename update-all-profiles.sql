-- Universal SQL to update user profiles
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fbwmkkskdrvaipmkddwm/sql

-- First, check what users exist in your auth.users table
SELECT id, email FROM auth.users;

-- Update the profile for kentrill@yhshomes.com (Ken White)
UPDATE profiles
SET
  full_name = 'Ken White',
  phone_number = '+18142610584',
  updated_at = NOW()
WHERE email = 'kentrill@yhshomes.com';

-- If the profile doesn't exist, insert it
INSERT INTO profiles (id, email, full_name, phone_number, created_at, updated_at)
SELECT
  au.id,
  au.email,
  'Ken White' as full_name,
  '+18142610584' as phone_number,
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email = 'kentrill@yhshomes.com'
AND NOT EXISTS (SELECT 1 FROM profiles WHERE email = au.email);

-- Verify the update
SELECT id, email, full_name, phone_number FROM profiles WHERE email = 'kentrill@yhshomes.com';
