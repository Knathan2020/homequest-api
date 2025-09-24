-- Create vendor_documents table for COI document uploads
CREATE TABLE IF NOT EXISTS vendor_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendor_contacts(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    uploaded_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendor_documents_team_id ON vendor_documents(team_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_type ON vendor_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_status ON vendor_documents(status);

-- Enable RLS
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for development
CREATE POLICY "Allow all operations on vendor_documents" ON vendor_documents FOR ALL USING (true);