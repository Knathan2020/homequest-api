-- Create table for storing user email accounts connected via Nylas
-- This replaces the scattered OAuth token storage

CREATE TABLE IF NOT EXISTS public.user_email_accounts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('gmail', 'outlook')),
    grant_id VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sync TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_email_accounts_user_id ON public.user_email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_accounts_email ON public.user_email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_user_email_accounts_provider ON public.user_email_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_user_email_accounts_active ON public.user_email_accounts(is_active);

-- Add RLS (Row Level Security) policies
ALTER TABLE public.user_email_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own email accounts
CREATE POLICY "Users can view own email accounts" ON public.user_email_accounts
    FOR SELECT USING (user_id = auth.uid()::text);

-- Policy: Users can insert their own email accounts
CREATE POLICY "Users can insert own email accounts" ON public.user_email_accounts
    FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Policy: Users can update their own email accounts
CREATE POLICY "Users can update own email accounts" ON public.user_email_accounts
    FOR UPDATE USING (user_id = auth.uid()::text);

-- Policy: Users can delete their own email accounts
CREATE POLICY "Users can delete own email accounts" ON public.user_email_accounts
    FOR DELETE USING (user_id = auth.uid()::text);

-- Grant permissions to service role (for server-side operations)
GRANT ALL ON public.user_email_accounts TO service_role;

-- Add comment
COMMENT ON TABLE public.user_email_accounts IS 'Stores user email account connections via Nylas OAuth';
COMMENT ON COLUMN public.user_email_accounts.grant_id IS 'Nylas grant ID for API access';
COMMENT ON COLUMN public.user_email_accounts.provider IS 'Email provider: gmail or outlook';
COMMENT ON COLUMN public.user_email_accounts.is_active IS 'Whether this account is currently active/connected';