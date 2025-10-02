-- Update profiles for all 3 users
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fbwmkkskdrvaipmkddwm/sql

-- User 1: kentrill@yhshomes.com (Ken White - Primary Account)
INSERT INTO profiles (id, email, full_name, phone_number, created_at, updated_at)
VALUES (
  '97a80628-cb34-4ca2-8c40-fd1091ef9efc',
  'kentrill@yhshomes.com',
  'Ken White',
  '+18142610584',
  NOW(),
  NOW()
)
ON CONFLICT (id)
DO UPDATE SET
  full_name = 'Ken White',
  phone_number = '+18142610584',
  email = 'kentrill@yhshomes.com',
  updated_at = NOW();

-- User 2: kenwhite2012@gmail.com (Ken White - Gmail 2012)
INSERT INTO profiles (id, email, full_name, phone_number, created_at, updated_at)
VALUES (
  'a17ebf8c-697b-4e1a-949d-036a80d87aad',
  'kenwhite2012@gmail.com',
  'Ken White',
  '+18142610584',
  NOW(),
  NOW()
)
ON CONFLICT (id)
DO UPDATE SET
  full_name = 'Ken White',
  phone_number = '+18142610584',
  email = 'kenwhite2012@gmail.com',
  updated_at = NOW();

-- User 3: kenwhite2015@gmail.com (Ken White - Gmail 2015)
INSERT INTO profiles (id, email, full_name, phone_number, created_at, updated_at)
VALUES (
  '4fbc576e-8917-4e99-a8ad-61f0d7b39925',
  'kenwhite2015@gmail.com',
  'Ken White',
  '+18142610584',
  NOW(),
  NOW()
)
ON CONFLICT (id)
DO UPDATE SET
  full_name = 'Ken White',
  phone_number = '+18142610584',
  email = 'kenwhite2015@gmail.com',
  updated_at = NOW();

-- Verify all profiles were created/updated
SELECT id, email, full_name, phone_number FROM profiles
WHERE id IN (
  '97a80628-cb34-4ca2-8c40-fd1091ef9efc',
  'a17ebf8c-697b-4e1a-949d-036a80d87aad',
  '4fbc576e-8917-4e99-a8ad-61f0d7b39925'
)
ORDER BY email;
