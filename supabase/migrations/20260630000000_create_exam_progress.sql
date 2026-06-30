-- Migration: Create exam_progress table
-- Description: Creates the cbt exam progress tracking table with tenant isolation.

CREATE TABLE IF NOT EXISTS public.exam_progress (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES public.cbt_exams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    current_question INT DEFAULT 0,
    answers JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

-- Enable RLS
ALTER TABLE public.exam_progress ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON TABLE public.exam_progress TO postgres;
GRANT ALL ON TABLE public.exam_progress TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_progress TO anon;

-- Apply Tenant Isolation Policies (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "tenant_select_exam_progress" ON public.exam_progress;
CREATE POLICY "tenant_select_exam_progress" ON public.exam_progress 
    FOR SELECT TO authenticated 
    USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "tenant_insert_exam_progress" ON public.exam_progress;
CREATE POLICY "tenant_insert_exam_progress" ON public.exam_progress 
    FOR INSERT TO authenticated 
    WITH CHECK (
        public.is_tenant_member(tenant_id) AND 
        (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id'))
    );

DROP POLICY IF EXISTS "tenant_update_exam_progress" ON public.exam_progress;
CREATE POLICY "tenant_update_exam_progress" ON public.exam_progress 
    FOR UPDATE TO authenticated 
    USING (public.is_tenant_member(tenant_id))
    WITH CHECK (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "tenant_delete_exam_progress" ON public.exam_progress;
CREATE POLICY "tenant_delete_exam_progress" ON public.exam_progress 
    FOR DELETE TO authenticated 
    USING (public.is_tenant_member(tenant_id));

-- Service Role Bypass Policy
DROP POLICY IF EXISTS "service_role_bypass_exam_progress" ON public.exam_progress;
CREATE POLICY "service_role_bypass_exam_progress" ON public.exam_progress 
    FOR ALL TO service_role 
    USING (true) 
    WITH CHECK (true);
