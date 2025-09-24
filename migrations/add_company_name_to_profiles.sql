-- Add company_name and other missing fields to profiles table
-- This allows individual users (not just teams) to store company information

-- Add missing columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS full_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS company_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'builder',
ADD COLUMN IF NOT EXISTS license_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS preferred_trade VARCHAR(100),
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Update existing role column if it exists but is too small
ALTER TABLE profiles 
ALTER COLUMN role TYPE VARCHAR(50);

-- Create index for company searches
CREATE INDEX IF NOT EXISTS idx_profiles_company_name ON profiles(company_name);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Example usage after running this migration:
-- INSERT INTO profiles (id, email, full_name, company_name, role) 
-- VALUES (
--   gen_random_uuid(),
--   'john@example.com', 
--   'John Doe',
--   'Acme Construction',
--   'builder'
-- );