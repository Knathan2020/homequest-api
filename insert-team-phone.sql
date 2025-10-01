-- Insert phone number for HomeQuest Construction team
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fbwmkkskdrvaipmkddwm/sql

INSERT INTO team_phones (
  team_id,
  team_name,
  owner_email, 
  twilio_number,
  vapi_phone_id,
  status
) VALUES (
  '0101cf94-918a-46a6-9910-9f771d917506',
  'HomeQuest Construction',
  'kentrill@yhshomes.com',
  '+18142610584',
  '86d21bb9-4562-4fcf-a834-cbfdccc0de5f',
  'active'
)
ON CONFLICT (team_id)
DO UPDATE SET
  vapi_phone_id = EXCLUDED.vapi_phone_id,
  twilio_number = EXCLUDED.twilio_number,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Verify the insert
SELECT * FROM team_phones WHERE team_id = '0101cf94-918a-46a6-9910-9f771d917506';
