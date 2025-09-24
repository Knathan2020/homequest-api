-- Vendor Bidding System Database Setup
-- Run this to set up the complete vendor bidding functionality

-- First, create the line item categories and items if they don't exist
CREATE TABLE IF NOT EXISTS line_item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES line_item_categories(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  typical_unit VARCHAR(50),
  estimated_duration_days INTEGER,
  sort_order INTEGER DEFAULT 0,
  trade_type VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Project-specific line items (from EstimatesTab integration)
CREATE TABLE IF NOT EXISTS project_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID, -- References projects(id) when projects table exists
  line_item_id UUID REFERENCES line_items(id),
  rfq_id UUID,
  
  -- Project-specific customization
  custom_description TEXT,
  quantity DECIMAL(10,2),
  unit VARCHAR(50),
  estimated_cost DECIMAL(12,2),
  priority VARCHAR(20) CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Requirements
  requires_permit BOOLEAN DEFAULT false,
  requires_inspection BOOLEAN DEFAULT false,
  special_requirements TEXT,
  
  -- Scheduling
  earliest_start_date DATE,
  preferred_completion_date DATE,
  dependencies TEXT[],
  
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced RFQ line item bids (detailed vendor responses)
CREATE TABLE IF NOT EXISTS rfq_line_item_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_response_id UUID,
  project_line_item_id UUID REFERENCES project_line_items(id),
  vendor_id UUID,
  
  -- Vendor bid details
  can_perform BOOLEAN DEFAULT false,
  bid_amount DECIMAL(12,2),
  timeline_days INTEGER,
  start_availability_date DATE,
  
  -- Cost breakdown
  materials_cost DECIMAL(12,2),
  labor_cost DECIMAL(12,2),
  equipment_cost DECIMAL(12,2),
  overhead_percentage DECIMAL(5,2),
  profit_margin_percentage DECIMAL(5,2),
  
  -- Vendor specifications
  vendor_notes TEXT,
  alternative_approach TEXT,
  warranty_terms TEXT,
  payment_terms TEXT,
  
  -- Confidence and risk
  confidence_level INTEGER CHECK (confidence_level BETWEEN 1 AND 5) DEFAULT 3,
  risk_factors TEXT,
  contingency_percentage DECIMAL(5,2),
  
  -- Status tracking
  status VARCHAR(50) CHECK (status IN ('pending', 'submitted', 'selected', 'rejected', 'withdrawn')) DEFAULT 'pending',
  submitted_at TIMESTAMP,
  selected_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vendor specialties for trade matching
CREATE TABLE IF NOT EXISTS vendor_specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID,
  trade_type VARCHAR(100) NOT NULL,
  experience_years INTEGER,
  license_number VARCHAR(100),
  license_expiry DATE,
  bonding_amount DECIMAL(12,2),
  insurance_amount DECIMAL(12,2),
  typical_project_size VARCHAR(50) CHECK (typical_project_size IN ('small', 'medium', 'large', 'all')),
  preferred_project_types TEXT[],
  service_area_radius INTEGER,
  rating DECIMAL(3,2) CHECK (rating BETWEEN 0 AND 5),
  completed_projects INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RFQ attachments for file uploads
CREATE TABLE IF NOT EXISTS rfq_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_response_id UUID,
  vendor_id UUID,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  document_type VARCHAR(50) CHECK (document_type IN ('quote', 'invoice', 'certification', 'insurance', 'other')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Project attachments (floor plans, specs, etc.)
CREATE TABLE IF NOT EXISTS project_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID, -- References projects(id) when projects table exists
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  attachment_type VARCHAR(50) CHECK (attachment_type IN ('floor_plan', 'specification', 'drawing', 'document', 'other')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add unique constraints to tables (after tables are created)
-- Create unique constraint on name for line_item_categories
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_category_name' 
        AND table_name = 'line_item_categories'
    ) THEN
        ALTER TABLE line_item_categories ADD CONSTRAINT unique_category_name UNIQUE (name);
    END IF;
END $$;

-- Create unique constraint on name for line_items
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_line_item_name' 
        AND table_name = 'line_items'
    ) THEN
        ALTER TABLE line_items ADD CONSTRAINT unique_line_item_name UNIQUE (name);
    END IF;
END $$;

-- Insert standard construction line item categories
INSERT INTO line_item_categories (name, description, sort_order) VALUES
('Preparation & Preliminaries', 'Building permits, lot clearing and demo, and utility services', 1),
('Excavation & Foundation', 'Earth hauling, excavation, concrete slab with steel reinforcements', 2),
('Rough Structure', 'Posts & Beams, framing, plumbing, electrical, and HVAC', 3),
('Full Enclosure', 'Roof, chimney, fireplace, doors, exterior siding and painting', 4),
('Finishing Trades', 'Interior finish out, drywall, painting, cabinets, countertops, hardware, carpet, finishing plumbing and electrical fixtures, and appliances', 5),
('Completion & Inspection', 'Fence, hardscape, landscape, sidewalks, and final inspection', 6),
('Cabinet Selections', 'Various cabinet style options and installations', 7),
('Countertop Selections', 'Granite, quartz, and marble countertop options', 8),
('Appliance Selections', 'Kitchen appliance packages from various manufacturers', 9),
('Kitchen Fixture Selections', 'Kitchen faucets and hardware selections', 10)
ON CONFLICT (name) DO NOTHING;

-- Insert comprehensive line items for each category
WITH category_ids AS (
  SELECT id, name FROM line_item_categories
)
INSERT INTO line_items (category_id, name, description, typical_unit, trade_type, sort_order) VALUES
-- Preparation & Preliminaries
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Building permits', 'Required permits for construction', 'each', 'permit', 1),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'HBA Assessments', 'Home Builders Association assessments', 'each', 'permit', 2),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Warranty Fees', 'Construction warranty fees', 'each', 'permit', 3),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Blueprints', 'Architectural blueprints and plans', 'set', 'planning', 4),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Surveys', 'Land surveying services', 'each', 'surveying', 5),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Demolition', 'Demolition of existing structures', 'sq ft', 'demolition', 6),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Fill Dirt and Material', 'Fill dirt and materials for site preparation', 'cubic yard', 'excavation', 7),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Lot clearing', 'Clearing of vegetation and debris', 'acre', 'site prep', 8),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Rough Grading', 'Initial site grading', 'sq ft', 'grading', 9),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Electric Service', 'Main electrical service connection', 'each', 'electrical', 10),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Gas Service', 'Natural gas service connection', 'each', 'plumbing', 11),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Sewer Service', 'Sewer line connection', 'each', 'plumbing', 12),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Water Service', 'Water line connection', 'each', 'plumbing', 13),
((SELECT id FROM category_ids WHERE name = 'Preparation & Preliminaries'), 'Temporary Electric', 'Temporary electrical service during construction', 'each', 'electrical', 14),

