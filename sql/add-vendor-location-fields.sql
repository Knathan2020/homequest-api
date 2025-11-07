-- Add location fields to vendor_contacts for vendor discovery
-- This enables distance-based vendor filtering using Google Maps

ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS service_radius INTEGER DEFAULT 50; -- miles

-- Add specialty/trade type field if not exists
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS specialty VARCHAR(100);
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS trade_types TEXT[];

-- Create index for location queries
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_location ON vendor_contacts(state, city);
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_specialty ON vendor_contacts(specialty);
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_coordinates ON vendor_contacts(latitude, longitude);

-- Add comment for documentation
COMMENT ON COLUMN vendor_contacts.service_radius IS 'Service area radius in miles from vendor location';
COMMENT ON COLUMN vendor_contacts.latitude IS 'Latitude coordinate for distance calculations';
COMMENT ON COLUMN vendor_contacts.longitude IS 'Longitude coordinate for distance calculations';
