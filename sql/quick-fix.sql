-- QUICK FIX - Just make it work
DROP TABLE IF EXISTS vendor_contacts CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS activity_feed CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- Simple tables that work
CREATE TABLE vendor_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    vendor_id UUID,
    message_body TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    vendor_id UUID,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
    activity_type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teams (
    id TEXT PRIMARY KEY DEFAULT '11111111-1111-1111-1111-111111111111',
    twilio_phone_number VARCHAR(50),
    twilio_subaccount_sid VARCHAR(100),
    twilio_subaccount_token VARCHAR(100)
);

-- Make everything public for now
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_vendor_contacts" ON vendor_contacts FOR ALL USING (true);
CREATE POLICY "public_messages" ON messages FOR ALL USING (true);
CREATE POLICY "public_call_logs" ON call_logs FOR ALL USING (true);
CREATE POLICY "public_activity_feed" ON activity_feed FOR ALL USING (true);
CREATE POLICY "public_teams" ON teams FOR ALL USING (true);

-- Add test vendors
INSERT INTO vendor_contacts (name, company, phone, email)
VALUES 
    ('John Plumber', 'Quick Plumbing', '+14045551234', 'john@plumbing.com'),
    ('Mike Electric', 'Power Solutions', '+14045552345', 'mike@electric.com'),
    ('Sarah Roofer', 'Top Roofs', '+14045553456', 'sarah@roofs.com');