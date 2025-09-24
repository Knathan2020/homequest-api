-- Drop existing tables if needed (comment out if you want to keep existing data)
-- DROP TABLE IF EXISTS appointments CASCADE;
-- DROP TABLE IF EXISTS communications CASCADE;

-- Create communications table
CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    vendor_id UUID,
    type VARCHAR(20) CHECK (type IN ('email', 'sms', 'call')),
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    subject TEXT,
    content TEXT,
    status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
    ai_summary TEXT,
    ai_response TEXT,
    ai_category VARCHAR(100),
    urgency VARCHAR(20) DEFAULT 'low' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    appointment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    vendor_id UUID,
    title VARCHAR(255),
    description TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    location VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_from_message_id UUID REFERENCES communications(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_comm_project ON communications(project_id);
CREATE INDEX IF NOT EXISTS idx_appt_project ON appointments(project_id);

-- Enable RLS (Row Level Security)
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (development only)
DROP POLICY IF EXISTS "Allow all communications" ON communications;
CREATE POLICY "Allow all communications" ON communications
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all appointments" ON appointments;
CREATE POLICY "Allow all appointments" ON appointments
    FOR ALL USING (true) WITH CHECK (true);

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE 'Tables created successfully!'; 
END $$;