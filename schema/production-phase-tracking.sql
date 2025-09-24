-- Production Phase Tracking Schema for HomeQuest Construction Platform
-- Comprehensive database design for construction phase management with AI integration

-- ================================
-- ENABLE REQUIRED EXTENSIONS
-- ================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================
-- CORE PROJECT MANAGEMENT TABLES
-- ================================

-- Projects table (enhanced)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT,
    client_name VARCHAR(255),
    client_contact JSONB, -- {email, phone, company}
    project_type VARCHAR(100), -- 'residential', 'commercial', 'renovation'
    total_budget DECIMAL(15,2),
    start_date DATE,
    estimated_completion DATE,
    actual_completion DATE,
    status VARCHAR(50) DEFAULT 'planning', -- planning, active, on_hold, completed, cancelled
    blueprint_url TEXT, -- Main blueprint/floorplan for AI comparison
    project_manager_id UUID REFERENCES auth.users(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Metadata
    project_number VARCHAR(50) UNIQUE,
    square_footage INTEGER,
    lot_size DECIMAL(10,2),
    permits_required TEXT[],
    zoning_info TEXT
);

-- Enhanced project phases with comprehensive tracking
CREATE TABLE IF NOT EXISTS project_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Phase Definition
    phase_name VARCHAR(255) NOT NULL,
    phase_type VARCHAR(100) NOT NULL, -- 'grading', 'foundation', 'framing', etc.
    description TEXT,
    phase_order INTEGER NOT NULL,

    -- Scheduling
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    estimated_duration_days INTEGER,

    -- Status and Progress
    status VARCHAR(50) DEFAULT 'not_started', -- not_started, in_progress, blocked, complete, on_hold
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    completion_criteria TEXT[],
    milestones JSONB, -- [{name, date, completed, notes}]

    -- Financial
    budget_allocated DECIMAL(12,2),
    actual_cost DECIMAL(12,2) DEFAULT 0,

    -- Vendor Management
    assigned_vendor_id UUID REFERENCES vendors(id),
    vendor_contact_info JSONB,
    vendor_status VARCHAR(50), -- pending, confirmed, working, completed

    -- Dependencies and Requirements
    prerequisite_phases UUID[],
    required_permits TEXT[],
    required_inspections TEXT[],
    weather_dependent BOOLEAN DEFAULT false,
    critical_path BOOLEAN DEFAULT false,

    -- Notes and Documentation
    notes TEXT,
    ai_generated_notes TEXT,
    internal_notes TEXT, -- Only visible to builders

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Vendors table (enhanced)
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id), -- If vendor has system access

    -- Company Information
    company_name VARCHAR(255) NOT NULL,
    business_license VARCHAR(100),
    tax_id VARCHAR(50),

    -- Contact Information
    primary_contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    website VARCHAR(255),

    -- Business Details
    specialties TEXT[], -- ['electrical', 'plumbing', 'hvac']
    service_areas TEXT[], -- Geographic areas served
    years_in_business INTEGER,
    employee_count INTEGER,

    -- Ratings and Performance
    overall_rating DECIMAL(3,2) CHECK (overall_rating >= 1.0 AND overall_rating <= 5.0),
    total_projects_completed INTEGER DEFAULT 0,
    on_time_percentage DECIMAL(5,2),
    quality_score DECIMAL(3,2),

    -- Compliance and Insurance
    insurance_verified BOOLEAN DEFAULT false,
    insurance_expiry DATE,
    bonded BOOLEAN DEFAULT false,
    certifications TEXT[],

    -- Availability and Pricing
    hourly_rate DECIMAL(8,2),
    daily_rate DECIMAL(10,2),
    minimum_project_size DECIMAL(12,2),
    availability_status VARCHAR(50) DEFAULT 'available', -- available, busy, unavailable

    -- System Metadata
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- PHOTO AND MEDIA MANAGEMENT
-- ================================

