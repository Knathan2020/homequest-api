-- Hybrid Schema: Team-based phone/SMS, Individual emails
-- Drop existing tables to recreate with hybrid structure
DROP TABLE IF EXISTS twilio_builder_accounts CASCADE;
DROP TABLE IF EXISTS activity_feed CASCADE;
DROP TABLE IF EXISTS mock_phone_numbers CASCADE;
DROP TABLE IF EXISTS communication_templates CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS vendor_contacts CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP VIEW IF EXISTS recent_conversations CASCADE;
DROP VIEW IF EXISTS communication_stats CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (individuals within teams)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    gmail_refresh_token TEXT, -- For individual Gmail integration
    gmail_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams table (shared phone number)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    owner_id UUID REFERENCES users(id),
    twilio_phone_number VARCHAR(50),
    twilio_subaccount_sid VARCHAR(100),
    twilio_subaccount_token VARCHAR(100),
    twilio_phone_sid VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key for team_id in users table
ALTER TABLE users ADD CONSTRAINT fk_user_team FOREIGN KEY (team_id) REFERENCES teams(id);

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
    total_emails INTEGER DEFAULT 0,
    response_rate INTEGER DEFAULT 0,
    preferred_channel VARCHAR(20) DEFAULT 'call',
    status VARCHAR(20) DEFAULT 'active',
    tags TEXT[],
    notes TEXT,
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages (team phone/SMS, individual emails)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id), -- Who sent it (for emails and tracking)
    vendor_id UUID REFERENCES vendor_contacts(id) ON DELETE CASCADE,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    type VARCHAR(10) CHECK (type IN ('sms', 'email', 'chat')),
    from_address VARCHAR(255), -- Can be phone or email
    to_address VARCHAR(255), -- Can be phone or email
    message_body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'sent',
    read BOOLEAN DEFAULT FALSE,
    message_sid VARCHAR(100), -- For Twilio tracking
    gmail_message_id VARCHAR(100), -- For Gmail tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call Logs (team-based via shared phone)
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id), -- Who made the call
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Communication Templates (can be team or personal)
CREATE TABLE communication_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id), -- NULL for team templates
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('call', 'sms', 'email')),
    purpose VARCHAR(50),
    template_body TEXT NOT NULL,
    variables JSONB,
    is_team_template BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity Feed (tracks all activities)
CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id), -- Who performed the action
    activity_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_team_id ON users(team_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_teams_status ON teams(status);
CREATE INDEX idx_vendor_contacts_team_id ON vendor_contacts(team_id);
CREATE INDEX idx_vendor_contacts_status ON vendor_contacts(status);
CREATE INDEX idx_messages_team_vendor ON messages(team_id, vendor_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_call_logs_team_vendor ON call_logs(team_id, vendor_id);
CREATE INDEX idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX idx_call_logs_created ON call_logs(created_at DESC);
CREATE INDEX idx_communication_templates_team ON communication_templates(team_id);
CREATE INDEX idx_communication_templates_user ON communication_templates(user_id);
CREATE INDEX idx_activity_feed_team ON activity_feed(team_id, created_at DESC);
CREATE INDEX idx_activity_feed_user ON activity_feed(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development
CREATE POLICY "Allow all operations on users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all operations on teams" ON teams FOR ALL USING (true);
CREATE POLICY "Allow all operations on vendor_contacts" ON vendor_contacts FOR ALL USING (true);
CREATE POLICY "Allow all operations on messages" ON messages FOR ALL USING (true);
CREATE POLICY "Allow all operations on call_logs" ON call_logs FOR ALL USING (true);
CREATE POLICY "Allow all operations on communication_templates" ON communication_templates FOR ALL USING (true);
CREATE POLICY "Allow all operations on activity_feed" ON activity_feed FOR ALL USING (true);

-- Create a default team and users for testing
INSERT INTO teams (id, team_name, company_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Default Team', 'HomeQuest Construction');

INSERT INTO users (id, team_id, name, email, role)
VALUES 
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'John Builder', 'john@homequest.com', 'owner'),
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Sarah Manager', 'sarah@homequest.com', 'manager'),
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Mike Worker', 'mike@homequest.com', 'member');

-- Update team owner
UPDATE teams SET owner_id = '22222222-2222-2222-2222-222222222222' WHERE id = '11111111-1111-1111-1111-111111111111';

-- Insert sample vendor contacts
INSERT INTO vendor_contacts (team_id, name, company, phone, email, tags, notes, added_by)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'John Smith', 'Smith Plumbing', '+14045551234', 'john@smithplumbing.com', ARRAY['plumber', 'emergency'], 'Reliable, 24/7 service', '22222222-2222-2222-2222-222222222222'),
    ('11111111-1111-1111-1111-111111111111', 'Sarah Johnson', 'Johnson Electric', '+14045552345', 'sarah@johnsonelectric.com', ARRAY['electrician', 'commercial'], 'Licensed, handles big projects', '22222222-2222-2222-2222-222222222222'),
    ('11111111-1111-1111-1111-111111111111', 'Mike Williams', 'Williams Roofing', '+14045553456', 'mike@williamsroofing.com', ARRAY['roofer', 'residential'], 'Specializes in shingle repair', '22222222-2222-2222-2222-222222222222'),
    ('11111111-1111-1111-1111-111111111111', 'Lisa Davis', 'Davis HVAC', '+14045554567', 'lisa@davishvac.com', ARRAY['hvac', 'installation'], 'Quick response time', '33333333-3333-3333-3333-333333333333'),
    ('11111111-1111-1111-1111-111111111111', 'Tom Brown', 'Brown Flooring', '+14045555678', 'tom@brownflooring.com', ARRAY['flooring', 'hardwood'], 'Great prices on hardwood', '33333333-3333-3333-3333-333333333333');

-- Create view for recent conversations
CREATE OR REPLACE VIEW recent_conversations AS
SELECT 
    vc.id as vendor_id,
    vc.team_id,
    vc.name,
    vc.company,
    vc.phone,
    vc.email,
    COALESCE(
        GREATEST(
            MAX(m.created_at),
            MAX(cl.created_at)
        ),
        vc.created_at
    ) as last_interaction,
    COUNT(DISTINCT m.id) as message_count,
    COUNT(DISTINCT cl.id) as call_count
FROM vendor_contacts vc
LEFT JOIN messages m ON vc.id = m.vendor_id
LEFT JOIN call_logs cl ON vc.id = cl.vendor_id
WHERE vc.status = 'active'
GROUP BY vc.id, vc.team_id, vc.name, vc.company, vc.phone, vc.email, vc.created_at
ORDER BY last_interaction DESC;