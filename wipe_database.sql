-- DANGEROUS: Wipes all operational data while keeping table structures.
-- Run this in your Supabase SQL Editor.

-- Disable triggers temporarily to avoid overhead
SET session_replication_role = 'replica';

-- Wipe all student and academic data
-- We use TRUNCATE with CASCADE to handle foreign key dependencies automatically.
TRUNCATE TABLE 
    attendance, 
    scores, 
    form_teachers, 
    subject_assignments, 
    subjects, 
    classes, 
    students,
    notices
RESTART IDENTITY CASCADE;

-- NOTE: We are NOT truncating 'profiles' so that you stay logged in.
-- If you want to wipe all user accounts too, uncomment the line below:
-- TRUNCATE TABLE profiles RESTART IDENTITY CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Verify counts (should all be 0)
SELECT 
    (SELECT COUNT(*) FROM students) as students_count,
    (SELECT COUNT(*) FROM scores) as scores_count,
    (SELECT COUNT(*) FROM attendance) as attendance_count;
