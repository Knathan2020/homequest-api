-- Create outlook_accounts table for Microsoft Direct integration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fbwmkkskdrvaipmkddwm/sql

CREATE TABLE IF NOT EXISTS outlook_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_outlook_accounts_user_id ON outlook_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_outlook_accounts_email ON outlook_accounts(email);

-- Verify the table was created
SELECT * FROM outlook_accounts;
