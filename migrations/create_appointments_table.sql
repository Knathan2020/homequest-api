-- Create appointments/scheduling table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  
  -- Appointment details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL, -- 'meeting', 'call', 'site_visit', 'inspection', 'consultation'
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
  
  -- Time and duration
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  end_at TIMESTAMP WITH TIME ZONE GENERATED ALWAYS AS (scheduled_at + (duration_minutes || ' minutes')::INTERVAL) STORED,
  
  -- Participants
  host_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  host_name VARCHAR(255),
  attendee_name VARCHAR(255) NOT NULL,
  attendee_email VARCHAR(255),
  attendee_phone VARCHAR(20),
  attendee_company VARCHAR(255),
  
  -- Location/Meeting details
  location_type VARCHAR(50) DEFAULT 'phone', -- 'phone', 'video', 'in_person', 'site'
  location_details TEXT, -- phone number, video link, address, etc.
  meeting_link TEXT,
  
  -- Project/Context
  project_id UUID,
  vendor_id UUID,
  
  -- Reminders
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Notes
  notes TEXT,
  internal_notes TEXT,
  
  -- Source tracking
  source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'ai_assistant', 'web_form', 'phone'
  created_by_ai BOOLEAN DEFAULT false,
  ai_call_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT
);

-- Create indexes for faster queries
CREATE INDEX idx_appointments_team_id ON appointments(team_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_host_user_id ON appointments(host_user_id);
CREATE INDEX idx_appointments_attendee_phone ON appointments(attendee_phone);

-- Create availability slots table (for team members to set their availability)
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  
  -- Recurring availability (e.g., every Monday 9am-5pm)
  day_of_week INTEGER, -- 0-6 (Sunday-Saturday)
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Or specific date availability
  specific_date DATE,
  
  -- Settings
  is_recurring BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_availability_slots_user_id ON availability_slots(user_id);
CREATE INDEX idx_availability_slots_team_id ON availability_slots(team_id);

-- Create blocked time slots (for holidays, breaks, etc.)
CREATE TABLE IF NOT EXISTS blocked_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reason VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_blocked_slots_user_id ON blocked_slots(user_id);
CREATE INDEX idx_blocked_slots_team_id ON blocked_slots(team_id);

-- Create appointment reminders table
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  
  type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'call'
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  recipient_phone VARCHAR(20),
  recipient_email VARCHAR(255),
  
  message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_appointment_reminders_appointment_id ON appointment_reminders(appointment_id);
CREATE INDEX idx_appointment_reminders_send_at ON appointment_reminders(send_at);
CREATE INDEX idx_appointment_reminders_sent ON appointment_reminders(sent);

-- Create function to check for scheduling conflicts
CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_user_id UUID,
  p_scheduled_at TIMESTAMP WITH TIME ZONE,
  p_duration_minutes INTEGER,
  p_appointment_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  conflict_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM appointments
    WHERE host_user_id = p_user_id
      AND status IN ('scheduled', 'confirmed')
      AND (p_appointment_id IS NULL OR id != p_appointment_id)
      AND (
        (scheduled_at, scheduled_at + (duration_minutes || ' minutes')::INTERVAL)
        OVERLAPS
        (p_scheduled_at, p_scheduled_at + (p_duration_minutes || ' minutes')::INTERVAL)
      )
  ) INTO conflict_exists;
  
  RETURN conflict_exists;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_slots_updated_at
  BEFORE UPDATE ON availability_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing
-- INSERT INTO availability_slots (user_id, team_id, day_of_week, start_time, end_time, is_recurring)
-- VALUES
--   ('user-uuid', 'team-id', 1, '09:00', '17:00', true), -- Monday 9am-5pm
--   ('user-uuid', 'team-id', 2, '09:00', '17:00', true), -- Tuesday 9am-5pm
--   ('user-uuid', 'team-id', 3, '09:00', '17:00', true), -- Wednesday 9am-5pm
--   ('user-uuid', 'team-id', 4, '09:00', '17:00', true), -- Thursday 9am-5pm
--   ('user-uuid', 'team-id', 5, '09:00', '17:00', true); -- Friday 9am-5pm