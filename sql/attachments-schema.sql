-- Attachment Folders Table
CREATE TABLE IF NOT EXISTS attachment_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES attachment_folders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    color VARCHAR(50) DEFAULT 'bg-gray-500',
    icon VARCHAR(50) DEFAULT 'Folder',
    file_count INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_shared BOOLEAN DEFAULT false,
    shared_with TEXT[] DEFAULT '{}',
    permissions TEXT[] DEFAULT '{"read", "write"}',
    metadata JSONB DEFAULT '{}'
);

-- Attachments Table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    mime_type VARCHAR(100),
    size BIGINT NOT NULL,
    url TEXT NOT NULL,
    storage_path TEXT,
    thumbnail_url TEXT,
    folder_id UUID REFERENCES attachment_folders(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID,
    email_id UUID,
    vendor_id UUID,
    tags TEXT[] DEFAULT '{}',
    description TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    last_modified TIMESTAMPTZ DEFAULT NOW(),
    
    -- AI Processing
    ai_processed BOOLEAN DEFAULT false,
    ai_processed_at TIMESTAMPTZ,
    ai_extracted_text TEXT,
    ai_extracted_data JSONB,
    ai_document_type VARCHAR(50),
    ai_confidence_score DECIMAL(3,2),
    ai_suggested_tags TEXT[] DEFAULT '{}',
    
    -- Sharing & Access
    is_public BOOLEAN DEFAULT false,
    shared_with TEXT[] DEFAULT '{}',
    share_link TEXT,
    share_link_expiry TIMESTAMPTZ,
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ,
    
    -- Document Specific
    document_category VARCHAR(50), -- contract, permit, invoice, quote, plan, etc.
    document_status VARCHAR(50), -- active, expired, pending, approved
    expiry_date DATE,
    is_starred BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    
    -- Version Control
    version INTEGER DEFAULT 1,
    parent_file_id UUID REFERENCES attachments(id),
    is_latest_version BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    search_vector tsvector
);

-- Attachment Access Logs
CREATE TABLE IF NOT EXISTS attachment_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(50) NOT NULL, -- view, download, share, edit, delete
    ip_address INET,
    user_agent TEXT,
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Attachments Junction Table
CREATE TABLE IF NOT EXISTS email_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL,
    attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
    inline BOOLEAN DEFAULT false,
    content_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email_id, attachment_id)
);

-- Attachment Templates (for frequently used documents)
CREATE TABLE IF NOT EXISTS attachment_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    user_id UUID REFERENCES auth.users(id),
    is_global BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Processing Queue
CREATE TABLE IF NOT EXISTS ai_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
    processing_type VARCHAR(50), -- ocr, extract, categorize, summarize
    priority INTEGER DEFAULT 5,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_folder_id ON attachments(folder_id);
CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_attachments_vendor_id ON attachments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_attachments_document_category ON attachments(document_category);
CREATE INDEX IF NOT EXISTS idx_attachments_ai_processed ON attachments(ai_processed);
CREATE INDEX IF NOT EXISTS idx_attachments_search_vector ON attachments USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_attachments_tags ON attachments USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_attachment_folders_user_id ON attachment_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_attachment_folders_parent_id ON attachment_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_processing_queue(status, priority);

-- Full text search trigger
CREATE OR REPLACE FUNCTION attachments_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.ai_extracted_text, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attachments_search_update
    BEFORE INSERT OR UPDATE ON attachments
    FOR EACH ROW
    EXECUTE FUNCTION attachments_search_trigger();

-- Update folder stats trigger
CREATE OR REPLACE FUNCTION update_folder_stats() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE attachment_folders 
        SET file_count = file_count + 1,
            total_size = total_size + NEW.size,
            updated_at = NOW()
        WHERE id = NEW.folder_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE attachment_folders 
        SET file_count = GREATEST(0, file_count - 1),
            total_size = GREATEST(0, total_size - OLD.size),
            updated_at = NOW()
        WHERE id = OLD.folder_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.folder_id IS DISTINCT FROM NEW.folder_id THEN
            UPDATE attachment_folders 
            SET file_count = GREATEST(0, file_count - 1),
                total_size = GREATEST(0, total_size - OLD.size),
                updated_at = NOW()
            WHERE id = OLD.folder_id;
            
            UPDATE attachment_folders 
            SET file_count = file_count + 1,
                total_size = total_size + NEW.size,
                updated_at = NOW()
            WHERE id = NEW.folder_id;
        ELSIF OLD.size IS DISTINCT FROM NEW.size THEN
            UPDATE attachment_folders 
            SET total_size = GREATEST(0, total_size - OLD.size + NEW.size),
                updated_at = NOW()
            WHERE id = NEW.folder_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_folder_stats_trigger
    AFTER INSERT OR UPDATE OR DELETE ON attachments
    FOR EACH ROW
    EXECUTE FUNCTION update_folder_stats();

-- Row Level Security
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment_templates ENABLE ROW LEVEL SECURITY;

-- Policies for attachments
CREATE POLICY "Users can view their own attachments" ON attachments
    FOR SELECT USING (
        user_id = auth.uid() OR 
        is_public = true OR
        auth.uid()::text = ANY(shared_with)
    );

CREATE POLICY "Users can create attachments" ON attachments
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own attachments" ON attachments
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own attachments" ON attachments
    FOR DELETE USING (user_id = auth.uid());

-- Policies for folders
CREATE POLICY "Users can view their own folders" ON attachment_folders
    FOR SELECT USING (
        user_id = auth.uid() OR 
        is_shared = true OR
        auth.uid()::text = ANY(shared_with)
    );

CREATE POLICY "Users can create folders" ON attachment_folders
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own folders" ON attachment_folders
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own folders" ON attachment_folders
    FOR DELETE USING (user_id = auth.uid());

-- Create default folders for new users
CREATE OR REPLACE FUNCTION create_default_folders() RETURNS trigger AS $$
BEGIN
    INSERT INTO attachment_folders (name, user_id, color, icon) VALUES
        ('Documents', NEW.id, 'bg-blue-500', 'FileText'),
        ('Images', NEW.id, 'bg-green-500', 'Image'),
        ('Contracts', NEW.id, 'bg-purple-500', 'FileText'),
        ('Permits', NEW.id, 'bg-orange-500', 'CheckCircle'),
        ('Invoices', NEW.id, 'bg-red-500', 'DollarSign'),
        ('Plans', NEW.id, 'bg-indigo-500', 'FileImage');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger should be created on the auth.users table
-- CREATE TRIGGER create_user_folders
--     AFTER INSERT ON auth.users
--     FOR EACH ROW
--     EXECUTE FUNCTION create_default_folders();