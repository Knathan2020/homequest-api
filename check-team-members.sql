-- Check team members for HomeQuest Construction
SELECT 
  id,
  name,
  phone_number,
  department,
  team_id,
  created_at
FROM team_members 
WHERE team_id = '0101cf94-918a-46a6-9910-9f771d917506'
ORDER BY created_at DESC;
