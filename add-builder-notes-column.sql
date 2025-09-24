-- Add builder_notes column to vendor_bids table
ALTER TABLE vendor_bids ADD COLUMN IF NOT EXISTS builder_notes TEXT;