-- Supabase Scores Table - Ranking and New Grading System
-- Adds 'rank' column and updates grading to A+, A, B+ style

-- 1. Add the 'rank' column (using 'rank' to match my local db.js)
ALTER TABLE scores ADD COLUMN IF NOT EXISTS rank TEXT;

-- 2. Update the 'grade' column based on the new system (A+, A, A-, B+, etc.)
UPDATE scores SET grade = CASE
    WHEN total >= 95 THEN 'A+'
    WHEN total >= 90 THEN 'A'
    WHEN total >= 85 THEN 'A-'
    WHEN total >= 80 THEN 'B+'
    WHEN total >= 75 THEN 'B'
    WHEN total >= 70 THEN 'B-'
    WHEN total >= 65 THEN 'C+'
    WHEN total >= 60 THEN 'C'
    WHEN total >= 55 THEN 'C-'
    WHEN total >= 50 THEN 'D+'
    WHEN total >= 45 THEN 'D'
    WHEN total >= 40 THEN 'D-'
    ELSE 'F'
END;

-- 3. (Optional) Backfill ranks for existing records
-- This is complex for a single SQL query because it's per subject/class/term/session.
-- We'll let the frontend 'Commit Grades' handle this for active records.
