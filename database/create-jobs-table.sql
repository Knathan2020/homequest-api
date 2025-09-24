-- Create the floor_plan_jobs table for storing processing jobs
-- This table allows all users to share and see the same job data

CREATE TABLE IF NOT EXISTS floor_plan_jobs (
  -- Primary key
  id TEXT PRIMARY KEY,
  
  -- Job status and progress
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- File information
  filename TEXT,
  upload_path TEXT,
  image_path TEXT,
  
  -- Results and errors (stored as JSON)
  result JSONB,
  error JSONB,
  metadata JSONB,
  
  -- Timestamps
  uploaded_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  timestamp BIGINT,
  
  -- Automatic timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON floor_plan_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_timestamp ON floor_plan_jobs(timestamp);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON floor_plan_jobs(created_at DESC);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function before each update
CREATE TRIGGER update_floor_plan_jobs_updated_at
  BEFORE UPDATE ON floor_plan_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for the table
ALTER TABLE floor_plan_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies to allow EVERYONE (including anonymous users) to read and write jobs
-- This makes it work like a public demo without authentication

-- Policy for SELECT (anyone can view any job)
CREATE POLICY "Anyone can view all jobs"
  ON floor_plan_jobs
  FOR SELECT
  USING (true);

-- Policy for INSERT (anyone can create jobs)
CREATE POLICY "Anyone can create jobs"
  ON floor_plan_jobs
  FOR INSERT
  WITH CHECK (true);

-- Policy for UPDATE (anyone can update any job)
CREATE POLICY "Anyone can update jobs"
  ON floor_plan_jobs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy for DELETE (anyone can delete old jobs)
CREATE POLICY "Anyone can delete old jobs"
  ON floor_plan_jobs
  FOR DELETE
  USING (
    -- Only allow deletion of completed/failed jobs older than 1 hour
    status IN ('completed', 'failed') 
    AND created_at < NOW() - INTERVAL '1 hour'
  );

-- Create a scheduled function to clean up old jobs (optional - requires pg_cron extension)
-- This can be set up in Supabase dashboard under Database > Extensions
/*
SELECT cron.schedule(
  'cleanup-old-jobs',
  '0 * * * *', -- Run every hour
  $$
  DELETE FROM floor_plan_jobs 
  WHERE status IN ('completed', 'failed') 
  AND created_at < NOW() - INTERVAL '24 hours';
  $$
);
*/

-- Grant permissions for EVERYONE including anonymous users
GRANT ALL ON floor_plan_jobs TO anon;
GRANT ALL ON floor_plan_jobs TO authenticated;
GRANT ALL ON floor_plan_jobs TO service_role;

-- Add comments for documentation
COMMENT ON TABLE floor_plan_jobs IS 'Stores floor plan processing jobs for all users';
COMMENT ON COLUMN floor_plan_jobs.id IS 'Unique job identifier (UUID)';
COMMENT ON COLUMN floor_plan_jobs.status IS 'Current job status: pending, processing, completed, or failed';
COMMENT ON COLUMN floor_plan_jobs.progress IS 'Job progress percentage (0-100)';
COMMENT ON COLUMN floor_plan_jobs.result IS 'Processing results including detected walls, doors, rooms, etc.';
COMMENT ON COLUMN floor_plan_jobs.error IS 'Error details if job failed';
COMMENT ON COLUMN floor_plan_jobs.metadata IS 'Additional job metadata (page info for PDFs, etc.)';