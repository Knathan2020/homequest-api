-- Create team_phones table for multi-tenant phone system
CREATE TABLE IF NOT EXISTS team_phones (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(50) UNIQUE NOT NULL,
  team_name VARCHAR(100) NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  
  -- Twilio Configuration
  twilio_number VARCHAR(20) UNIQUE NOT NULL,
  twilio_account_sid VARCHAR(100),
  twilio_auth_token_encrypted VARCHAR(255), -- Encrypted for security
  
  -- Vapi Configuration  
  vapi_phone_id VARCHAR(100) UNIQUE NOT NULL,
  vapi_api_key_encrypted VARCHAR(255), -- Optional: team-specific API key
  vapi_assistant_id VARCHAR(100), -- Optional: custom assistant
  
  -- Voice Configuration
  default_voice_id VARCHAR(100) DEFAULT 'ewxUvnyvvOehYjKjUVKC',
  voice_provider VARCHAR(20) DEFAULT '11labs',
  
  -- Usage & Limits
  monthly_minute_limit INTEGER DEFAULT 1000,
  minutes_used_this_month DECIMAL(10,2) DEFAULT 0,
  total_calls_this_month INTEGER DEFAULT 0,
  last_call_at TIMESTAMP,
  
  -- Billing
  stripe_subscription_id VARCHAR(100),
  billing_status VARCHAR(20) DEFAULT 'active', -- active, suspended, cancelled
  next_billing_date DATE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'provisioning', -- provisioning, active, suspended, cancelled
  provisioned_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_team_phones_team_id ON team_phones(team_id);
CREATE INDEX idx_team_phones_status ON team_phones(status);
CREATE INDEX idx_team_phones_twilio_number ON team_phones(twilio_number);

-- Create teams table if not exists
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  company_name VARCHAR(100),
  owner_id UUID NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  plan VARCHAR(20) DEFAULT 'starter', -- starter, professional, enterprise
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create profiles table if not exists
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  team_id VARCHAR(50),
  role VARCHAR(20) DEFAULT 'member', -- owner, admin, member
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  name VARCHAR(100),
  created_by UUID,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create call_logs table for tracking
CREATE TABLE IF NOT EXISTS call_logs (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(50) NOT NULL,
  call_id VARCHAR(100) UNIQUE,
  vapi_call_id VARCHAR(100),
  
  -- Call details
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  to_name VARCHAR(100),
  
  -- Call info
  direction VARCHAR(10), -- inbound, outbound
  duration_seconds INTEGER,
  status VARCHAR(20), -- initiated, ringing, in-progress, completed, failed
  
  -- Cost tracking
  cost_estimate DECIMAL(10,4),
  
  -- AI details
  voice_id VARCHAR(100),
  assistant_type VARCHAR(50), -- business, personal, custom
  
  -- Timestamps
  started_at TIMESTAMP,
  answered_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create index for call logs
CREATE INDEX idx_call_logs_team_id ON call_logs(team_id);
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);

-- Function to update minutes used (called after each call)
CREATE OR REPLACE FUNCTION update_team_minutes_used()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    UPDATE team_phones 
    SET 
      minutes_used_this_month = minutes_used_this_month + (NEW.duration_seconds / 60.0),
      total_calls_this_month = total_calls_this_month + 1,
      last_call_at = NEW.ended_at
    WHERE team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update minutes after call completes
CREATE TRIGGER update_minutes_after_call
AFTER INSERT OR UPDATE ON call_logs
FOR EACH ROW
EXECUTE FUNCTION update_team_minutes_used();

-- Function to reset monthly usage (run via cron job monthly)
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
  UPDATE team_phones
  SET 
    minutes_used_this_month = 0,
    total_calls_this_month = 0
  WHERE EXTRACT(DAY FROM CURRENT_DATE) = 1; -- Run on 1st of each month
END;
$$ LANGUAGE plpgsql;

-- Sample data for testing (optional)
-- INSERT INTO teams (id, name, company_name, owner_id, owner_email)
-- VALUES ('team_test_123', 'Test Team', 'Test Company', gen_random_uuid(), 'test@example.com');