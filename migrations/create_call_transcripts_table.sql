-- Create call_transcripts table for storing VAPI call transcription data
CREATE TABLE IF NOT EXISTS public.call_transcripts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id TEXT NOT NULL,
    speaker TEXT NOT NULL, -- 'assistant', 'user', or 'system'
    text TEXT NOT NULL,
    spoken_at TIMESTAMPTZ DEFAULT NOW(),
    confidence FLOAT, -- Speech recognition confidence score
    start_time FLOAT, -- Relative timestamp in call (seconds)
    end_time FLOAT, -- End timestamp for this segment
    is_final BOOLEAN DEFAULT true, -- Whether this is the final version
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON call_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_spoken_at ON call_transcripts(spoken_at);

-- Function to get formatted transcript for a call
CREATE OR REPLACE FUNCTION get_call_transcript(call_id_param TEXT)
RETURNS TABLE (
    speaker TEXT,
    text TEXT,
    spoken_at TIMESTAMPTZ,
    start_time FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.speaker,
        t.text,
        t.spoken_at,
        t.start_time
    FROM call_transcripts t
    WHERE t.call_id = call_id_param
    AND t.is_final = true
    ORDER BY t.start_time, t.spoken_at;
END;
$$ LANGUAGE plpgsql;