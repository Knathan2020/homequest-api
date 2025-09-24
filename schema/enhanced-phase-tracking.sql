-- Enhanced Phase Tracking Schema for HomeQuest Construction Platform
-- This schema supports comprehensive phase management with AI analysis, photo tracking, and vendor coordination

-- ================================
-- CORE TABLES
-- ================================

-- Projects table (if not exists)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address TEXT,
  owner_id UUID REFERENCES auth.users(id),
  status VARCHAR(50) DEFAULT 'planning',
  budget DECIMAL(12,2),
  start_date DATE,
  estimated_completion DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced project phases with detailed tracking
CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_key VARCHAR(50) NOT NULL, -- 'site_prep', 'foundation', 'framing', etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, in_progress, completed, blocked
  progress INTEGER DEFAULT 0, -- 0-100 percentage
  budget DECIMAL(12,2),
  spent DECIMAL(12,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  estimated_duration_days INTEGER,
  actual_duration_days INTEGER,
  primary_vendor VARCHAR(255),
  vendor_contact VARCHAR(255),
  vendor_id UUID REFERENCES vendors(id),
  notes TEXT,
  ai_notes TEXT,
  weather_sensitive BOOLEAN DEFAULT false,
  critical_path BOOLEAN DEFAULT false,
  required_trades TEXT[], -- Array of trade types
  inspections_required TEXT[], -- Array of inspection types
  safety_requirements TEXT[],
  dependencies UUID[], -- Array of phase IDs this phase depends on
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  trade VARCHAR(100), -- 'plumbing', 'electrical', 'framing', etc.
  specialties TEXT[],
  rating DECIMAL(3,2), -- 1.00 to 5.00
  active BOOLEAN DEFAULT true,
  license_number VARCHAR(100),
  insurance_verified BOOLEAN DEFAULT false,
  address TEXT,
  service_radius_miles INTEGER,
  hourly_rate DECIMAL(8,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- PHOTO & AI ANALYSIS TABLES
-- ================================

-- Phase photos with AI analysis
CREATE TABLE IF NOT EXISTS phase_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  url TEXT NOT NULL,
  filename VARCHAR(255),
  file_size BIGINT,
  mime_type VARCHAR(100),
  description TEXT,
  upload_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  location_data JSONB, -- GPS coordinates if available

  -- AI Analysis Results
  ai_analysis_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  ai_analysis_timestamp TIMESTAMP WITH TIME ZONE,
  safety_score INTEGER, -- 1-10 safety assessment
  quality_score INTEGER, -- 1-10 quality assessment
  progress_assessment TEXT,
  safety_issues TEXT[],
  quality_issues TEXT[],
  detected_objects TEXT[],
  recommended_actions TEXT[],
  confidence_score DECIMAL(5,4), -- 0.0000 to 1.0000

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI actions and recommendations log
CREATE TABLE IF NOT EXISTS ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL, -- 'photo_analysis', 'vendor_communication', 'safety_alert', etc.
  action_data JSONB,
  confidence_score DECIMAL(5,4),
  status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed
  executed_at TIMESTAMP WITH TIME ZONE,
  result_data JSONB,
  user_feedback INTEGER, -- -1 (negative), 0 (neutral), 1 (positive)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- VENDOR & COMMUNICATION TABLES
-- ================================

-- Vendor bids and quotes
CREATE TABLE IF NOT EXISTS vendor_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  bid_amount DECIMAL(12,2),
  estimated_duration_days INTEGER,
  start_availability DATE,
  materials_included BOOLEAN DEFAULT false,
  warranty_period_months INTEGER,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected, withdrawn
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Communication log between project stakeholders
CREATE TABLE IF NOT EXISTS phase_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  recipient_id UUID REFERENCES auth.users(id),
  message_type VARCHAR(50), -- 'email', 'sms', 'call', 'automated'
  subject VARCHAR(255),
  message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  response_required BOOLEAN DEFAULT false,
  automated BOOLEAN DEFAULT false,
  related_ai_action UUID REFERENCES ai_actions(id)
);

-- ================================
-- DOCUMENT & INVOICE TABLES
-- ================================

-- Phase-related invoices and documents
CREATE TABLE IF NOT EXISTS phase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id),
  invoice_number VARCHAR(100),
  amount DECIMAL(12,2),
  due_date DATE,
  paid_date DATE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, paid, disputed
  file_url TEXT,
  description TEXT,
  line_items JSONB,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document storage for permits, contracts, etc.
CREATE TABLE IF NOT EXISTS phase_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  document_type VARCHAR(100), -- 'permit', 'contract', 'inspection_report', 'change_order'
  filename VARCHAR(255),
  file_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  description TEXT,
  tags TEXT[],
  version INTEGER DEFAULT 1,
  parent_document_id UUID REFERENCES phase_documents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- WORKFLOW & AUTOMATION TABLES
-- ================================

