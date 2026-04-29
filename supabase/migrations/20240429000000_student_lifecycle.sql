-- Migration: Student Lifecycle Management
-- Description: Adds soft-delete, attendance codes, and creates attendance_records table.

-- 1. Update students table
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS attendance_code INTEGER UNIQUE,
ADD COLUMN IF NOT EXISTS admission_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
ADD COLUMN IF NOT EXISTS sub_class VARCHAR(1),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS legacy_student_id TEXT;

-- 2. Create attendance_records table
CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    student_id TEXT REFERENCES students(student_id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, date)
);

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS idx_students_is_active ON students(is_active);
CREATE INDEX IF NOT EXISTS idx_students_attendance_code ON students(attendance_code);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON attendance_records(student_id);

-- 4. RLS (Optional, but recommended if not already set)
-- ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
-- Add policies as needed based on existing SMS structure
