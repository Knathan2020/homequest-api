-- Fix permissions - disable RLS for now
ALTER TABLE vendor_contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;

-- Grant full access to anon role
GRANT ALL ON vendor_contacts TO anon;
GRANT ALL ON messages TO anon;
GRANT ALL ON call_logs TO anon;
GRANT ALL ON activity_feed TO anon;
GRANT ALL ON teams TO anon;

-- If tables don't exist, create them first
CREATE TABLE IF NOT EXISTS vendor_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    tags TEXT[],
    preferred_channel VARCHAR(20) DEFAULT 'call',
    total_calls INTEGER DEFAULT 0,
    total_sms INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    vendor_id UUID,
    message_body TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    vendor_id UUID,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    activity_type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY DEFAULT '11111111-1111-1111-1111-111111111111',
    twilio_phone_number VARCHAR(50),
    twilio_subaccount_sid VARCHAR(100),
    twilio_subaccount_token VARCHAR(100)
);

-- Disable RLS completely
ALTER TABLE vendor_contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;

-- Add test vendors if not exists
INSERT INTO vendor_contacts (name, company, phone, email)
VALUES 
    ('John Plumber', 'Quick Plumbing', '+14045551234', 'john@plumbing.com'),
    ('Mike Electric', 'Power Solutions', '+14045552345', 'mike@electric.com'),
    ('Sarah Roofer', 'Top Roofs', '+14045553456', 'sarah@roofs.com')
ON CONFLICT DO NOTHING;