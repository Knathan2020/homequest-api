-- Communications Database Schema for Supabase
-- Stores all vendor contacts, messages, and call logs

-- Vendor Contacts Table
CREATE TABLE IF NOT EXISTS vendor_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

-- Messages Table (for SMS and chat history)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    vendor_id UUID REFERENCES vendor_contacts(id) ON DELETE CASCADE,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    type VARCHAR(10) CHECK (type IN ('sms', 'email', 'chat')),
    from_number VARCHAR(50),
    to_number VARCHAR(50),
    message_body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'sent',
    read BOOLEAN DEFAULT FALSE,
    message_sid VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_vendor (user_id, vendor_id),
    INDEX idx_created (created_at DESC)
);

-- Call Logs Table
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    vendor_id UUID REFERENCES vendor_contacts(id) ON DELETE CASCADE,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    from_number VARCHAR(50),
    to_number VARCHAR(50),
    duration INTEGER, -- seconds
    status VARCHAR(20),
    recording_url TEXT,
    transcription TEXT,
    ai_summary TEXT,
    call_sid VARCHAR(100),
    purpose VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    
    INDEX idx_user_vendor_calls (user_id, vendor_id),
    INDEX idx_created_calls (created_at DESC)
);

-- Communication Templates
CREATE TABLE IF NOT EXISTS communication_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('call', 'sms', 'email')),
    purpose VARCHAR(50),
    template_body TEXT NOT NULL,
    variables JSONB,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_templates (user_id),
    INDEX idx_type (type)
);

-- Mock/Test Phone Numbers (for testing without Twilio charges)
CREATE TABLE IF NOT EXISTS mock_phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    mock_phone_number VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_mock_user (user_id)
);

-- Activity Feed
CREATE TABLE IF NOT EXISTS activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_activity (user_id, created_at DESC)
);

-- Create views for easy querying
CREATE OR REPLACE VIEW recent_conversations AS
SELECT 
    vc.id as vendor_id,
    vc.user_id,
    vc.name,
    vc.company,
    vc.phone,
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
GROUP BY vc.id, vc.user_id, vc.name, vc.company, vc.phone, vc.created_at
ORDER BY last_interaction DESC;

-- View for communication stats
CREATE OR REPLACE VIEW communication_stats AS
SELECT 
    user_id,
    COUNT(DISTINCT vendor_id) as total_vendors,
    COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_calls,
    COUNT(CASE WHEN DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as month_calls,
    SUM(duration) / 60 as total_minutes
FROM call_logs
GROUP BY user_id;

-- RLS Policies for security
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Policies to allow users to only see their own data
CREATE POLICY "Users can view own vendor contacts" ON vendor_contacts
    FOR ALL USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can view own messages" ON messages
    FOR ALL USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can view own call logs" ON call_logs
    FOR ALL USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can view own templates" ON communication_templates
    FOR ALL USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can view own mock numbers" ON mock_phone_numbers
    FOR ALL USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can view own activity" ON activity_feed
    FOR ALL USING (user_id = auth.uid() OR auth.uid() IS NULL);