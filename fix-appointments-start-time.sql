-- Fix appointments table by adding missing start_time column
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;

-- Also ensure end_time exists
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;

-- Update any NULL start_time values with created_at as default
UPDATE appointments 
SET start_time = created_at 
WHERE start_time IS NULL;