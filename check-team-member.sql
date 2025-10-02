-- Check the team member record
SELECT 
  tm.id,
  tm.user_id,
  tm.team_id,
  tm.role,
  tm.department,
  p.full_name,
  p.email,
  p.phone_number
FROM team_members tm
LEFT JOIN profiles p ON tm.user_id = p.id
WHERE tm.team_id = '0101cf94-918a-46a6-9910-9f771d917506';
