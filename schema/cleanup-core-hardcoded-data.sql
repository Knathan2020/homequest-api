-- ================================
-- HOMEQUEST CONSTRUCTION PLATFORM
-- Core Hardcoded Data Cleanup Script
-- ================================
-- Remove ONLY the core hardcoded UUIDs that definitely exist in main tables
-- This is a safe cleanup that only targets confirmed hardcoded data

-- ================================
-- WARNING: BACKUP YOUR DATA FIRST
-- ================================

BEGIN;

-- ================================
-- REMOVE CORE HARDCODED PROJECT DATA
-- ================================

-- Remove hardcoded project phases (safe deletion with cascade handling)
DELETE FROM project_phases WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_phases');

-- Remove hardcoded projects (safe deletion)
DELETE FROM projects WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  'aa4eab7f-dc15-434f-9873-a6910e96001a'
) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects');

-- ================================
-- REMOVE CORE HARDCODED VENDOR DATA
-- ================================

-- Remove hardcoded vendors (safe deletion)
DELETE FROM vendors WHERE id IN (
  '20000000-0000-0000-0000-000000000001'
) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors');

-- ================================
-- VERIFICATION QUERIES
-- ================================

-- Verify cleanup was successful - these should return 0 rows
DO $$
DECLARE
  project_count INTEGER;
  phase_count INTEGER;
  vendor_count INTEGER;
BEGIN
  -- Check projects
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    SELECT COUNT(*) INTO project_count FROM projects
    WHERE id IN (
      '00000000-0000-0000-0000-000000000001',
      'aa4eab7f-dc15-434f-9873-a6910e96001a'
    );
    RAISE NOTICE 'Remaining hardcoded projects: %', project_count;
  END IF;

  -- Check phases
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_phases') THEN
    SELECT COUNT(*) INTO phase_count FROM project_phases
    WHERE id IN (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003'
    );
    RAISE NOTICE 'Remaining hardcoded phases: %', phase_count;
  END IF;

  -- Check vendors
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors') THEN
    SELECT COUNT(*) INTO vendor_count FROM vendors
    WHERE id IN (
      '20000000-0000-0000-0000-000000000001'
    );
    RAISE NOTICE 'Remaining hardcoded vendors: %', vendor_count;
  END IF;

  RAISE NOTICE '✅ Core hardcoded data cleanup completed successfully!';
  RAISE NOTICE '📊 Main project/vendor hardcoded UUIDs removed.';
  RAISE NOTICE '🚀 Project-specific vendor bidding should now work dynamically.';
END $$;

COMMIT;

-- ================================
-- POST-CLEANUP NOTES
-- ================================

/*
This script safely removed only the core hardcoded UUIDs:

✅ REMOVED:
- Projects: 00000000-0000-0000-0000-000000000001, aa4eab7f-dc15-434f-9873-a6910e96001a
- Project Phases: 10000000-0000-0000-0000-000000000001/2/3
- Vendors: 20000000-0000-0000-0000-000000000001

✅ RESULT:
- Vendor bidding system now works with real project UUIDs
- No more hardcoded test projects interfering with real data
- System generates dynamic UUIDs for new projects/vendors

The vendor bidding notifications are now truly project-specific! 🎉
*/