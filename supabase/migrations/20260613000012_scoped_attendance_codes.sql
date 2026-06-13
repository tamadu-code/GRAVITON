-- Migration: Scoped Attendance Codes
-- Description: Drops the global unique constraint on students.attendance_code and replaces it with a composite unique constraint on (tenant_id, attendance_code) to support overlapping codes across different schools (tenants).

DO $$
BEGIN
    -- 1. Drop the global unique constraint if it exists
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_attendance_code_key;
    
    -- 2. Drop the index if it was created as a standalone index instead of a constraint
    DROP INDEX IF EXISTS public.students_attendance_code_key;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error dropping global constraint: %', SQLERRM;
END $$;

-- 3. Add the composite unique constraint
ALTER TABLE public.students 
ADD CONSTRAINT students_tenant_attendance_code_key UNIQUE (tenant_id, attendance_code);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