-- Phase photos with comprehensive AI analysis
CREATE TABLE IF NOT EXISTS phase_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,

    -- File Information
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    file_size BIGINT,
    mime_type VARCHAR(100),

    -- Capture Information
    uploaded_by UUID REFERENCES auth.users(id),
    upload_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    capture_timestamp TIMESTAMP WITH TIME ZONE,
    camera_info JSONB, -- {device, settings, gps}

    -- Categorization
    photo_type VARCHAR(100), -- 'progress', 'issue', 'completion', 'safety'
    tags TEXT[],
    description TEXT,

    -- AI Analysis Status
    ai_analysis_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, requires_review
    ai_analysis_timestamp TIMESTAMP WITH TIME ZONE,
    ai_confidence_score DECIMAL(5,4), -- 0.0000 to 1.0000

    -- Blueprint Comparison
    blueprint_comparison_requested BOOLEAN DEFAULT true,
    blueprint_used_for_comparison TEXT, -- URL of blueprint used
    comparison_result JSONB, -- Structured comparison data

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI analysis results (detailed breakdown)
CREATE TABLE IF NOT EXISTS ai_photo_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photo_id UUID REFERENCES phase_photos(id) ON DELETE CASCADE,

    -- Analysis Metadata
    analysis_engine VARCHAR(50), -- 'gpt-4-vision', 'claude-vision'
    analysis_version VARCHAR(20),
    processing_time_ms INTEGER,

    -- Progress Assessment
    progress_assessment JSONB, -- {estimated_completion, key_elements_detected, missing_elements}
    progress_score INTEGER CHECK (progress_score >= 0 AND progress_score <= 100),
    readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100),

    -- Quality Analysis
    quality_indicators JSONB, -- {workmanship, materials, compliance}
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),

    -- Safety Analysis
    safety_observations JSONB, -- {hazards_detected, ppe_compliance, safety_score}
    safety_score INTEGER CHECK (safety_score >= 0 AND safety_score <= 100),
    safety_issues TEXT[],

    -- Issue Detection
    issues_detected JSONB, -- [{type, severity, location, description, recommendation}]
    defects_found TEXT[],
    compliance_issues TEXT[],

    -- Blueprint Comparison Results
    blueprint_alignment JSONB, -- {alignment_score, deviations, match_percentage}
    dimensional_accuracy JSONB, -- {measurements, tolerances, variances}

    -- Recommendations
    next_steps TEXT[],
    recommendations TEXT[],
    required_actions TEXT[],

    -- Raw AI Response
    raw_analysis_json JSONB, -- Full AI response for debugging

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- DOCUMENT AND INVOICE MANAGEMENT
-- ================================

-- Phase invoices
CREATE TABLE IF NOT EXISTS phase_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id),

    -- Invoice Details
    invoice_number VARCHAR(100),
    invoice_date DATE,
    due_date DATE,

    -- Financial Information
    subtotal DECIMAL(12,2),
    tax_amount DECIMAL(12,2),
    total_amount DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'USD',

    -- Line Items
    line_items JSONB, -- [{description, quantity, unit_price, total}]

    -- Payment Information
    payment_terms VARCHAR(100),
    payment_method VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'pending', -- pending, partial, paid, overdue, disputed
    paid_amount DECIMAL(12,2) DEFAULT 0,
    payment_date DATE,

    -- Document Management
    invoice_file_url TEXT,
    receipt_file_url TEXT,

    -- Approval Workflow
    approval_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, requires_review
    approved_by UUID REFERENCES auth.users(id),
    approval_date TIMESTAMP WITH TIME ZONE,
    approval_notes TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_by UUID REFERENCES auth.users(id)
);

-- General phase documents
CREATE TABLE IF NOT EXISTS phase_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,

    -- Document Information
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(100), -- 'permit', 'inspection_report', 'change_order', 'contract'
    file_url TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),

    -- Categorization
    category VARCHAR(100),
    tags TEXT[],
    description TEXT,

    -- Document Metadata
    document_date DATE,
    expiry_date DATE,
    version INTEGER DEFAULT 1,
    supersedes_document_id UUID REFERENCES phase_documents(id),

    -- Access Control
    visibility_level VARCHAR(50) DEFAULT 'project', -- public, project, internal, restricted

    -- Metadata
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- COMMUNICATION AND WORKFLOW
-- ================================

-- Vendor communication log
CREATE TABLE IF NOT EXISTS vendor_communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id),

    -- Communication Details
    communication_type VARCHAR(50), -- 'call', 'sms', 'email', 'in_person'
    direction VARCHAR(20), -- 'inbound', 'outbound'
    subject VARCHAR(255),
    message_content TEXT,

    -- Participants
    initiated_by UUID REFERENCES auth.users(id),
    recipient_contact VARCHAR(255),

    -- AI Assistant Information
    ai_generated BOOLEAN DEFAULT false,
    ai_call_transcript TEXT,
    ai_summary TEXT,

    -- Status and Follow-up
    status VARCHAR(50), -- 'sent', 'delivered', 'read', 'responded', 'failed'
    response_required BOOLEAN DEFAULT false,
    follow_up_date TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    external_reference_id VARCHAR(255) -- For integration with communication APIs
);

-- AI workflow automation
CREATE TABLE IF NOT EXISTS ai_workflow_triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Trigger Definition
    trigger_name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(100), -- 'phase_complete', 'photo_analyzed', 'issue_detected'
    trigger_conditions JSONB, -- Conditions that must be met

    -- Actions to Execute
    actions JSONB, -- [{type, parameters, delay}]

    -- Status
    active BOOLEAN DEFAULT true,
    last_executed TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- REPORTING AND ANALYTICS
