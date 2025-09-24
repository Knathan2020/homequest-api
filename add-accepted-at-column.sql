-- Add accepted_at column to vendor_bids table
ALTER TABLE vendor_bids ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add index for accepted_at column
CREATE INDEX IF NOT EXISTS idx_vendor_bids_accepted_at ON vendor_bids(accepted_at);