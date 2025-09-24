-- Set up team phone number (shared by all team members)
-- This is the TEAM's business phone, not any individual's phone

-- First ensure teams table exists
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY DEFAULT '11111111-1111-1111-1111-111111111111',
    team_name TEXT DEFAULT 'HomeQuest Construction Team',
    twilio_phone_number TEXT DEFAULT '+16783253060', -- This is the TEAM's phone
    twilio_subaccount_sid TEXT,
    twilio_subaccount_token TEXT,
    twilio_phone_sid TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Update or insert the team's phone number
INSERT INTO teams (id, team_name, twilio_phone_number, status) 
VALUES (
    '11111111-1111-1111-1111-111111111111', 
    'HomeQuest Construction Team',
    '+16783253060', -- TEAM's business phone from Twilio
    'active'
)
ON CONFLICT (id) DO UPDATE SET 
    twilio_phone_number = '+16783253060',
    status = 'active',
    updated_at = NOW();

-- Grant access
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
GRANT ALL ON teams TO anon, authenticated;

SELECT 'Team phone number configured: +16783253060' as status;