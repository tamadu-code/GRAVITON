-- Migration: Create Scores Table If Not Exists
-- Description: Ensures the public.scores table exists with all academic score entry fields
-- (assignment, test1, test2, project, exam, ca, total), enables RLS, and sets up explicit grants.

CREATE TABLE IF NOT EXISTS public.scores (
    id VARCHAR(255) PRIMARY KEY,
    student_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    term VARCHAR(50) NOT NULL,
    session VARCHAR(50) NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    assignment NUMERIC DEFAULT NULL,
    test1 NUMERIC DEFAULT NULL,
    test2 NUMERIC DEFAULT NULL,
    project NUMERIC DEFAULT NULL,
    exam NUMERIC DEFAULT NULL,
    ca NUMERIC DEFAULT NULL,
    total NUMERIC DEFAULT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    rank VARCHAR(50)
);

-- Enable RLS
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

-- Policies for scores
CREATE POLICY "Enable read access for authenticated users on scores" ON public.scores
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert/update/delete access for authenticated users on scores" ON public.scores
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Explicit grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scores TO anon, authenticated, service_role;
