-- Add expiry_date field to vendor_documents table for COI validation
ALTER TABLE vendor_documents
ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Add index for expiry date queries
CREATE INDEX IF NOT EXISTS idx_vendor_documents_expiry ON vendor_documents(expiry_date);