-- Create Projects Table for HomeQuest
-- This table stores all construction projects for all teams

-- Drop table if exists (be careful in production!)
-- DROP TABLE IF EXISTS projects CASCADE;

-- Create the projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basic project information
  project_name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  
  -- Project details
  status VARCHAR(50) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  square_footage INTEGER,
  lot_size NUMERIC(10, 2),
  project_type VARCHAR(100), -- residential, commercial, renovation, etc.
  
  -- Dates
  start_date DATE,
  estimated_completion DATE,
  actual_completion DATE,
  
  -- Financial
  budget NUMERIC(15, 2),
  actual_cost NUMERIC(15, 2),
  
  -- Description and notes
  description TEXT,
  notes TEXT,
  
  -- Phases and milestones (JSONB for flexibility)
  phases JSONB DEFAULT '[]'::jsonb,
  milestones JSONB DEFAULT '[]'::jsonb,
  
  -- Team and ownership
  team_id UUID,
  user_id UUID, -- Project manager/owner
  created_by UUID,
  
  -- Metadata
  tags TEXT[], -- Array of tags for categorization
  custom_fields JSONB DEFAULT '{}'::jsonb, -- For any custom data
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_progress ON projects(progress);
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_projects_phases ON projects USING GIN(phases);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at 
  BEFORE UPDATE ON projects 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add Row Level Security (RLS) policies
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all projects in their team
CREATE POLICY "Team members can view their team projects" ON projects
  FOR SELECT
  USING (
    team_id IS NULL OR 
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create projects for their team
CREATE POLICY "Team members can create projects" ON projects
  FOR INSERT
  WITH CHECK (
    team_id IS NULL OR
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update their team's projects
CREATE POLICY "Team members can update their projects" ON projects
  FOR UPDATE
  USING (
    team_id IS NULL OR
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete their team's projects (be careful with this!)
CREATE POLICY "Team admins can delete projects" ON projects
  FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- Insert some example projects (optional - remove in production)
INSERT INTO projects (project_name, address, city, state, status, progress, square_footage, notes, phases)
VALUES 
  ('Maple Street Residence', '123 Maple St', 'Kennesaw', 'GA', 'active', 35, 4850, 'Foundation complete, framing in progress', 
   '[{"name": "Foundation", "status": "completed", "progress": 100}, {"name": "Framing", "status": "in_progress", "progress": 35}]'::jsonb),
  
  ('Oak Avenue Complex', '456 Oak Ave', 'Marietta', 'GA', 'planning', 10, 12000, 'Awaiting permits',
   '[{"name": "Permits", "status": "in_progress", "progress": 50}, {"name": "Site Prep", "status": "pending", "progress": 0}]'::jsonb),
  
  ('Downtown Tower', '789 Peachtree St', 'Atlanta', 'GA', 'completed', 100, 45000, 'Project successfully delivered',
   '[{"name": "Foundation", "status": "completed", "progress": 100}, {"name": "Structure", "status": "completed", "progress": 100}]'::jsonb),
  
  ('Riverside Development', '321 River Rd', 'Roswell', 'GA', 'active', 65, 8500, 'Electrical and plumbing phase',
   '[{"name": "Foundation", "status": "completed", "progress": 100}, {"name": "Framing", "status": "completed", "progress": 100}, {"name": "MEP", "status": "in_progress", "progress": 65}]'::jsonb)
ON CONFLICT DO NOTHING;

-- Grant permissions (adjust based on your needs)
GRANT ALL ON projects TO authenticated;
GRANT SELECT ON projects TO anon;

COMMENT ON TABLE projects IS 'Stores all construction projects for the HomeQuest platform';
COMMENT ON COLUMN projects.phases IS 'JSON array of project phases with status and progress';
COMMENT ON COLUMN projects.milestones IS 'JSON array of project milestones and deadlines';
COMMENT ON COLUMN projects.custom_fields IS 'Flexible JSON storage for client-specific requirements';