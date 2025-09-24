-- Weather-Aware Scheduling System - Clean Installation
-- This script drops and recreates everything cleanly

-- ============================================
-- CLEANUP: Drop existing objects if they exist
-- ============================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS check_weather_on_appointment_create ON appointments CASCADE;
DROP TRIGGER IF EXISTS calculate_appointment_end_at ON appointments CASCADE;
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments CASCADE;
DROP TRIGGER IF EXISTS update_availability_slots_updated_at ON availability_slots CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS check_appointment_conflict CASCADE;
DROP FUNCTION IF EXISTS check_appointment_weather CASCADE;
DROP FUNCTION IF EXISTS auto_reschedule_for_weather CASCADE;
DROP FUNCTION IF EXISTS calculate_end_at CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Drop existing tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS weather_alerts CASCADE;
DROP TABLE IF EXISTS appointment_reminders CASCADE;
DROP TABLE IF EXISTS blocked_slots CASCADE;
DROP TABLE IF EXISTS availability_slots CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;

-- ============================================
-- STEP 1: Create main appointments table
-- ============================================

CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'meeting',
  status VARCHAR(50) DEFAULT 'scheduled',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  end_at TIMESTAMP WITH TIME ZONE,
  host_user_id UUID,
  host_name VARCHAR(255),
  attendee_name VARCHAR(255) NOT NULL,
  attendee_email VARCHAR(255),
  attendee_phone VARCHAR(20),
  attendee_company VARCHAR(255),
  location_type VARCHAR(50) DEFAULT 'phone',
  location_details TEXT,
  meeting_link TEXT,
  work_type VARCHAR(50) DEFAULT 'indoor',
  location_address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  weather_checked_at TIMESTAMP WITH TIME ZONE,
  weather_forecast JSONB,
  weather_suitable BOOLEAN,
  weather_warnings TEXT[],
  weather_recommendation TEXT,
  auto_rescheduled BOOLEAN DEFAULT false,
  original_scheduled_at TIMESTAMP WITH TIME ZONE,
  project_id UUID,
  vendor_id UUID,
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  internal_notes TEXT,
  source VARCHAR(50) DEFAULT 'manual',
  created_by_ai BOOLEAN DEFAULT false,
  ai_call_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT
);

-- Create indexes on appointments
CREATE INDEX idx_appointments_team_id ON appointments(team_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_work_type ON appointments(work_type);

-- ============================================
-- STEP 2: Create related tables
-- ============================================

CREATE TABLE availability_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  team_id TEXT NOT NULL,
  day_of_week INTEGER,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  specific_date DATE,
  is_recurring BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE blocked_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  team_id TEXT NOT NULL,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE appointment_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  recipient_phone VARCHAR(20),
  recipient_email VARCHAR(255),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE weather_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  action_taken VARCHAR(50),
  new_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL
);

-- Create indexes on related tables
CREATE INDEX idx_availability_slots_team_id ON availability_slots(team_id);
CREATE INDEX idx_blocked_slots_team_id ON blocked_slots(team_id);
CREATE INDEX idx_appointment_reminders_appointment_id ON appointment_reminders(appointment_id);
CREATE INDEX idx_weather_alerts_appointment_id ON weather_alerts(appointment_id);

-- ============================================
-- STEP 3: Create basic functions
-- ============================================

-- Function to calculate end_at
CREATE OR REPLACE FUNCTION calculate_end_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND NEW.duration_minutes IS NOT NULL THEN
    NEW.end_at = NEW.scheduled_at + (NEW.duration_minutes || ' minutes')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 4: Create triggers
-- ============================================

CREATE TRIGGER calculate_appointment_end_at
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_end_at();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_slots_updated_at
  BEFORE UPDATE ON availability_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 5: Create advanced functions
-- ============================================

-- Conflict checking function
CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_user_id UUID,
  p_scheduled_at TIMESTAMP WITH TIME ZONE,
  p_duration_minutes INTEGER,
  p_appointment_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO conflict_count
  FROM appointments
  WHERE host_user_id = p_user_id
    AND status IN ('scheduled', 'confirmed')
    AND (p_appointment_id IS NULL OR id != p_appointment_id)
    AND scheduled_at < (p_scheduled_at + (p_duration_minutes || ' minutes')::INTERVAL)
    AND (scheduled_at + (duration_minutes || ' minutes')::INTERVAL) > p_scheduled_at;
  
  RETURN conflict_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Weather check function
CREATE OR REPLACE FUNCTION check_appointment_weather()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.work_type IN ('outdoor', 'mixed') THEN
    NEW.weather_suitable = NULL;
  ELSE
    NEW.weather_suitable = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_weather_on_appointment_create
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_appointment_weather();

-- Auto reschedule function
CREATE OR REPLACE FUNCTION auto_reschedule_for_weather(
  p_appointment_id UUID,
  p_new_date TIMESTAMP WITH TIME ZONE,
  p_reason TEXT
)
RETURNS UUID AS $$
DECLARE
  v_new_id UUID;
  v_old RECORD;
BEGIN
  -- Get original appointment
  SELECT * INTO v_old FROM appointments WHERE id = p_appointment_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
  END IF;
  
  -- Create new appointment
  INSERT INTO appointments (
    team_id, title, description, type,
    scheduled_at, duration_minutes,
    host_user_id, host_name,
    attendee_name, attendee_email, attendee_phone,
    location_type, location_address, work_type,
    project_id, original_scheduled_at, auto_rescheduled
  )
  VALUES (
    v_old.team_id,
    v_old.title || ' (Weather Rescheduled)',
    COALESCE(v_old.description, '') || ' - Rescheduled due to: ' || p_reason,
    v_old.type,
    p_new_date,
    v_old.duration_minutes,
    v_old.host_user_id,
    v_old.host_name,
    v_old.attendee_name,
    v_old.attendee_email,
    v_old.attendee_phone,
    v_old.location_type,
    v_old.location_address,
    v_old.work_type,
    v_old.project_id,
    v_old.scheduled_at,
    true
  )
  RETURNING id INTO v_new_id;
  
  -- Cancel original
  UPDATE appointments 
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = 'Weather: ' || p_reason
  WHERE id = p_appointment_id;
  
  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 6: Add callback columns to team_messages
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_messages') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'team_messages' 
                   AND column_name = 'callback_requested') THEN
      ALTER TABLE team_messages ADD COLUMN callback_requested BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'team_messages' 
                   AND column_name = 'preferred_callback_time') THEN
      ALTER TABLE team_messages ADD COLUMN preferred_callback_time VARCHAR(50);
    END IF;
  END IF;
END $$;

-- ============================================
-- STEP 7: Grant permissions
-- ============================================

GRANT ALL ON appointments TO authenticated;
GRANT ALL ON appointment_reminders TO authenticated;
GRANT ALL ON availability_slots TO authenticated;
GRANT ALL ON blocked_slots TO authenticated;
GRANT ALL ON weather_alerts TO authenticated;

GRANT ALL ON appointments TO anon;
GRANT ALL ON appointment_reminders TO anon;
GRANT ALL ON availability_slots TO anon;
GRANT ALL ON blocked_slots TO anon;
GRANT ALL ON weather_alerts TO anon;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT 'SUCCESS: Weather-Aware Scheduling System installed!' as status;