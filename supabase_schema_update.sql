-- Supabase Schema Update for Scores Table
-- This script alters the scores table to match the UI's granular CA structure and tracking fields.

-- 1. Add the missing granular tracking fields (Term, Session, Class)
ALTER TABLE scores ADD COLUMN IF NOT EXISTS class_name TEXT;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS session TEXT;

-- 2. Add the granular CA fields
ALTER TABLE scores ADD COLUMN IF NOT EXISTS ass NUMERIC DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS t1 NUMERIC DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS t2 NUMERIC DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS prj NUMERIC DEFAULT 0;

-- 3. Add the CA subtotal field
ALTER TABLE scores ADD COLUMN IF NOT EXISTS ca NUMERIC DEFAULT 0;

-- 4. Optionally drop the old ca1 and ca2 columns if they are no longer needed
-- Uncomment the following lines if you want to permanently delete ca1 and ca2:
-- ALTER TABLE scores DROP COLUMN IF EXISTS ca1;
-- ALTER TABLE scores DROP COLUMN IF EXISTS ca2;

-- 5. If the updated_at column is missing, add it
ALTER TABLE scores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- End of script
