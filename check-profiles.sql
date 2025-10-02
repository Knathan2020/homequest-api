-- Check what's actually in the profiles table
SELECT id, email, full_name, phone_number, created_at, updated_at
FROM profiles
WHERE id IN (
  '97a80628-cb34-4ca2-8c40-fd1091ef9efc',
  'a17ebf8c-697b-4e1a-949d-036a80d87aad',
  '4fbc576e-8917-4e99-a8ad-61f0d7b39925'
)
ORDER BY email;
