-- Fix phone numbers to proper international format with +1 country code
-- Run this in Supabase SQL Editor

UPDATE profiles
SET
  phone_number = '+16789005531',
  updated_at = NOW()
WHERE id = '97a80628-cb34-4ca2-8c40-fd1091ef9efc';

UPDATE profiles
SET
  phone_number = '+16789005531',
  full_name = 'Ken White',
  updated_at = NOW()
WHERE id = 'a17ebf8c-697b-4e1a-949d-036a80d87aad';

UPDATE profiles
SET
  phone_number = '+16789005531',
  full_name = 'Ken White',
  updated_at = NOW()
WHERE id = '4fbc576e-8917-4e99-a8ad-61f0d7b39925';

-- Verify all profiles have correct format
SELECT id, email, full_name, phone_number
FROM profiles
WHERE id IN (
  '97a80628-cb34-4ca2-8c40-fd1091ef9efc',
  'a17ebf8c-697b-4e1a-949d-036a80d87aad',
  '4fbc576e-8917-4e99-a8ad-61f0d7b39925'
)
ORDER BY email;
