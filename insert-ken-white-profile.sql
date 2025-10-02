-- Insert Ken White's profile and team member data
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fbwmkkskdrvaipmkddwm/sql

-- Step 1: Insert into profiles table (or update if exists)
INSERT INTO profiles (
  id,
  email,
  full_name,
  phone_number,
  created_at,
  updated_at
) VALUES (
  '0101cf94-918a-46a6-9910-9f771d917506', -- Use team_id as user_id for owner
  'kentrill@yhshomes.com',
  'Ken White',
  '+18142610584',
  NOW(),
  NOW()
)
ON CONFLICT (id)
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  phone_number = EXCLUDED.phone_number,
  updated_at = NOW();

-- Step 2: Insert into team_members table
INSERT INTO team_members (
  user_id,
  team_id,
  role,
  department,
  permissions,
  status,
  joined_at,
  created_at,
  updated_at
) VALUES (
  '0101cf94-918a-46a6-9910-9f771d917506', -- Same as profile id
  '0101cf94-918a-46a6-9910-9f771d917506', -- Team ID
  'owner',
  'Billing',
  '{"all": true}',
  'active',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (user_id, team_id)
DO UPDATE SET
  role = EXCLUDED.role,
  department = EXCLUDED.department,
  updated_at = NOW();

-- Verify the data
SELECT
  tm.*,
  p.full_name,
  p.email,
  p.phone_number
FROM team_members tm
JOIN profiles p ON tm.user_id = p.id
WHERE tm.team_id = '0101cf94-918a-46a6-9910-9f771d917506';
