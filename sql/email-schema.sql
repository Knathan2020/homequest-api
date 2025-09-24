-- Email System Database Schema for HomeQuest Tech
-- Complete schema for email management, documents, and vendor communications

-- Email accounts table (Gmail/Outlook connections)
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('gmail', 'outlook', 'yahoo')),
  email_address VARCHAR(255) NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  is_primary BOOLEAN DEFAULT false,
  connected_at TIMESTAMP DEFAULT NOW(),
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Emails table (all emails from all accounts)
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  vendor_id UUID REFERENCES vendors(id),
  
  -- Email metadata
  message_id VARCHAR(255) UNIQUE,
  thread_id VARCHAR(255),
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_emails TEXT[], -- Array of recipient emails
  cc_emails TEXT[],
  bcc_emails TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  
  -- Categorization
  category VARCHAR(50) CHECK (category IN ('vendor', 'client', 'permit', 'invoice', 'quote', 'rfi', 'general')),
  priority VARCHAR(20) CHECK (priority IN ('high', 'medium', 'low')),
  status VARCHAR(50) CHECK (status IN ('unread', 'read', 'replied', 'forwarded', 'archived')),
  
  -- AI processing
  ai_processed BOOLEAN DEFAULT false,
  ai_summary TEXT,
  ai_extracted_data JSONB, -- Extracted costs, dates, items, etc.
  ai_suggested_response TEXT,
  ai_category_confidence DECIMAL(3,2),
  
  -- Flags
  requires_action BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_important BOOLEAN DEFAULT false,
  
  -- Timestamps
  sent_date TIMESTAMP,
  received_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email attachments table
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  
  -- File info
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  mime_type VARCHAR(100),
  
  -- Storage
  storage_url TEXT,
  thumbnail_url TEXT, -- For document previews
  
  -- Document processing
  document_type VARCHAR(50) CHECK (document_type IN ('invoice', 'quote', 'plan', 'permit', 'contract', 'w9', 'insurance', 'other')),
  is_processed BOOLEAN DEFAULT false,
  extracted_text TEXT,
  extracted_data JSONB, -- For structured data from invoices/quotes
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vendor communications tracking
CREATE TABLE IF NOT EXISTS vendor_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id),
  project_id UUID REFERENCES projects(id),
  email_id UUID REFERENCES emails(id),
  
  -- Communication type
  comm_type VARCHAR(50) CHECK (comm_type IN ('rfq', 'quote', 'award', 'rejection', 'invoice', 'payment', 'schedule', 'general')),
  
  -- Tracking
  sent_date TIMESTAMP,
  opened_date TIMESTAMP,
  responded_date TIMESTAMP,
  response_time_hours DECIMAL(10,2),
  
  -- Document tracking
  documents_sent TEXT[],
  documents_opened TEXT[],
  documents_downloaded TEXT[],
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  -- Template info
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  subject VARCHAR(500),
  body_html TEXT,
  body_text TEXT,
  
  -- Merge variables
  merge_tags JSONB, -- {vendor_name, project_name, etc.}
  default_attachments TEXT[],
  
  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vendor packages (onboarding documents)
CREATE TABLE IF NOT EXISTS vendor_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id),
  project_id UUID REFERENCES projects(id),
  
  -- Package status
  package_sent TIMESTAMP,
  package_opened TIMESTAMP,
  
  -- Required documents
  w9_required BOOLEAN DEFAULT true,
  w9_received BOOLEAN DEFAULT false,
  w9_document_id UUID REFERENCES email_attachments(id),
  
  insurance_required BOOLEAN DEFAULT true,
  insurance_received BOOLEAN DEFAULT false,
  insurance_document_id UUID REFERENCES email_attachments(id),
  insurance_expiry DATE,
  
  banking_required BOOLEAN DEFAULT true,
  banking_received BOOLEAN DEFAULT false,
  banking_document_id UUID REFERENCES email_attachments(id),
  
  contract_required BOOLEAN DEFAULT true,
  contract_received BOOLEAN DEFAULT false,
  contract_document_id UUID REFERENCES email_attachments(id),
  
  -- Completion tracking
  is_complete BOOLEAN DEFAULT false,
  completed_date TIMESTAMP,
  
  -- Payment info (stored securely)
  payment_method VARCHAR(50) CHECK (payment_method IN ('ach', 'check', 'wire')),
  payment_details JSONB, -- Encrypted
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RFQ (Request for Quote) tracking
CREATE TABLE IF NOT EXISTS rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  
  -- RFQ details
  title VARCHAR(255),
  description TEXT,
  scope_of_work TEXT,
  deadline TIMESTAMP,
  
  -- Documents
  attachments TEXT[],
  
  -- Vendor tracking
  vendors_invited INTEGER DEFAULT 0,
  vendors_viewed INTEGER DEFAULT 0,
  vendors_responded INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(50) CHECK (status IN ('draft', 'sent', 'closed', 'awarded')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RFQ vendor responses
CREATE TABLE IF NOT EXISTS rfq_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES rfqs(id),
  vendor_id UUID REFERENCES vendors(id),
  email_id UUID REFERENCES emails(id),
  
  -- Response details
  quote_amount DECIMAL(12,2),
  timeline_days INTEGER,
  notes TEXT,
  
  -- AI extracted data
  line_items JSONB,
  materials_cost DECIMAL(12,2),
  labor_cost DECIMAL(12,2),
  
  -- Status
  status VARCHAR(50) CHECK (status IN ('pending', 'submitted', 'accepted', 'rejected')),
  
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email automation rules
CREATE TABLE IF NOT EXISTS email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  -- Rule definition
  name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  
  -- Conditions (JSON)
  conditions JSONB, -- {from: "vendor@email.com", subject_contains: "invoice"}
  
  -- Actions (JSON)
  actions JSONB, -- {categorize: "invoice", forward_to: "accounting@company.com"}
  
  -- Stats
  times_triggered INTEGER DEFAULT 0,
  last_triggered TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email analytics
CREATE TABLE IF NOT EXISTS email_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  
  -- Volume metrics
  total_received INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  ai_handled INTEGER DEFAULT 0,
  manual_handled INTEGER DEFAULT 0,
  
  -- Response metrics
  avg_response_time_hours DECIMAL(10,2),
  vendor_response_rate DECIMAL(5,2),
  
  -- Category breakdown
  category_breakdown JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(date)
);

-- Indexes for performance
CREATE INDEX idx_emails_account_id ON emails(account_id);
CREATE INDEX idx_emails_project_id ON emails(project_id);
CREATE INDEX idx_emails_vendor_id ON emails(vendor_id);
CREATE INDEX idx_emails_category ON emails(category);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_requires_action ON emails(requires_action);
CREATE INDEX idx_emails_received_date ON emails(received_date DESC);

CREATE INDEX idx_attachments_email_id ON email_attachments(email_id);
CREATE INDEX idx_attachments_document_type ON email_attachments(document_type);

CREATE INDEX idx_vendor_comm_vendor_id ON vendor_communications(vendor_id);
CREATE INDEX idx_vendor_comm_project_id ON vendor_communications(project_id);

CREATE INDEX idx_rfq_project_id ON rfqs(project_id);
CREATE INDEX idx_rfq_responses_vendor_id ON rfq_responses(vendor_id);

-- Row Level Security
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_analytics ENABLE ROW LEVEL SECURITY;