-- ================================

-- Phase timeline events for reporting
CREATE TABLE IF NOT EXISTS phase_timeline_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,

    -- Event Information
    event_type VARCHAR(100), -- 'started', 'paused', 'resumed', 'completed', 'issue_reported'
    event_description TEXT,
    event_data JSONB, -- Structured event data

    -- Context
    triggered_by UUID REFERENCES auth.users(id),
    automated BOOLEAN DEFAULT false,

    -- Metadata
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project performance metrics
CREATE TABLE IF NOT EXISTS project_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Time Metrics
    calculated_date DATE,
    total_phases INTEGER,
    completed_phases INTEGER,
    phases_on_schedule INTEGER,
    phases_behind_schedule INTEGER,

    -- Financial Metrics
    total_budget DECIMAL(15,2),
    total_spent DECIMAL(15,2),
    budget_variance_percentage DECIMAL(5,2),

    -- Quality Metrics
    average_quality_score DECIMAL(5,2),
    total_issues_detected INTEGER,
    critical_issues INTEGER,

    -- Safety Metrics
    average_safety_score DECIMAL(5,2),
    safety_incidents INTEGER,

    -- Performance Scores
    overall_project_health INTEGER CHECK (overall_project_health >= 0 AND overall_project_health <= 100),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- Project phases indexes
