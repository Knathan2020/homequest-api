-- Add columns to phase_line_items for photo analysis and notes
ALTER TABLE phase_line_items
ADD COLUMN IF NOT EXISTS latest_notes TEXT,
ADD COLUMN IF NOT EXISTS last_photo_update TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS location_context TEXT,
ADD COLUMN IF NOT EXISTS plan_compliance TEXT;

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'phase_line_items'
AND column_name IN ('latest_notes', 'last_photo_update', 'progress_percentage', 'location_context', 'plan_compliance')
ORDER BY ordinal_position;