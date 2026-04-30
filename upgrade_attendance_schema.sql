-- UPGRADE ATTENDANCE RECORDS SCHEMA
-- Adds time tracking and subject-based attendance support

ALTER TABLE attendance_records 
ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subject_name TEXT,
ADD COLUMN IF NOT EXISTS period_number INTEGER,
ADD COLUMN IF NOT EXISTS is_subject_based BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update unique constraint to allow multiple records per day for different subjects/periods
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_student_id_date_key;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_composite_key 
UNIQUE (student_id, date, is_subject_based, subject_name, period_number);

-- CREATE TIMETABLE TABLE
CREATE TABLE IF NOT EXISTS timetable (
    id TEXT PRIMARY KEY,
    class_name TEXT NOT NULL,
    day_of_week TEXT NOT NULL,
    period_number INTEGER NOT NULL,
    subject_id TEXT,
    teacher_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_name, day_of_week, period_number)
);

-- Enable RLS for the new table
ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for all" ON timetable FOR ALL USING (true) WITH CHECK (true);
