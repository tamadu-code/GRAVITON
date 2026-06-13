-- Migration: Multi-Tenancy Column Lockdown
-- Description: Sets tenant_id to NOT NULL on all partitioned tables.
-- Removes the backward-compatibility fallback from is_tenant_member() function.

-- ============================================================
-- STEP 1: Alter columns to NOT NULL on all tenant-specific tables
-- ============================================================

DO $$
DECLARE
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
        'settings', 'audit_logs'
    ]
    LOOP
        BEGIN
            -- Enforce NOT NULL constraint
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', tbl);
            RAISE NOTICE 'Locked down tenant_id (NOT NULL) for table: %', tbl;
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Table % does not exist, skipping.', tbl;
        WHEN undefined_column THEN
            RAISE NOTICE 'Table % has no tenant_id column, skipping.', tbl;
        END;
    END LOOP;
END $$;


-- ============================================================
-- STEP 2: Simplify is_tenant_member() by removing NULL fallback
-- ============================================================

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

    -- Strict match validation
    RETURN row_tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id');
END;
$$;
