-- Combined SQL migrations for Weather-Aware Scheduling System
-- Run this entire script in your Supabase SQL editor

-- ============================================
-- PART 1: Create appointments and scheduling tables
-- ============================================

-- Create appointments and scheduling table
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
  end_at TIMESTAMP WITH TIME ZONE,
  
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
  
  -- Weather fields
  work_type VARCHAR(50) DEFAULT 'indoor', -- 'indoor', 'outdoor', 'mixed'
  location_address TEXT, -- Physical address for weather checking
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  weather_checked_at TIMESTAMP WITH TIME ZONE,
  weather_forecast JSONB, -- Store the full forecast data
  weather_suitable BOOLEAN,
  weather_warnings TEXT[],
  weather_recommendation TEXT,
  auto_rescheduled BOOLEAN DEFAULT false,
  original_scheduled_at TIMESTAMP WITH TIME ZONE,
  
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
CREATE INDEX IF NOT EXISTS idx_appointments_team_id ON appointments(team_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_host_user_id ON appointments(host_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_attendee_phone ON appointments(attendee_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_work_type ON appointments(work_type);
CREATE INDEX IF NOT EXISTS idx_appointments_weather_suitable ON appointments(weather_suitable);

-- ============================================
-- PART 2: Create availability and reminders tables
-- ============================================

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

CREATE INDEX IF NOT EXISTS idx_availability_slots_user_id ON availability_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_slots_team_id ON availability_slots(team_id);

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

CREATE INDEX IF NOT EXISTS idx_blocked_slots_user_id ON blocked_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_team_id ON blocked_slots(team_id);

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

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment_id ON appointment_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_send_at ON appointment_reminders(send_at);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_sent ON appointment_reminders(sent);

-- ============================================
-- PART 3: Create weather alerts table
-- ============================================

-- Create weather alerts table for proactive notifications
CREATE TABLE IF NOT EXISTS weather_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- 'rain', 'storm', 'heat', 'cold', 'wind', 'snow'
  severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'extreme'
  message TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  action_taken VARCHAR(50), -- 'rescheduled', 'notified', 'ignored'
  new_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_appointment ON weather_alerts(appointment_id);
CREATE INDEX IF NOT EXISTS idx_weather_alerts_severity ON weather_alerts(severity);

-- ============================================
-- PART 4: Create functions
-- ============================================

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

-- Create function to check weather before appointment
CREATE OR REPLACE FUNCTION check_appointment_weather()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check for outdoor appointments
  IF NEW.work_type = 'outdoor' OR NEW.work_type = 'mixed' THEN
    -- Mark that weather needs to be checked
    NEW.weather_suitable = NULL; -- Will be updated by API
    NEW.weather_checked_at = NULL;
  ELSE
    -- Indoor work is always weather-suitable
    NEW.weather_suitable = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new appointments
DROP TRIGGER IF EXISTS check_weather_on_appointment_create ON appointments;
CREATE TRIGGER check_weather_on_appointment_create
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_appointment_weather();

-- Create function to auto-reschedule based on weather
CREATE OR REPLACE FUNCTION auto_reschedule_for_weather(
  p_appointment_id UUID,
  p_new_date TIMESTAMP WITH TIME ZONE,
  p_reason TEXT
)
RETURNS UUID AS $$
DECLARE
  v_new_appointment_id UUID;
  v_original_appointment appointments%ROWTYPE;
BEGIN
  -- Get original appointment
  SELECT * INTO v_original_appointment
  FROM appointments
  WHERE id = p_appointment_id;
  
  -- Create new appointment with updated date
  INSERT INTO appointments (
    team_id,
    title,
    description,
    type,
    status,
    scheduled_at,
    duration_minutes,
    host_user_id,
    host_name,
    attendee_name,
    attendee_email,
    attendee_phone,
    attendee_company,
    location_type,
    location_details,
    location_address,
    latitude,
    longitude,
    work_type,
    project_id,
    vendor_id,
    notes,
    source,
    original_scheduled_at,
    auto_rescheduled
  )
  SELECT
    team_id,
    title || ' (Rescheduled due to weather)',
    COALESCE(description, '') || E'\n\nRescheduled from ' || 
      to_char(scheduled_at, 'MM/DD/YYYY HH:MI AM') || ' due to: ' || p_reason,
    type,
    'scheduled',
    p_new_date,
    duration_minutes,
    host_user_id,
    host_name,
    attendee_name,
    attendee_email,
    attendee_phone,
    attendee_company,
    location_type,
    location_details,
    location_address,
    latitude,
    longitude,
    work_type,
    project_id,
    vendor_id,
    COALESCE(notes, '') || E'\n\nAuto-rescheduled due to weather: ' || p_reason,
    source,
    scheduled_at, -- Store original date
    true
  FROM appointments
  WHERE id = p_appointment_id
  RETURNING id INTO v_new_appointment_id;
  
  -- Cancel original appointment
  UPDATE appointments
  SET 
    status = 'cancelled',
    cancelled_at = NOW(),
    cancellation_reason = 'Weather: ' || p_reason
  WHERE id = p_appointment_id;
  
  -- Create weather alert record
  INSERT INTO weather_alerts (
    appointment_id,
    alert_type,
    severity,
    message,
    action_taken,
    new_appointment_id
  )
  VALUES (
    p_appointment_id,
    CASE 
      WHEN p_reason ILIKE '%rain%' THEN 'rain'
      WHEN p_reason ILIKE '%storm%' THEN 'storm'
      WHEN p_reason ILIKE '%snow%' THEN 'snow'
      WHEN p_reason ILIKE '%wind%' THEN 'wind'
      WHEN p_reason ILIKE '%heat%' THEN 'heat'
      WHEN p_reason ILIKE '%cold%' THEN 'cold'
      ELSE 'other'
    END,
    'high',
    p_reason,
    'rescheduled',
    v_new_appointment_id
  );
  
  RETURN v_new_appointment_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate end_at
CREATE OR REPLACE FUNCTION calculate_end_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.end_at = NEW.scheduled_at + (NEW.duration_minutes || ' minutes')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to calculate end_at
DROP TRIGGER IF EXISTS calculate_appointment_end_at ON appointments;
CREATE TRIGGER calculate_appointment_end_at
  BEFORE INSERT OR UPDATE OF scheduled_at, duration_minutes ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_end_at();

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_availability_slots_updated_at ON availability_slots;
CREATE TRIGGER update_availability_slots_updated_at
  BEFORE UPDATE ON availability_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART 5: Add team_messages columns if table exists
-- ============================================

-- Add callback columns to team_messages table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_messages') THEN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_messages' AND column_name = 'callback_requested') THEN
      ALTER TABLE team_messages ADD COLUMN callback_requested BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_messages' AND column_name = 'preferred_callback_time') THEN
      ALTER TABLE team_messages ADD COLUMN preferred_callback_time VARCHAR(50);
    END IF;
  END IF;
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

-- Grant permissions (if needed)
GRANT ALL ON appointments TO authenticated;
GRANT ALL ON appointment_reminders TO authenticated;
GRANT ALL ON availability_slots TO authenticated;
GRANT ALL ON blocked_slots TO authenticated;
GRANT ALL ON weather_alerts TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Weather-Aware Scheduling System tables created successfully!';
  RAISE NOTICE '📋 Tables created: appointments, appointment_reminders, availability_slots, blocked_slots, weather_alerts';
  RAISE NOTICE '🌦️ Weather checking is now enabled for outdoor appointments';
  RAISE NOTICE '📞 AI assistant can now schedule weather-aware callbacks';
END $$;