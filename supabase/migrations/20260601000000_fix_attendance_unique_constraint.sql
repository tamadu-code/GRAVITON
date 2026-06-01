-- Migration: Ensure attendance table has a unique constraint on (student_id, date)
-- Required for the receive-attendance edge function upsert to work correctly.

-- Add unique constraint if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'attendance_student_date_unique'
    ) THEN
        ALTER TABLE attendance
        ADD CONSTRAINT attendance_student_date_unique UNIQUE (student_id, date);
    END IF;
END $$;

-- Ensure updated_at column exists (needed for sync engine)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
