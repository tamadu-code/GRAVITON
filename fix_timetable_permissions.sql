-- FIX TIMETABLE PERMISSIONS
-- This ensures the table is accessible to the app

-- 1. Ensure RLS is enabled
ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing failing policies
DROP POLICY IF EXISTS "Enable all for all" ON timetable;
DROP POLICY IF EXISTS "Public Access" ON timetable;

-- 3. Create a robust policy for all operations
CREATE POLICY "Allow Full Access" ON timetable 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 4. Grant explicit table permissions (for the API role)
GRANT ALL ON TABLE timetable TO anon, authenticated, service_role;
