-- Create communications table expected by the frontend
-- This consolidates all communication types into a single table

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

-- Create indexes for communications table
CREATE INDEX IF NOT EXISTS idx_comm_project_id ON communications(project_id);
CREATE INDEX IF NOT EXISTS idx_comm_vendor_id ON communications(vendor_id);
CREATE INDEX IF NOT EXISTS idx_comm_status ON communications(status);
CREATE INDEX IF NOT EXISTS idx_comm_created_at ON communications(created_at DESC);

-- Create appointments table that works with communications
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

-- Create indexes for appointments table
CREATE INDEX IF NOT EXISTS idx_appt_project_id ON appointments(project_id);
CREATE INDEX IF NOT EXISTS idx_appt_vendor_id ON appointments(vendor_id);

-- Enable Row Level Security
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since frontend is using anon key)
-- In production, you'd want more restrictive policies based on auth.uid()

-- Allow all operations for authenticated users (or anon in dev)
CREATE POLICY "Public access to communications" ON communications
    FOR ALL 
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Public access to appointments" ON appointments
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_communications_updated_at BEFORE UPDATE ON communications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data removed - tables created successfully!
-- You can now use the communications and appointments tables in your application