-- Create the floor_plan_jobs table with user authentication
-- Each job is owned by a specific user

CREATE TABLE IF NOT EXISTS floor_plan_jobs (
  -- Primary key
  id TEXT PRIMARY KEY,
  
  -- User ownership (references auth.users table)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
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
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON floor_plan_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON floor_plan_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_timestamp ON floor_plan_jobs(timestamp);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON floor_plan_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON floor_plan_jobs(user_id, status);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function before each update
DROP TRIGGER IF EXISTS update_floor_plan_jobs_updated_at ON floor_plan_jobs;
CREATE TRIGGER update_floor_plan_jobs_updated_at
  BEFORE UPDATE ON floor_plan_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for the table
ALTER TABLE floor_plan_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own jobs" ON floor_plan_jobs;
DROP POLICY IF EXISTS "Users can create their own jobs" ON floor_plan_jobs;
DROP POLICY IF EXISTS "Users can update their own jobs" ON floor_plan_jobs;
DROP POLICY IF EXISTS "Users can delete their own old jobs" ON floor_plan_jobs;

-- Create RLS policies for user-specific access
-- Policy for SELECT (users can only see their own jobs)
CREATE POLICY "Users can view their own jobs"
  ON floor_plan_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for INSERT (users can only create jobs for themselves)
CREATE POLICY "Users can create their own jobs"
  ON floor_plan_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy for UPDATE (users can only update their own jobs)
CREATE POLICY "Users can update their own jobs"
  ON floor_plan_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy for DELETE (users can only delete their own old jobs)
CREATE POLICY "Users can delete their own old jobs"
  ON floor_plan_jobs
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND status IN ('completed', 'failed') 
    AND created_at < NOW() - INTERVAL '1 hour'
  );

-- Create a view for job statistics per user
CREATE OR REPLACE VIEW user_job_stats AS
SELECT 
  user_id,
  COUNT(*) as total_jobs,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
  COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) as active_jobs,
  MAX(created_at) as last_job_created
FROM floor_plan_jobs
GROUP BY user_id;

-- Grant permissions
GRANT ALL ON floor_plan_jobs TO authenticated;
GRANT SELECT ON user_job_stats TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE floor_plan_jobs IS 'Stores floor plan processing jobs for authenticated users';
COMMENT ON COLUMN floor_plan_jobs.user_id IS 'ID of the user who owns this job';
COMMENT ON COLUMN floor_plan_jobs.id IS 'Unique job identifier (UUID)';
COMMENT ON COLUMN floor_plan_jobs.status IS 'Current job status: pending, processing, completed, or failed';
COMMENT ON COLUMN floor_plan_jobs.progress IS 'Job progress percentage (0-100)';
COMMENT ON COLUMN floor_plan_jobs.result IS 'Processing results including detected walls, doors, rooms, etc.';
COMMENT ON COLUMN floor_plan_jobs.error IS 'Error details if job failed';
COMMENT ON COLUMN floor_plan_jobs.metadata IS 'Additional job metadata (page info for PDFs, etc.)';

-- Optional: Create a function to get user's recent jobs
CREATE OR REPLACE FUNCTION get_user_recent_jobs(
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT,
  status TEXT,
  progress INTEGER,
  filename TEXT,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.status,
    j.progress,
    j.filename,
    j.created_at
  FROM floor_plan_jobs j
  WHERE j.user_id = auth.uid()
  ORDER BY j.created_at DESC
  LIMIT limit_count;
END;
$$;