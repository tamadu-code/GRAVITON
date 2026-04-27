-- Supabase Scores Table CLEANUP
-- Removes old abbreviated columns and backfills ca + grade

-- 1. Drop the old abbreviated columns (they are all zeros, not used)
ALTER TABLE scores DROP COLUMN IF EXISTS ass;
ALTER TABLE scores DROP COLUMN IF EXISTS t1;
ALTER TABLE scores DROP COLUMN IF EXISTS t2;
ALTER TABLE scores DROP COLUMN IF EXISTS prj;

-- 2. Backfill the 'ca' column (assignment + test1 + test2 + project)
UPDATE scores SET ca = COALESCE(assignment, 0) + COALESCE(test1, 0) + COALESCE(test2, 0) + COALESCE(project, 0);

-- 3. Backfill the 'grade' column based on the total
UPDATE scores SET grade = CASE
    WHEN total >= 75 THEN 'A1'
    WHEN total >= 70 THEN 'B2'
    WHEN total >= 65 THEN 'B3'
    WHEN total >= 60 THEN 'C4'
    WHEN total >= 55 THEN 'C5'
    WHEN total >= 50 THEN 'C6'
    WHEN total >= 45 THEN 'D7'
    WHEN total >= 40 THEN 'E8'
    ELSE 'F9'
END
WHERE grade IS NULL;

-- End of cleanup
