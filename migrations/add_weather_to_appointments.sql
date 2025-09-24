-- Add weather-related columns to appointments table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS work_type VARCHAR(50) DEFAULT 'indoor', -- 'indoor', 'outdoor', 'mixed'
ADD COLUMN IF NOT EXISTS location_address TEXT, -- Physical address for weather checking
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS weather_checked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS weather_forecast JSONB, -- Store the full forecast data
ADD COLUMN IF NOT EXISTS weather_suitable BOOLEAN,
ADD COLUMN IF NOT EXISTS weather_warnings TEXT[],
ADD COLUMN IF NOT EXISTS weather_recommendation TEXT,
ADD COLUMN IF NOT EXISTS auto_rescheduled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_scheduled_at TIMESTAMP WITH TIME ZONE;

-- Create index for weather queries
CREATE INDEX IF NOT EXISTS idx_appointments_work_type ON appointments(work_type);
CREATE INDEX IF NOT EXISTS idx_appointments_weather_suitable ON appointments(weather_suitable);

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

-- Sample query to find appointments that need weather checking
-- SELECT id, scheduled_at, location_address, work_type
-- FROM appointments
-- WHERE work_type IN ('outdoor', 'mixed')
--   AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
--   AND (weather_checked_at IS NULL OR weather_checked_at < NOW() - INTERVAL '6 hours')
--   AND status IN ('scheduled', 'confirmed');