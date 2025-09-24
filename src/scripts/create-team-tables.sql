-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  department TEXT,
  phone_number TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_online BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_members_is_online ON team_members(is_online);

-- Create team_invitations table for pending invites
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  invitation_token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email)
);

-- Create index for invitation tokens
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(invitation_token);

-- Add RLS (Row Level Security) policies
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see all members of their team
CREATE POLICY "Users can view their team members" ON team_members
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Team owners and admins can insert/update/delete team members
CREATE POLICY "Team admins can manage members" ON team_members
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Policy: Users can view invitations for their team
CREATE POLICY "Users can view team invitations" ON team_invitations
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Team admins can manage invitations
CREATE POLICY "Team admins can manage invitations" ON team_invitations
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Function to update last_seen and online status
CREATE OR REPLACE FUNCTION update_user_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_seen on any update
CREATE TRIGGER update_team_member_activity
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_user_activity();