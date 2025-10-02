-- Check what's currently in Supabase for kentrill@yhshomes.com
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fbwmkkskdrvaipmkddwm/sql

-- Check the profiles table
SELECT
  id,
  email,
  full_name,
  phone_number,
  created_at,
  updated_at
FROM profiles
WHERE email = 'kentrill@yhshomes.com';

-- Check if there's a team_members record
SELECT
  id,
  user_id,
  team_id,
  role,
  department,
  status
FROM team_members
WHERE user_id = '97a80628-cb34-4ca2-8c40-fd1091ef9efc';
