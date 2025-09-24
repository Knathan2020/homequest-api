-- HomeQuest-Paid Billing System
-- All teams use HomeQuest's master Twilio account

-- Update teams table to track usage and limits
ALTER TABLE teams ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'starter';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS monthly_minutes_limit INTEGER DEFAULT 1000;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS monthly_sms_limit INTEGER DEFAULT 2000;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS current_month_minutes INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS current_month_sms INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS billing_cycle_start DATE DEFAULT CURRENT_DATE;

-- Create subscription tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    included_minutes INTEGER NOT NULL,
    included_sms INTEGER NOT NULL,
    features JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert subscription tiers
INSERT INTO subscription_tiers (id, name, price, included_minutes, included_sms, features) VALUES
('starter', 'Starter', 299.00, 1000, 2000, '{"vendors": 50, "team_members": 5, "ai_calls": true, "analytics": "basic"}'),
('professional', 'Professional', 599.00, 5000, 10000, '{"vendors": "unlimited", "team_members": 20, "ai_calls": true, "analytics": "advanced", "api_access": true}'),
('enterprise', 'Enterprise', 999.00, 999999, 999999, '{"vendors": "unlimited", "team_members": "unlimited", "ai_calls": true, "analytics": "advanced", "api_access": true, "white_label": true, "priority_support": true}')
ON CONFLICT (id) DO UPDATE SET
    price = EXCLUDED.price,
    included_minutes = EXCLUDED.included_minutes,
    included_sms = EXCLUDED.included_sms;

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    usage_type TEXT CHECK (usage_type IN ('call', 'sms', 'email')),
    duration_seconds INTEGER, -- for calls
    cost DECIMAL(10,4) DEFAULT 0, -- internal cost tracking
    vendor_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Function to check if team has minutes available
CREATE OR REPLACE FUNCTION can_make_call(p_team_id TEXT, p_duration_minutes INTEGER DEFAULT 1)
RETURNS BOOLEAN AS $$
DECLARE
    v_limit INTEGER;
    v_used INTEGER;
    v_tier TEXT;
BEGIN
    SELECT subscription_tier, current_month_minutes, monthly_minutes_limit
    INTO v_tier, v_used, v_limit
    FROM teams
    WHERE id = p_team_id;
    
    -- Enterprise has unlimited
    IF v_tier = 'enterprise' THEN
        RETURN TRUE;
    END IF;
    
    RETURN (v_used + p_duration_minutes) <= v_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to track usage
CREATE OR REPLACE FUNCTION track_usage(
    p_team_id TEXT,
    p_type TEXT,
    p_duration INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF p_type = 'call' AND p_duration IS NOT NULL THEN
        UPDATE teams 
        SET current_month_minutes = current_month_minutes + CEIL(p_duration / 60.0)
        WHERE id = p_team_id;
    ELSIF p_type = 'sms' THEN
        UPDATE teams 
        SET current_month_sms = current_month_sms + 1
        WHERE id = p_team_id;
    END IF;
    
    -- Log the usage
    INSERT INTO usage_tracking (team_id, usage_type, duration_seconds)
    VALUES (p_team_id, p_type, p_duration);
END;
$$ LANGUAGE plpgsql;

-- Function to reset monthly usage (run this monthly)
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS VOID AS $$
BEGIN
    UPDATE teams 
    SET current_month_minutes = 0,
        current_month_sms = 0,
        billing_cycle_start = CURRENT_DATE
    WHERE DATE_PART('day', CURRENT_DATE - billing_cycle_start) >= 30;
END;
$$ LANGUAGE plpgsql;

-- Update your team to Professional tier (more minutes for testing)
UPDATE teams 
SET subscription_tier = 'professional',
    monthly_minutes_limit = 5000,
    monthly_sms_limit = 10000
WHERE id = '11111111-1111-1111-1111-111111111111';

-- Grant permissions
GRANT ALL ON subscription_tiers TO anon, authenticated;
GRANT ALL ON usage_tracking TO anon, authenticated;

-- Disable RLS for now
ALTER TABLE subscription_tiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking DISABLE ROW LEVEL SECURITY;