# Vapi Dynamic Assistant Fix

## Problem
When calling the Vapi number, you get "an application error has occurred" because the dynamic assistant webhook cannot connect to the database.

## Root Cause
The `SUPABASE_URL` environment variable was set to a placeholder value `"your_supabase_url"` instead of the actual Supabase URL.

## Fixes Applied

### 1. Local Environment (.env file)
✅ Fixed `SUPABASE_URL` to: `https://fbwmkkskdrvaipmbddwm.supabase.co`
✅ Added `API_BASE_URL` for webhook callbacks
✅ Updated Supabase client fallback in `vapi-webhooks.routes.ts`

### 2. Code Changes
**File**: `src/routes/vapi-webhooks.routes.ts` (line 14-15)
```typescript
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);
```

## Required: Update Render Environment Variables

### Go to Render Dashboard
1. Navigate to: https://dashboard.render.com
2. Find your `homequest-api-1` service
3. Go to "Environment" tab
4. Add/update these variables:

```bash
SUPABASE_URL=https://fbwmkkskdrvaipmbddwm.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2ODI4MTcsImV4cCI6MjA2NzI1ODgxN30.-rBrI8a56Pc-5ROhiZaGtK6QwH1qrZOt7Osmj-lqeJc
API_BASE_URL=https://homequest-api-1.onrender.com
```

### Optional: Add Supabase Service Key
If you have a Supabase service role key (for admin operations):
```bash
SUPABASE_SERVICE_KEY=your_service_role_key_from_supabase
```

You can find it at: https://supabase.com/dashboard/project/fbwmkkskdrvaipmbddwm/settings/api

## How the Dynamic Assistant Works

1. **Incoming Call** → Vapi receives call to `+18142610584`
2. **Webhook Request** → Vapi calls `POST /api/vapi/webhooks/assistant-request`
3. **Database Lookup** → Webhook queries `team_phones` table for phone number
4. **Assistant Config** → Returns dynamic assistant with:
   - Company name (HomeQuest Construction)
   - Team members for transfers
   - Custom greeting
   - Appointment scheduling tools
5. **Call Handled** → Vapi uses the returned assistant config

## Phone Number Configuration

Your current setup:
- **Phone**: `+18142610584`
- **Vapi Phone ID**: `86d21bb9-4562-4fcf-a834-cbfdccc0de5f`
- **Team**: HomeQuest Construction
- **Team ID**: `0101cf94-918a-46a6-9910-9f771d917506`

## Testing

After updating Render environment variables:

1. **Redeploy** the service (Render will auto-redeploy on env var change)
2. **Wait 2-3 minutes** for deployment to complete
3. **Call** `+18142610584` to test

### Expected Behavior
- Call connects
- Greeting: "Good [morning/afternoon/evening], HomeQuest Construction. How may I assist you today?"
- Can schedule appointments
- Can transfer to team members

### If Still Not Working

Check Render logs:
```bash
# Look for these lines in logs:
🤖 Assistant request received
✅ Found team: { teamId: '...', companyName: 'HomeQuest Construction' }
📋 Transfer destinations: X
✅ Returning assistant config for HomeQuest Construction
```

If you see errors like:
- `❌ No team found for phone number` → Run the SQL in `insert-team-phone.sql`
- Database connection errors → Check SUPABASE_URL is correct
- `Team not found` → Verify phone number matches in database

## Next Steps

1. ✅ Update Render environment variables (REQUIRED)
2. ⏳ Wait for auto-redeploy
3. 📞 Test call
4. 🎉 Assistant should work!

## Database Verification

Run this in Supabase SQL Editor to verify your setup:
```sql
SELECT * FROM team_phones WHERE twilio_number = '+18142610584';
SELECT * FROM team_members WHERE team_id = '0101cf94-918a-46a6-9910-9f771d917506';
```

## Support

If still having issues after updating Render environment variables, provide:
1. Render deployment logs
2. Error message from phone call
3. Screenshot of Render environment variables (hide sensitive keys)
