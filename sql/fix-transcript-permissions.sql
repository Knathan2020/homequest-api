-- Fix permissions for call_transcripts table
-- Run this in Supabase SQL Editor

-- Enable Row Level Security
ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable all access for service role" ON public.call_transcripts;

-- Create policy to allow service role full access
CREATE POLICY "Enable all access for service role" ON public.call_transcripts
  FOR ALL USING (true);

-- Grant necessary permissions to service role
GRANT ALL ON public.call_transcripts TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Test the permissions by inserting a sample record
INSERT INTO public.call_transcripts (
  call_id,
  speaker,
  text,
  spoken_at
) VALUES (
  'test-call-permissions',
  'TEST',
  'Testing database permissions for transcript system',
  NOW()
);

-- Check if the insert worked
SELECT * FROM public.call_transcripts WHERE call_id = 'test-call-permissions';

-- Clean up test record
DELETE FROM public.call_transcripts WHERE call_id = 'test-call-permissions';