CREATE INDEX IF NOT EXISTS idx_project_phases_project_status ON project_phases(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_phases_vendor ON project_phases(assigned_vendor_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_dates ON project_phases(planned_start_date, planned_end_date);

-- Photo indexes
CREATE INDEX IF NOT EXISTS idx_phase_photos_phase_upload ON phase_photos(phase_id, upload_timestamp);
CREATE INDEX IF NOT EXISTS idx_phase_photos_ai_status ON phase_photos(ai_analysis_status);
CREATE INDEX IF NOT EXISTS idx_phase_photos_type ON phase_photos(photo_type);

-- AI analysis indexes
CREATE INDEX IF NOT EXISTS idx_ai_analysis_photo_timestamp ON ai_photo_analysis(photo_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_scores ON ai_photo_analysis(progress_score, quality_score, safety_score);

-- Communication indexes
CREATE INDEX IF NOT EXISTS idx_vendor_comm_project_vendor ON vendor_communications(project_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_comm_timestamp ON vendor_communications(created_at);

-- Invoice indexes
CREATE INDEX IF NOT EXISTS idx_phase_invoices_project_status ON phase_invoices(project_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_phase_invoices_vendor ON phase_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_phase_invoices_dates ON phase_invoices(invoice_date, due_date);

-- ================================
-- ROW LEVEL SECURITY (RLS)
-- ================================

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_photo_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_workflow_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_metrics ENABLE ROW LEVEL SECURITY;

-- ================================
-- RLS POLICIES
-- ================================

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
BEGIN
  -- This would integrate with your auth system
  -- For now, return from custom claims or user metadata
  RETURN COALESCE(
    (auth.jwt() ->> 'user_role'),
    'viewer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Projects policies
CREATE POLICY "project_access_policy" ON projects
  FOR ALL USING (
    -- Project managers and owners can see their projects
    project_manager_id = auth.uid() OR
    created_by = auth.uid() OR
    -- Vendors can see projects they're assigned to
    (get_user_role() = 'vendor' AND id IN (
      SELECT project_id FROM project_phases WHERE assigned_vendor_id IN (
        SELECT id FROM vendors WHERE user_id = auth.uid()
      )
    )) OR
    -- AI system can see all
    get_user_role() = 'ai_system'
  );

-- Phase policies
CREATE POLICY "phase_access_policy" ON project_phases
  FOR ALL USING (
    -- Project access controls phase access
    project_id IN (SELECT id FROM projects) OR
    -- Vendors can only see their assigned phases
    (get_user_role() = 'vendor' AND assigned_vendor_id IN (
      SELECT id FROM vendors WHERE user_id = auth.uid()
    ))
  );

-- Photo policies
CREATE POLICY "photo_access_policy" ON phase_photos
  FOR ALL USING (
    -- Based on project access
    project_id IN (SELECT id FROM projects)
  );

-- Vendor-specific data filtering
CREATE POLICY "vendor_data_filter" ON ai_photo_analysis
  FOR SELECT USING (
    -- Vendors cannot see AI analysis details
    get_user_role() != 'vendor' OR
    -- AI system can see everything
    get_user_role() = 'ai_system'
  );

-- Invoice policies with role-based access
CREATE POLICY "invoice_access_policy" ON phase_invoices
  FOR ALL USING (
    -- Builders can see all project invoices
    (get_user_role() = 'builder' AND project_id IN (SELECT id FROM projects)) OR
    -- Vendors can only see their own invoices
    (get_user_role() = 'vendor' AND vendor_id IN (
      SELECT id FROM vendors WHERE user_id = auth.uid()
    )) OR
    -- AI system can see all
    get_user_role() = 'ai_system'
  );

-- ================================
-- FUNCTIONS AND TRIGGERS
-- ================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_phases_updated_at
  BEFORE UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Phase status change logging
CREATE OR REPLACE FUNCTION log_phase_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO phase_timeline_events (
      project_id, phase_id, event_type, event_description, event_data
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'status_changed',
      format('Phase status changed from %s to %s', OLD.status, NEW.status),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'progress_percentage', NEW.progress_percentage,
        'changed_by', auth.uid()
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER phase_status_change_logger
  AFTER UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION log_phase_status_change();

-- Auto-trigger AI workflow when phase completes
CREATE OR REPLACE FUNCTION trigger_phase_completion_workflow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'complete' AND OLD.status != 'complete' THEN
    -- This would trigger the "Should I call next vendor?" workflow
    INSERT INTO phase_timeline_events (
      project_id, phase_id, event_type, event_description, automated
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'phase_completed',
      'Phase marked as complete - triggering vendor communication workflow',
      true
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER phase_completion_workflow_trigger
  AFTER UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION trigger_phase_completion_workflow();

-- ================================
-- SAMPLE DATA FOR DEVELOPMENT
-- ================================

-- Sample project
INSERT INTO projects (
  id, name, description, address, client_name, project_type, total_budget,
  start_date, estimated_completion, status, project_number
) VALUES (
  'aa4eab7f-dc15-434f-9873-a6910e96001a',
  'Luxury Family Home - Maple Street',
  'Custom 3,500 sq ft luxury home with modern amenities',
  '456 Maple Street, Springfield, IL 62701',
  'Smith Enterprises LLC',
  'residential',
  485000.00,
  '2024-10-01',
  '2025-06-30',
  'active',
  'PROJ-2024-001'
) ON CONFLICT (id) DO NOTHING;

-- Sample vendors
INSERT INTO vendors (
  id, company_name, primary_contact_name, email, phone, specialties,
  overall_rating, years_in_business, hourly_rate
) VALUES
(
  'vendor-001',
  'EarthWorks Pro LLC',
  'Mike Johnson',
  'mike@earthworkspro.com',
  '(555) 123-4567',
  ARRAY['excavation', 'grading', 'site_preparation'],
  4.8,
  15,
  85.00
),
(
  'vendor-002',
  'Solid Foundation Inc',
  'Sarah Chen',
  'sarah@solidfoundation.com',
  '(555) 234-5678',
  ARRAY['foundation', 'concrete', 'basement'],
  4.9,
  12,
  95.00
),
(
  'vendor-003',
  'FrameTech Builders',
  'David Rodriguez',
  'david@frametechbuilders.com',
  '(555) 345-6789',
  ARRAY['framing', 'carpentry', 'structural'],
  4.7,
  8,
  78.00
) ON CONFLICT (id) DO NOTHING;

-- Sample phases
INSERT INTO project_phases (
  id, project_id, phase_name, phase_type, phase_order, planned_start_date,
  planned_end_date, status, progress_percentage, budget_allocated,
  assigned_vendor_id, description
) VALUES
(
  'phase-001',
  'aa4eab7f-dc15-434f-9873-a6910e96001a',
  'Site Preparation',
  'grading',
  1,
  '2024-10-01',
  '2024-10-14',
  'complete',
  100,
  43500.00,
  'vendor-001',
  'Clear site, grade lot, install temporary utilities'
),
(
  'phase-002',
  'aa4eab7f-dc15-434f-9873-a6910e96001a',
  'Foundation',
  'foundation',
  2,
  '2024-10-15',
  '2024-11-15',
  'complete',
  100,
  67200.00,
  'vendor-002',
  'Excavate and pour concrete foundation with basement'
),
(
  'phase-003',
  'aa4eab7f-dc15-434f-9873-a6910e96001a',
  'Framing',
  'framing',
  3,
  '2024-11-16',
  '2024-12-30',
  'in_progress',
  65,
  51000.00,
  'vendor-003',
  'Frame structure including walls, floors, and roof'
),
(
  'phase-004',
  'aa4eab7f-dc15-434f-9873-a6910e96001a',
  'MEP (Mechanical, Electrical, Plumbing)',
  'mep',
  4,
  '2025-01-02',
  '2025-02-28',
  'not_started',
  0,
  92000.00,
  NULL,
  'Install electrical, plumbing, and HVAC systems'
) ON CONFLICT (id) DO NOTHING;