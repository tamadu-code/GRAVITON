-- Migration: Fix tenant isolation RLS and backfill NULL tenant_ids
-- Description:
-- 1. Backfills any NULL tenant_id values with the default/seed tenant UUID: '00000000-0000-0000-0000-000000000001'.
-- 2. Modifies the RLS helper function is_tenant_member() to remove the NULL tenant_id check, ensuring strict tenant isolation.

-- STEP 1: Backfill all NULL tenant_ids across all tenant-partitioned tables
DO $$
DECLARE
    seed_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'profiles', 'students', 'parent_links',
        'classes', 'subjects', 'subject_assignments', 'form_teachers', 'timetable',
        'scores', 'student_analytics',
        'attendance', 'attendance_records',
        'cbt_exams', 'cbt_exam_sections', 'cbt_question_bank', 'cbt_options', 'cbt_questions', 'cbt_results',
        'notices', 'duty_assignments', 'push_subscriptions',
        'payments', 'fee_structures', 'pins',
        'settings', 'audit_logs', 'cbt_exam_questions'
    ]
    LOOP
        BEGIN
            EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', tbl, seed_tenant_id);
            RAISE NOTICE 'Backfilled tenant_id for table: %', tbl;
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Table % does not exist, skipping.', tbl;
        WHEN OTHERS THEN
            RAISE NOTICE 'Failed to backfill table: %, error: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- STEP 2: Update is_tenant_member RLS helper function
-- Strict version: Does NOT allow access if row_tenant_id is NULL, unless the user is a SuperAdmin.
CREATE OR REPLACE FUNCTION public.is_tenant_member(row_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    -- SuperAdmin bypasses all tenant restrictions
    IF (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin' THEN
        RETURN true;
    END IF;

    -- Strict check: row_tenant_id must be non-null and match the tenant_id in JWT claims
    IF row_tenant_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN row_tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id');
END;
$$;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
