-- Migration: Create E-Learning Schema
-- Description: Creates tables for modules, content, progress, assignments, submissions, and comments with tenant isolation.

CREATE TABLE IF NOT EXISTS public.elearning_modules (
    id VARCHAR(255) PRIMARY KEY,
    subject_id TEXT NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.elearning_contents (
    id VARCHAR(255) PRIMARY KEY,
    module_id VARCHAR(255) NOT NULL REFERENCES public.elearning_modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- 'notes', 'video', 'document', 'link'
    body_text TEXT,
    attachment_url TEXT,
    video_url TEXT,
    sort_order INT DEFAULT 0,
    tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.elearning_progress (
    id VARCHAR(255) PRIMARY KEY,
    student_id TEXT NOT NULL,
    content_id VARCHAR(255) NOT NULL REFERENCES public.elearning_contents(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    UNIQUE(student_id, content_id)
);

CREATE TABLE IF NOT EXISTS public.elearning_assignments (
    id VARCHAR(255) PRIMARY KEY,
    module_id VARCHAR(255) NOT NULL REFERENCES public.elearning_modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    instructions TEXT,
    due_date TIMESTAMPTZ,
    max_marks NUMERIC DEFAULT 100,
    tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.elearning_submissions (
    id VARCHAR(255) PRIMARY KEY,
    assignment_id VARCHAR(255) NOT NULL REFERENCES public.elearning_assignments(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    submission_text TEXT,
    attachment_url TEXT,
    submitted_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    grade NUMERIC DEFAULT NULL,
    feedback TEXT,
    graded_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    graded_at TIMESTAMPTZ,
    tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    UNIQUE(student_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS public.elearning_comments (
    id VARCHAR(255) PRIMARY KEY,
    content_id VARCHAR(255) NOT NULL REFERENCES public.elearning_contents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_elearning_modules_subject_id ON public.elearning_modules(subject_id);
CREATE INDEX IF NOT EXISTS idx_elearning_modules_class_name ON public.elearning_modules(class_name);
CREATE INDEX IF NOT EXISTS idx_elearning_contents_module_id ON public.elearning_contents(module_id);
CREATE INDEX IF NOT EXISTS idx_elearning_progress_student_id ON public.elearning_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_elearning_assignments_module_id ON public.elearning_assignments(module_id);
CREATE INDEX IF NOT EXISTS idx_elearning_submissions_assignment_id ON public.elearning_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_elearning_submissions_student_id ON public.elearning_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_elearning_comments_content_id ON public.elearning_comments(content_id);

-- Enable RLS on all tables
ALTER TABLE public.elearning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elearning_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elearning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elearning_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elearning_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elearning_comments ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_modules TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_contents TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_progress TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_assignments TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_submissions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_comments TO authenticated, anon;

GRANT ALL ON TABLE public.elearning_modules TO postgres, service_role;
GRANT ALL ON TABLE public.elearning_contents TO postgres, service_role;
GRANT ALL ON TABLE public.elearning_progress TO postgres, service_role;
GRANT ALL ON TABLE public.elearning_assignments TO postgres, service_role;
GRANT ALL ON TABLE public.elearning_submissions TO postgres, service_role;
GRANT ALL ON TABLE public.elearning_comments TO postgres, service_role;

-- Tenant Isolation Policies for Modules
CREATE POLICY "tenant_select_elearning_modules" ON public.elearning_modules FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_elearning_modules" ON public.elearning_modules FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')));
CREATE POLICY "tenant_update_elearning_modules" ON public.elearning_modules FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_elearning_modules" ON public.elearning_modules FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "service_role_bypass_elearning_modules" ON public.elearning_modules FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant Isolation Policies for Content
CREATE POLICY "tenant_select_elearning_contents" ON public.elearning_contents FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_elearning_contents" ON public.elearning_contents FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')));
CREATE POLICY "tenant_update_elearning_contents" ON public.elearning_contents FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_elearning_contents" ON public.elearning_contents FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "service_role_bypass_elearning_contents" ON public.elearning_contents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant Isolation Policies for Progress
CREATE POLICY "tenant_select_elearning_progress" ON public.elearning_progress FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_elearning_progress" ON public.elearning_progress FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')));
CREATE POLICY "tenant_update_elearning_progress" ON public.elearning_progress FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_elearning_progress" ON public.elearning_progress FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "service_role_bypass_elearning_progress" ON public.elearning_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant Isolation Policies for Assignments
CREATE POLICY "tenant_select_elearning_assignments" ON public.elearning_assignments FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_elearning_assignments" ON public.elearning_assignments FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')));
CREATE POLICY "tenant_update_elearning_assignments" ON public.elearning_assignments FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_elearning_assignments" ON public.elearning_assignments FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "service_role_bypass_elearning_assignments" ON public.elearning_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant Isolation Policies for Submissions
CREATE POLICY "tenant_select_elearning_submissions" ON public.elearning_submissions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_elearning_submissions" ON public.elearning_submissions FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')));
CREATE POLICY "tenant_update_elearning_submissions" ON public.elearning_submissions FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_elearning_submissions" ON public.elearning_submissions FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "service_role_bypass_elearning_submissions" ON public.elearning_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant Isolation Policies for Comments
CREATE POLICY "tenant_select_elearning_comments" ON public.elearning_comments FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_insert_elearning_comments" ON public.elearning_comments FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')));
CREATE POLICY "tenant_update_elearning_comments" ON public.elearning_comments FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant_delete_elearning_comments" ON public.elearning_comments FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "service_role_bypass_elearning_comments" ON public.elearning_comments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
