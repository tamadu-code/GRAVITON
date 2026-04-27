-- Supabase Schema Update for Scores Table
-- This script alters the scores table to match the UI's granular CA structure and tracking fields.

-- 1. Add the missing granular tracking fields (Term, Session, Class)
ALTER TABLE scores ADD COLUMN IF NOT EXISTS class_name TEXT;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS session TEXT;

-- 2. Add the granular CA fields
ALTER TABLE scores ADD COLUMN IF NOT EXISTS assignment NUMERIC DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS test1 NUMERIC DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS test2 NUMERIC DEFAULT 0;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS project NUMERIC DEFAULT 0;

-- 3. Add the CA subtotal field
ALTER TABLE scores ADD COLUMN IF NOT EXISTS ca NUMERIC DEFAULT 0;

-- 4. Drop the OLD columns (CASCADE removes the computed 'total' that depends on ca1)
ALTER TABLE scores DROP COLUMN IF EXISTS ca1 CASCADE;
ALTER TABLE scores DROP COLUMN IF EXISTS ca2 CASCADE;

-- 5. Recreate 'total' as a plain numeric column (since CASCADE removed the old computed one)
ALTER TABLE scores ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;

-- 6. Recreate 'grade' in case it was also computed from ca1/ca2
ALTER TABLE scores ADD COLUMN IF NOT EXISTS grade TEXT;

-- 7. If the updated_at column is missing, add it
ALTER TABLE scores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- End of script
