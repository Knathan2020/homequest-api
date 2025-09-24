-- Create team_members table for call routing
CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(50) NOT NULL,
  
  -- Member info
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone_number VARCHAR(20) NOT NULL,
  
  -- Role & Department
  role VARCHAR(100) NOT NULL, -- Project Manager, Billing, Owner, Foreman, etc.
  department VARCHAR(100) NOT NULL, -- Operations, Billing, Sales, Management, Field
  seniority_level INTEGER DEFAULT 1, -- 1-5, for escalation routing
  
  -- Availability
  availability VARCHAR(20) DEFAULT 'available', -- available, busy, offline, do_not_disturb
  business_hours JSONB DEFAULT '{"monday": ["9:00", "17:00"], "tuesday": ["9:00", "17:00"], "wednesday": ["9:00", "17:00"], "thursday": ["9:00", "17:00"], "friday": ["9:00", "17:00"]}',
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Expertise & Routing
  expertise TEXT[] DEFAULT '{}', -- ['permits', 'scheduling', 'estimates', 'safety']
  can_receive_transfers BOOLEAN DEFAULT true,
  max_daily_transfers INTEGER DEFAULT 20,
  transfers_today INTEGER DEFAULT 0,
  
  -- Preferences
  voicemail_enabled BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT true,
  email_notifications BOOLEAN DEFAULT true,
  transfer_announcement VARCHAR(255), -- Custom message when receiving transfer
  
  -- Stats
  total_calls_received INTEGER DEFAULT 0,
  total_transfers_received INTEGER DEFAULT 0,
  avg_call_duration_seconds INTEGER DEFAULT 0,
  last_call_at TIMESTAMP,
  
  -- Meta
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_department ON team_members(department);
CREATE INDEX idx_team_members_availability ON team_members(availability);

-- Create call_transfers table
CREATE TABLE IF NOT EXISTS call_transfers (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  
  -- Transfer details
  from_type VARCHAR(20) DEFAULT 'ai', -- ai, member
  from_name VARCHAR(100),
  to_department VARCHAR(100),
  to_member VARCHAR(100),
  to_phone VARCHAR(20),
  
  -- Reason & Context
  reason TEXT,
  caller_name VARCHAR(100),
  caller_phone VARCHAR(20),
  urgency_level INTEGER DEFAULT 1, -- 1-5
  
  -- Outcome
  transfer_status VARCHAR(20) DEFAULT 'initiated', -- initiated, connected, failed, voicemail
  connected_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Meta
  transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create messages table for when members are unavailable
CREATE TABLE IF NOT EXISTS team_messages (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(50) NOT NULL,
  for_member_id INTEGER,
  
  -- Message details
  from_name VARCHAR(100),
  from_phone VARCHAR(20),
  from_company VARCHAR(100),
  message TEXT,
  
  -- Priority & Status
  urgent BOOLEAN DEFAULT false,
  read BOOLEAN DEFAULT false,
  responded BOOLEAN DEFAULT false,
  
  -- Follow-up
  callback_requested BOOLEAN DEFAULT false,
  preferred_callback_time VARCHAR(50),
  
  -- Meta
  taken_by VARCHAR(20) DEFAULT 'ai', -- ai, member_name
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP,
  responded_at TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (for_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Department routing rules
CREATE TABLE IF NOT EXISTS department_routing (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(50) NOT NULL,
  
  -- Routing rule
  keyword_triggers TEXT[], -- ['billing', 'invoice', 'payment']
  department VARCHAR(100) NOT NULL,
  priority INTEGER DEFAULT 1,
  
  -- Fallback
  fallback_department VARCHAR(100),
  take_message_instead BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Insert default departments and routing
INSERT INTO department_routing (team_id, keyword_triggers, department, priority) VALUES
('default', ARRAY['billing', 'invoice', 'payment', 'charge', 'cost'], 'Billing', 1),
('default', ARRAY['project', 'timeline', 'schedule', 'progress', 'status'], 'Operations', 1),
('default', ARRAY['emergency', 'urgent', 'immediate', 'critical'], 'Management', 5),
('default', ARRAY['complaint', 'problem', 'issue', 'unhappy'], 'Customer Service', 3),
('default', ARRAY['estimate', 'quote', 'pricing', 'proposal'], 'Sales', 2),
('default', ARRAY['permit', 'inspection', 'code', 'compliance'], 'Compliance', 2),
('default', ARRAY['safety', 'accident', 'injury', 'osha'], 'Safety', 4)
ON CONFLICT DO NOTHING;

-- Function to reset daily transfer count
CREATE OR REPLACE FUNCTION reset_daily_transfers()
RETURNS void AS $$
BEGIN
  UPDATE team_members
  SET transfers_today = 0
  WHERE DATE(CURRENT_TIMESTAMP AT TIME ZONE timezone) != DATE(last_call_at AT TIME ZONE timezone)
  OR last_call_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Example team member setup
-- INSERT INTO team_members (team_id, name, role, department, phone_number, expertise) VALUES
-- ('team_123', 'John Smith', 'Owner', 'Management', '+16785551234', ARRAY['everything']),
-- ('team_123', 'Sarah Johnson', 'Project Manager', 'Operations', '+16785555678', ARRAY['scheduling', 'permits', 'coordination']),
-- ('team_123', 'Mike Williams', 'Billing Manager', 'Billing', '+16785559012', ARRAY['invoicing', 'payments', 'accounts']),
-- ('team_123', 'Lisa Chen', 'Field Supervisor', 'Field', '+16785553456', ARRAY['safety', 'quality', 'crew']);

-- View for available team members
CREATE OR REPLACE VIEW available_team_members AS
SELECT 
  tm.*,
  CASE 
    WHEN tm.availability = 'offline' THEN false
    WHEN tm.transfers_today >= tm.max_daily_transfers THEN false
    WHEN NOT tm.can_receive_transfers THEN false
    ELSE true
  END as can_take_call
FROM team_members tm
WHERE tm.availability != 'offline'
ORDER BY tm.department, tm.seniority_level DESC;