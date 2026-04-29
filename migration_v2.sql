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
    student_id INTEGER REFERENCES students(id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, date)
);

-- Index for performance on code lookups if needed (though student_id is the FK)
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_students_active ON students(is_active) WHERE is_active = TRUE;
