-- Add check_in and check_out to attendance_records
ALTER TABLE attendance_records 
ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;

-- Add subject-specific attendance support to the table if not already present
-- (The UI seems to want to save subject-based attendance too)
ALTER TABLE attendance_records
ADD COLUMN IF NOT EXISTS subject_name TEXT,
ADD COLUMN IF NOT EXISTS period_number INTEGER,
ADD COLUMN IF NOT EXISTS is_subject_based BOOLEAN DEFAULT FALSE;

-- Update unique constraint to support multiple records per day if they are subject-based
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_student_id_date_key;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_unique_entry 
UNIQUE (student_id, date, is_subject_based, subject_name, period_number);
