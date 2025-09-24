-- Create usage tracking table for real-time statistics
CREATE TABLE IF NOT EXISTS usage_events (
  id SERIAL PRIMARY KEY,
  team_id TEXT NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'call_started', 'call_ended', 'transfer_initiated', 'appointment_scheduled', etc.
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX(team_id, created_at)
);

-- Add usage tracking to existing tables if not already present
DO $$
BEGIN
  -- Add usage columns to call_transcripts if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_transcripts' AND column_name = 'duration') THEN
    ALTER TABLE call_transcripts ADD COLUMN duration INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_transcripts' AND column_name = 'call_status') THEN
    ALTER TABLE call_transcripts ADD COLUMN call_status VARCHAR(20) DEFAULT 'unknown';
  END IF;

  -- Add team_id to call_transcripts if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_transcripts' AND column_name = 'team_id') THEN
    ALTER TABLE call_transcripts ADD COLUMN team_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111';
  END IF;
END $$;