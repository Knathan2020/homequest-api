-- Simplified Email RAG System Tables
-- For document storage, vector embeddings, and intelligent email retrieval

-- 1. Document storage for RAG
CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL, -- 'email', 'attachment', 'manual'
  source_id UUID, -- Reference to email or attachment
  
  -- Document content
  title VARCHAR(500),
  content TEXT NOT NULL,
  content_type VARCHAR(50), -- 'invoice', 'quote', 'contract', 'correspondence'
  
  -- Metadata for filtering
  project_id UUID,
  vendor_name VARCHAR(255),
  date_created TIMESTAMP DEFAULT NOW(),
  
  -- Vector embedding for semantic search
  embedding vector(1536), -- OpenAI ada-002 dimensions
  
  -- Search optimization
  search_text TEXT, -- Preprocessed searchable text
  keywords TEXT[], -- Extracted keywords
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. RAG conversation context
CREATE TABLE IF NOT EXISTS rag_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT DEFAULT 'demo-user',
  
  -- Conversation data
  query TEXT NOT NULL,
  response TEXT,
  relevant_doc_ids UUID[],
  
  -- Performance metrics
  confidence_score DECIMAL(3,2),
  response_time_ms INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Knowledge base for common Q&A
CREATE TABLE IF NOT EXISTS rag_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Q&A pairs
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  
  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  
  -- Vector for similarity matching
  question_embedding vector(1536),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Email templates learned from RAG
CREATE TABLE IF NOT EXISTS rag_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template info
  scenario VARCHAR(255), -- 'quote_request', 'invoice_follow_up', etc.
  subject_template TEXT,
  body_template TEXT,
  
  -- Learned from these examples
  source_email_ids UUID[],
  
  -- Performance
  success_rate DECIMAL(3,2),
  times_generated INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_rag_docs_embedding ON rag_documents 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_rag_knowledge_embedding ON rag_knowledge_base 
  USING ivfflat (question_embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_rag_docs_content_type ON rag_documents(content_type);
CREATE INDEX IF NOT EXISTS idx_rag_docs_project ON rag_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_rag_docs_vendor ON rag_documents(vendor_name);

-- Enable full-text search
CREATE INDEX IF NOT EXISTS idx_rag_docs_search ON rag_documents 
  USING gin(to_tsvector('english', search_text));

-- Function to search documents by similarity
CREATE OR REPLACE FUNCTION search_similar_documents(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  filter_type varchar DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  title VARCHAR,
  content TEXT,
  content_type VARCHAR,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.content,
    d.content_type,
    1 - (d.embedding <=> query_embedding) as similarity
  FROM rag_documents d
  WHERE 
    (filter_type IS NULL OR d.content_type = filter_type)
    AND d.embedding IS NOT NULL
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get context for a query
CREATE OR REPLACE FUNCTION get_rag_context(
  user_query TEXT,
  query_embedding vector(1536),
  max_docs int DEFAULT 3
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  WITH relevant_docs AS (
    SELECT * FROM search_similar_documents(query_embedding, max_docs)
  ),
  knowledge_matches AS (
    SELECT 
      question,
      answer,
      1 - (question_embedding <=> query_embedding) as similarity
    FROM rag_knowledge_base
    WHERE question_embedding IS NOT NULL
    ORDER BY question_embedding <=> query_embedding
    LIMIT 1
  )
  SELECT json_build_object(
    'query', user_query,
    'relevant_documents', json_agg(DISTINCT rd.*),
    'knowledge_answer', (SELECT json_build_object('question', question, 'answer', answer, 'confidence', similarity) FROM knowledge_matches),
    'timestamp', NOW()
  ) INTO result
  FROM relevant_docs rd;
  
  RETURN result;
END;
$$;

-- Enable Row Level Security
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_email_templates ENABLE ROW LEVEL SECURITY;

-- Policies for demo access
CREATE POLICY "Allow all access to rag_documents" ON rag_documents FOR ALL USING (true);
CREATE POLICY "Allow all access to rag_conversations" ON rag_conversations FOR ALL USING (true);
CREATE POLICY "Allow all access to rag_knowledge_base" ON rag_knowledge_base FOR ALL USING (true);
CREATE POLICY "Allow all access to rag_email_templates" ON rag_email_templates FOR ALL USING (true);

-- Sample data for testing
INSERT INTO rag_knowledge_base (question, answer, category) VALUES
  ('How do I request a quote from a vendor?', 'To request a quote: 1) Go to the vendor section, 2) Select vendors to invite, 3) Fill out the RFQ form with scope details, 4) Attach relevant documents, 5) Set a deadline, 6) Send the request. The system will track responses automatically.', 'vendor_management'),
  ('What documents do I need from vendors?', 'Required vendor documents typically include: W9 tax form, Certificate of Insurance (COI), Banking information for ACH payments, Signed contract or agreement. These ensure compliance and enable smooth payment processing.', 'vendor_onboarding'),
  ('How are emails automatically categorized?', 'Emails are categorized using AI that analyzes: Subject line patterns, Sender information, Email body content, Attachment types. Categories include: vendor, client, permit, invoice, quote, RFI, and general.', 'email_management');

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;