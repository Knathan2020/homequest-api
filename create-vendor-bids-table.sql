-- Create vendor_bids table for storing accepted bids
CREATE TABLE IF NOT EXISTS vendor_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  vendor_id UUID,
  vendor_name TEXT,
  vendor_company TEXT,
  vendor_email TEXT,
  vendor_phone TEXT,
  bid_amount DECIMAL(12,2),
  line_item_name TEXT,
  line_item_category TEXT,
  timeline_days INTEGER,
  materials_cost DECIMAL(12,2),
  labor_cost DECIMAL(12,2),
  vendor_notes TEXT,
  confidence_level INTEGER,
  builder_notes TEXT,
  status TEXT DEFAULT 'accepted',
  submitted_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vendor_bids_project_id ON vendor_bids(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_status ON vendor_bids(status);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_accepted_at ON vendor_bids(accepted_at);