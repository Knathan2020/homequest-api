-- Create vendor_documents table for COI and document uploads
CREATE TABLE IF NOT EXISTS vendor_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL,
    project_id UUID,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    document_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    notes TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_project_id ON vendor_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_type ON vendor_documents(document_type);

-- Enable RLS
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for development (drop first if exists)
DROP POLICY IF EXISTS "Allow all operations on vendor_documents" ON vendor_documents;
CREATE POLICY "Allow all operations on vendor_documents" ON vendor_documents FOR ALL USING (true);