-- Excavation & Foundation  
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Earth Hauling', 'Hauling of excavated earth', 'cubic yard', 'excavation', 1),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Excavation', 'Foundation excavation', 'cubic yard', 'excavation', 2),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Labor Footings and Foundation', 'Foundation and footing labor', 'linear ft', 'concrete', 3),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Rebar and Reinforcing Steel', 'Steel reinforcement for concrete', 'lb', 'concrete', 4),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Sand', 'Sand for foundation base', 'cubic yard', 'concrete', 5),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Concrete Stairs', 'Concrete stair construction', 'each', 'concrete', 6),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Garage or Carport Slab', 'Concrete slab for garage/carport', 'sq ft', 'concrete', 7),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Structural Slabs', 'Main structural concrete slabs', 'sq ft', 'concrete', 8),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Waterproofing', 'Foundation waterproofing', 'sq ft', 'waterproofing', 9),
((SELECT id FROM category_ids WHERE name = 'Excavation & Foundation'), 'Termite protection', 'Termite prevention treatment', 'sq ft', 'pest control', 10),

-- Rough Structure
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'Framing Labor', 'Structural framing labor', 'sq ft', 'framing', 1),
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'Lumber package', 'Lumber materials for framing', 'package', 'framing', 2),
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'Gutters and Downspouts', 'Gutter system installation', 'linear ft', 'roofing', 3),
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'Metal Edge and Flashing', 'Metal edge and flashing materials', 'linear ft', 'roofing', 4),
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'Soffit and Gable Flashing', 'Soffit and gable flashing installation', 'linear ft', 'roofing', 5),
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'Rough Plumbing', 'Rough plumbing installation', 'fixture', 'plumbing', 6),
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'Rough Electrical', 'Rough electrical installation', 'outlet', 'electrical', 7),
((SELECT id FROM category_ids WHERE name = 'Rough Structure'), 'HVAC', 'Heating, ventilation, and air conditioning', 'system', 'hvac', 8)
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_line_items_category ON line_items(category_id);
CREATE INDEX IF NOT EXISTS idx_line_items_trade_type ON line_items(trade_type);
CREATE INDEX IF NOT EXISTS idx_project_line_items_project ON project_line_items(project_id);
CREATE INDEX IF NOT EXISTS idx_project_line_items_rfq ON project_line_items(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_line_item_bids_response ON rfq_line_item_bids(rfq_response_id);
CREATE INDEX IF NOT EXISTS idx_rfq_line_item_bids_vendor ON rfq_line_item_bids(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_specialties_vendor ON vendor_specialties(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_specialties_trade ON vendor_specialties(trade_type);

-- Enable Row Level Security if not already enabled
ALTER TABLE line_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_line_item_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_attachments ENABLE ROW LEVEL SECURITY;

-- Create policies for restricted access to line item templates (vendors and team only)
DROP POLICY IF EXISTS "Vendors and team can read line item categories" ON line_item_categories;
CREATE POLICY "Vendors and team can read line item categories" ON line_item_categories 
FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    -- User is a vendor
    auth.jwt() ->> 'user_role' = 'vendor' OR
    -- User is a team member 
    auth.jwt() ->> 'user_role' = 'team_member' OR
    -- Fallback: allow authenticated users for now (can be tightened later)
    auth.role() = 'authenticated'
  )
);

DROP POLICY IF EXISTS "Vendors and team can read line items" ON line_items;
CREATE POLICY "Vendors and team can read line items" ON line_items 
FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    -- User is a vendor
    auth.jwt() ->> 'user_role' = 'vendor' OR
    -- User is a team member
    auth.jwt() ->> 'user_role' = 'team_member' OR
    -- Fallback: allow authenticated users for now (can be tightened later)
    auth.role() = 'authenticated'
  )
);

