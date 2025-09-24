-- Create email_accounts table
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT DEFAULT 'demo-user',  -- Using TEXT for demo, change to UUID REFERENCES auth.users(id) for production
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

-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  project_id UUID,
  vendor_id UUID,
  
  -- Email metadata
  message_id VARCHAR(255) UNIQUE,
  thread_id VARCHAR(255),
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_emails TEXT[], 
  cc_emails TEXT[],
  bcc_emails TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  
  -- Categorization
  category VARCHAR(50),
  priority VARCHAR(20),
  status VARCHAR(50),
  
  -- AI processing
  ai_processed BOOLEAN DEFAULT false,
  ai_summary TEXT,
  ai_extracted_data JSONB,
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_emails_account_id ON emails(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_date ON emails(received_date DESC);

-- Enable Row Level Security
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

-- Create policies for demo (allows all access - adjust for production)
CREATE POLICY "Allow all access to email_accounts" ON email_accounts
  FOR ALL USING (true);

CREATE POLICY "Allow all access to emails" ON emails
  FOR ALL USING (true);