-- Create room_selections table
-- Run this SQL in your Supabase Dashboard under SQL Editor

CREATE TABLE IF NOT EXISTS public.room_selections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  floor_plan_id UUID,
  project_id UUID NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  document_url TEXT NOT NULL,
  document_type VARCHAR(50) DEFAULT 'pdf',
  file_size BIGINT,
  extracted_data JSONB DEFAULT '{}',
  room_mappings JSONB DEFAULT '[]',
  ai_confidence NUMERIC(5,2) DEFAULT 0,
  validation_status VARCHAR(50) DEFAULT 'pending',
  validated_at TIMESTAMP WITH TIME ZONE,
  user_notes TEXT,
  manual_overrides JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_room_selections_project_id ON public.room_selections(project_id);
CREATE INDEX IF NOT EXISTS idx_room_selections_floor_plan_id ON public.room_selections(floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_room_selections_validation_status ON public.room_selections(validation_status);
CREATE INDEX IF NOT EXISTS idx_room_selections_created_at ON public.room_selections(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.room_selections ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy for viewing room selections
DROP POLICY IF EXISTS "Users can view room selections" ON public.room_selections;
CREATE POLICY "Users can view room selections" ON public.room_selections
  FOR SELECT USING (true);

-- Policy for inserting room selections
DROP POLICY IF EXISTS "Users can insert room selections" ON public.room_selections;
CREATE POLICY "Users can insert room selections" ON public.room_selections
  FOR INSERT WITH CHECK (true);

-- Policy for updating room selections
DROP POLICY IF EXISTS "Users can update room selections" ON public.room_selections;
CREATE POLICY "Users can update room selections" ON public.room_selections
  FOR UPDATE USING (true);

-- Policy for deleting room selections
DROP POLICY IF EXISTS "Users can delete room selections" ON public.room_selections;
CREATE POLICY "Users can delete room selections" ON public.room_selections
  FOR DELETE USING (true);

-- Grant necessary permissions
GRANT ALL ON public.room_selections TO anon;
GRANT ALL ON public.room_selections TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