-- Automated workflow rules
CREATE TABLE IF NOT EXISTS phase_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  trigger_event VARCHAR(100), -- 'phase_completed', 'photo_uploaded', 'deadline_approaching'
  trigger_conditions JSONB,
  actions JSONB, -- Array of actions to execute
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scheduled notifications and reminders
CREATE TABLE IF NOT EXISTS phase_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id),
  notification_type VARCHAR(100),
  title VARCHAR(255),
  message TEXT,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  action_url TEXT,
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- PERFORMANCE & ANALYTICS TABLES
-- ================================

-- Phase timeline tracking
CREATE TABLE IF NOT EXISTS phase_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  event_type VARCHAR(100), -- 'started', 'paused', 'resumed', 'milestone_reached', 'issue_reported'
  event_data JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  automated BOOLEAN DEFAULT false
);

-- Weather data for weather-sensitive phases
CREATE TABLE IF NOT EXISTS weather_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  date DATE,
  temperature_high INTEGER,
  temperature_low INTEGER,
  precipitation_inches DECIMAL(4,2),
  wind_speed_mph INTEGER,
  conditions VARCHAR(100),
  construction_favorable BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- Project phases indexes
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_status ON project_phases(status);
CREATE INDEX IF NOT EXISTS idx_project_phases_vendor_id ON project_phases(vendor_id);

-- Photo indexes
CREATE INDEX IF NOT EXISTS idx_phase_photos_phase_id ON phase_photos(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_photos_ai_status ON phase_photos(ai_analysis_status);
CREATE INDEX IF NOT EXISTS idx_phase_photos_upload_timestamp ON phase_photos(upload_timestamp);

-- AI actions indexes
CREATE INDEX IF NOT EXISTS idx_ai_actions_project_id ON ai_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_type_status ON ai_actions(action_type, status);
CREATE INDEX IF NOT EXISTS idx_ai_actions_created_at ON ai_actions(created_at);

-- Communication indexes
CREATE INDEX IF NOT EXISTS idx_phase_communications_phase_id ON phase_communications(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_communications_recipient ON phase_communications(recipient_id, read_at);

-- ================================
-- ROW LEVEL SECURITY (RLS)
-- ================================

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_logs ENABLE ROW LEVEL SECURITY;

-- ================================
-- RLS POLICIES
-- ================================

-- Project access policies
CREATE POLICY "Users can view projects they own or are assigned to" ON projects
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (
      SELECT project_id FROM project_phases
      WHERE vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
    )
  );

-- Phase access policies
CREATE POLICY "Users can view phases for accessible projects" ON project_phases
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    ) OR
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

CREATE POLICY "Project owners can modify phases" ON project_phases
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Vendor policies
CREATE POLICY "Vendors can view their own profile" ON vendors
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Vendors can update their own profile" ON vendors
  FOR UPDATE USING (user_id = auth.uid());

-- Photo access policies
CREATE POLICY "Users can view photos for accessible phases" ON phase_photos
  FOR SELECT USING (
    phase_id IN (
      SELECT id FROM project_phases WHERE
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()) OR
        vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can upload photos to accessible phases" ON phase_photos
  FOR INSERT WITH CHECK (
    phase_id IN (
      SELECT id FROM project_phases WHERE
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()) OR
        vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
    )
  );

-- ================================
-- FUNCTIONS AND TRIGGERS
-- ================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_phases_updated_at
  BEFORE UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log phase timeline events
CREATE OR REPLACE FUNCTION log_phase_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO phase_timeline_events (phase_id, event_type, event_data)
    VALUES (
      NEW.id,
      'status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'progress', NEW.progress
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_phase_status_changes
  AFTER UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION log_phase_status_change();

-- ================================
-- SAMPLE DATA FOR TESTING
-- ================================

-- Insert sample phase definitions (these would be referenced by phase_key)
-- This helps maintain consistency across projects

-- Sample project
INSERT INTO projects (id, name, description, address, status, budget) VALUES
('00000000-0000-0000-0000-000000000001', 'Sample Construction Project', 'Residential home construction', '123 Construction Ave', 'active', 250000.00);

-- Sample phases
INSERT INTO project_phases (
  id, project_id, phase_key, name, description, status, budget,
  estimated_duration_days, weather_sensitive, critical_path, required_trades
) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'site_prep', 'Site Preparation', 'Clearing and preparing the construction site', 'active', 12000.00, 7, true, true, ARRAY['excavation', 'surveying']),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'foundation', 'Foundation', 'Pouring concrete foundation and basement', 'pending', 35000.00, 14, true, true, ARRAY['concrete', 'rebar']),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'framing', 'Framing', 'Wooden frame construction', 'pending', 28000.00, 10, false, true, ARRAY['framing', 'carpentry']);

-- Sample vendor
INSERT INTO vendors (id, company_name, contact_name, email, trade, rating, active) VALUES
('20000000-0000-0000-0000-000000000001', 'Superior Excavation Co.', 'Mike Johnson', 'mike@superiorexcavation.com', 'excavation', 4.8, true);

-- Update sample phase with vendor
UPDATE project_phases SET
  vendor_id = '20000000-0000-0000-0000-000000000001',
  primary_vendor = 'Superior Excavation Co.',
  vendor_contact = 'mike@superiorexcavation.com'
WHERE id = '10000000-0000-0000-0000-000000000001';