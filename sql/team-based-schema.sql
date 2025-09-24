-- Drop existing tables to recreate with team-based structure
DROP TABLE IF EXISTS twilio_builder_accounts CASCADE;
DROP TABLE IF EXISTS activity_feed CASCADE;
DROP TABLE IF EXISTS mock_phone_numbers CASCADE;
DROP TABLE IF EXISTS communication_templates CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS vendor_contacts CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP VIEW IF EXISTS recent_conversations CASCADE;
DROP VIEW IF EXISTS communication_stats CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teams table (each team gets one phone number)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    owner_email VARCHAR(255),
    twilio_phone_number VARCHAR(50),
    twilio_subaccount_sid VARCHAR(100),
    twilio_subaccount_token VARCHAR(100),
    twilio_phone_sid VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendor Contacts (shared by team)
CREATE TABLE vendor_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    last_contact TIMESTAMP,
    total_calls INTEGER DEFAULT 0,
    total_sms INTEGER DEFAULT 0,
    response_rate INTEGER DEFAULT 0,
    preferred_channel VARCHAR(20) DEFAULT 'call',
    status VARCHAR(20) DEFAULT 'active',
    tags TEXT[],
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages (team-based)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendor_contacts(id) ON DELETE CASCADE,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    type VARCHAR(10) CHECK (type IN ('sms', 'email', 'chat')),
    from_number VARCHAR(50),
    to_number VARCHAR(50),
    message_body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'sent',
    read BOOLEAN DEFAULT FALSE,
    message_sid VARCHAR(100),
    sent_by VARCHAR(255), -- which team member sent it
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call Logs (team-based)
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendor_contacts(id) ON DELETE CASCADE,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    from_number VARCHAR(50),
    to_number VARCHAR(50),
    duration INTEGER,
    status VARCHAR(20),
    recording_url TEXT,
    transcription TEXT,
    ai_summary TEXT,
    call_sid VARCHAR(100),
    purpose VARCHAR(50),
    called_by VARCHAR(255), -- which team member made the call
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Communication Templates (team-based)
CREATE TABLE communication_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('call', 'sms', 'email')),
    purpose VARCHAR(50),
    template_body TEXT NOT NULL,
    variables JSONB,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity Feed (team-based)
CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    metadata JSONB,
    created_by VARCHAR(255), -- which team member
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_teams_status ON teams(status);
CREATE INDEX idx_vendor_contacts_team_id ON vendor_contacts(team_id);
CREATE INDEX idx_vendor_contacts_status ON vendor_contacts(status);
CREATE INDEX idx_messages_team_vendor ON messages(team_id, vendor_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_call_logs_team_vendor ON call_logs(team_id, vendor_id);
CREATE INDEX idx_call_logs_created ON call_logs(created_at DESC);
CREATE INDEX idx_communication_templates_team ON communication_templates(team_id);
CREATE INDEX idx_communication_templates_type ON communication_templates(type);
CREATE INDEX idx_activity_feed_team ON activity_feed(team_id, created_at DESC);

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development
CREATE POLICY "Allow all operations on teams" ON teams FOR ALL USING (true);
CREATE POLICY "Allow all operations on vendor_contacts" ON vendor_contacts FOR ALL USING (true);
CREATE POLICY "Allow all operations on messages" ON messages FOR ALL USING (true);
CREATE POLICY "Allow all operations on call_logs" ON call_logs FOR ALL USING (true);
CREATE POLICY "Allow all operations on communication_templates" ON communication_templates FOR ALL USING (true);
CREATE POLICY "Allow all operations on activity_feed" ON activity_feed FOR ALL USING (true);

-- Create a default team for testing
INSERT INTO teams (id, team_name, company_name, owner_email)
VALUES ('11111111-1111-1111-1111-111111111111', 'Default Team', 'HomeQuest Construction', 'team@homequest.com');

-- Insert sample vendor contacts for the default team
INSERT INTO vendor_contacts (team_id, name, company, phone, email, tags, notes)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'John Smith', 'Smith Plumbing', '+14045551234', 'john@smithplumbing.com', ARRAY['plumber', 'emergency'], 'Reliable, 24/7 service'),
    ('11111111-1111-1111-1111-111111111111', 'Sarah Johnson', 'Johnson Electric', '+14045552345', 'sarah@johnsonelectric.com', ARRAY['electrician', 'commercial'], 'Licensed, handles big projects'),
    ('11111111-1111-1111-1111-111111111111', 'Mike Williams', 'Williams Roofing', '+14045553456', 'mike@williamsroofing.com', ARRAY['roofer', 'residential'], 'Specializes in shingle repair'),
    ('11111111-1111-1111-1111-111111111111', 'Lisa Davis', 'Davis HVAC', '+14045554567', 'lisa@davishvac.com', ARRAY['hvac', 'installation'], 'Quick response time'),
    ('11111111-1111-1111-1111-111111111111', 'Tom Brown', 'Brown Flooring', '+14045555678', 'tom@brownflooring.com', ARRAY['flooring', 'hardwood'], 'Great prices on hardwood');