-- Create policies for project data access (team members only)
DROP POLICY IF EXISTS "Team members can manage project line items" ON project_line_items;
CREATE POLICY "Team members can manage project line items" ON project_line_items 
FOR ALL USING (
  auth.role() = 'authenticated' AND (
    -- User is a team member
    auth.jwt() ->> 'user_role' = 'team_member' OR
    -- Fallback: allow authenticated users for now (can be tightened later)
    auth.role() = 'authenticated'
  )
);

-- Create policies for vendor bid access (vendors can manage their own, team can view all)
DROP POLICY IF EXISTS "Vendors can manage their bids, team can view all" ON rfq_line_item_bids;
CREATE POLICY "Vendors can manage their bids, team can view all" ON rfq_line_item_bids 
FOR ALL USING (
  auth.role() = 'authenticated' AND (
    -- Vendors can manage their own bids
    (auth.jwt() ->> 'user_role' = 'vendor' AND vendor_id::text = auth.jwt() ->> 'vendor_id') OR
    -- Team members can view/manage all bids
    auth.jwt() ->> 'user_role' = 'team_member' OR
    -- Fallback: allow authenticated users for now (can be tightened later)
    auth.role() = 'authenticated'
  )
);

-- Create policies for vendor specialties (vendors manage their own)
DROP POLICY IF EXISTS "Vendors can manage their specialties" ON vendor_specialties;
CREATE POLICY "Vendors can manage their specialties" ON vendor_specialties 
FOR ALL USING (
  auth.role() = 'authenticated' AND (
    -- Vendors can manage their own specialties
    (auth.jwt() ->> 'user_role' = 'vendor' AND vendor_id::text = auth.jwt() ->> 'vendor_id') OR
    -- Team members can view all specialties
    auth.jwt() ->> 'user_role' = 'team_member' OR
    -- Fallback: allow authenticated users for now (can be tightened later)
    auth.role() = 'authenticated'
  )
);

-- Create policies for attachments (vendors their own, team all)
DROP POLICY IF EXISTS "Vendors and team can manage attachments" ON rfq_attachments;
CREATE POLICY "Vendors and team can manage attachments" ON rfq_attachments 
FOR ALL USING (
  auth.role() = 'authenticated' AND (
    -- Vendors can manage their own attachments
    (auth.jwt() ->> 'user_role' = 'vendor' AND vendor_id::text = auth.jwt() ->> 'vendor_id') OR
    -- Team members can manage all attachments
    auth.jwt() ->> 'user_role' = 'team_member' OR
    -- Fallback: allow authenticated users for now (can be tightened later)
    auth.role() = 'authenticated'
  )
);

DROP POLICY IF EXISTS "Team can manage project attachments" ON project_attachments;
CREATE POLICY "Team can manage project attachments" ON project_attachments 
FOR ALL USING (
  auth.role() = 'authenticated' AND (
    -- Team members can manage project attachments
    auth.jwt() ->> 'user_role' = 'team_member' OR
    -- Fallback: allow authenticated users for now (can be tightened later)
    auth.role() = 'authenticated'
  )
);

-- Grant necessary permissions (restricted to authenticated users only)
GRANT SELECT ON line_item_categories TO authenticated;
GRANT SELECT ON line_items TO authenticated;
GRANT ALL ON project_line_items TO authenticated;
GRANT ALL ON rfq_line_item_bids TO authenticated;
GRANT ALL ON vendor_specialties TO authenticated;
GRANT ALL ON rfq_attachments TO authenticated;
GRANT ALL ON project_attachments TO authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';