-- Complete schema for vendor bids and accepted bids functionality

-- Create vendor_bids table with all required columns
CREATE TABLE IF NOT EXISTS vendor_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  vendor_id UUID NOT NULL,
  vendor_company VARCHAR(255) NOT NULL,
  vendor_email VARCHAR(255),
  vendor_phone VARCHAR(50),
  line_item_name VARCHAR(255) NOT NULL,
  line_item_id VARCHAR(255),
  bid_amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  builder_notes TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vendor_bids_project_id ON vendor_bids(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_vendor_id ON vendor_bids(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_status ON vendor_bids(status);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_accepted_at ON vendor_bids(accepted_at);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_created_at ON vendor_bids(created_at);

-- Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vendor_bids_project_vendor ON vendor_bids(project_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bids_project_status ON vendor_bids(project_id, status);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vendor_bids_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vendor_bids_updated_at
  BEFORE UPDATE ON vendor_bids
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_bids_updated_at();

-- Add trigger to set accepted_at when status changes to accepted
CREATE OR REPLACE FUNCTION set_vendor_bid_accepted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    NEW.accepted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vendor_bid_accepted_at
  BEFORE UPDATE ON vendor_bids
  FOR EACH ROW
  EXECUTE FUNCTION set_vendor_bid_accepted_at();

-- Example data structure for reference
-- INSERT INTO vendor_bids (project_id, vendor_id, vendor_company, line_item_name, bid_amount, status) VALUES
-- ('123e4567-e89b-12d3-a456-426614174000', '987fcdeb-51a2-43d1-b234-567890123456', 'ABC Construction', 'Electrical Rough-In', 4200.00, 'accepted');