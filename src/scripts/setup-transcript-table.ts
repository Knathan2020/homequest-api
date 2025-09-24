/**
 * Setup call_transcripts table in Supabase
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function setupTranscriptTable() {
  try {
    console.log('📊 Setting up call_transcripts table...');

    // First, let's check if the table exists by trying to query it
    const { data: existingData, error: queryError } = await supabase
      .from('call_transcripts')
      .select('*')
      .limit(1);

    if (queryError && queryError.code === 'PGRST106') {
      console.log('ℹ️ Table does not exist. Please create it manually in Supabase SQL Editor:');
      console.log(`
-- Run this in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.call_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL,
  speaker VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  spoken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence DECIMAL(5,4),
  start_time DECIMAL(10,3),
  end_time DECIMAL(10,3),
  is_final BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON public.call_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_spoken_at ON public.call_transcripts(spoken_at);

-- Enable RLS (Row Level Security)
ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Enable all access for service role" ON public.call_transcripts
  FOR ALL USING (true);
      `);
      return;
    } else if (queryError) {
      console.error('❌ Permission error accessing table:', queryError);
      console.log('ℹ️ The table exists but there are permission issues.');
      console.log('Please run this in Supabase SQL Editor to fix permissions:');
      console.log(`
-- Fix permissions:
ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
DROP POLICY IF EXISTS "Enable all access for service role" ON public.call_transcripts;
CREATE POLICY "Enable all access for service role" ON public.call_transcripts
  FOR ALL USING (true);
      `);
      return;
    }

    console.log('✅ call_transcripts table exists and is accessible!');

    // Test insert and select
    console.log('🧪 Testing table access...');

    const testData = {
      call_id: 'test-call-123',
      speaker: 'AI',
      text: 'Hello, this is a test transcript.',
      spoken_at: new Date().toISOString(),
      confidence: 0.95,
      is_final: true
    };

    const { data: insertData, error: insertError } = await supabase
      .from('call_transcripts')
      .insert(testData)
      .select();

    if (insertError) {
      console.error('❌ Insert test failed:', insertError);
      return;
    }

    console.log('✅ Insert test successful:', insertData);

    // Clean up test data
    await supabase
      .from('call_transcripts')
      .delete()
      .eq('call_id', 'test-call-123');

    console.log('✅ Table setup complete and tested!');

  } catch (error: any) {
    console.error('❌ Setup failed:', error.message);
  }
}

setupTranscriptTable();