# Frontend Fixes Needed

## 1. Fix Wall Detection Endpoint
In your frontend code, change:
```javascript
// OLD
/api/enhanced-detection/detect-walls

// NEW
/api/enhanced/detect-walls
```

## 2. Fix Supabase API Key
Remove the newline character from the Supabase API key in your frontend .env:
```javascript
// Make sure there's no extra line break at the end
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 3. Fix Phone Provisioning
The user needs a team_id. Run this SQL in Supabase:
```sql
-- First, create a team for the user if not exists
INSERT INTO teams (id, name, owner_id, company_name, created_at)
VALUES (
  gen_random_uuid(),
  'HomeQuest Construction',
  '97a80628-cb34-4ca2-8c40-fd1091ef9efc',
  'HomeQuest Construction',
  NOW()
)
ON CONFLICT DO NOTHING;

-- Then update the profile with team_id
UPDATE profiles
SET team_id = (
  SELECT id FROM teams
  WHERE owner_id = '97a80628-cb34-4ca2-8c40-fd1091ef9efc'
  LIMIT 1
)
WHERE id = '97a80628-cb34-4ca2-8c40-fd1091ef9efc';
```

## 4. Add Twilio Credentials to Render
Go to Render Dashboard > Environment Variables and add:
- TWILIO_ACCOUNT_SID=your_sid
- TWILIO_AUTH_TOKEN=your_token
- TWILIO_PHONE_NUMBER=your_number

These will fix all the console errors!