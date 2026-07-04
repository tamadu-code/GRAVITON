-- Migration: Fix service_role bypass RLS policies
-- Description: Re-applies service_role bypass policies on all tenant-partitioned tables.
-- The original migration created these policies but they appear to not be active,
-- causing Edge Functions (which use service_role) to be unable to SELECT rows.

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
        'notices', 'duty_assignments',
        'payments', 'fee_structures', 'pins',
        'settings', 'audit_logs'
    ]
    LOOP
        -- Skip tables that don't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl AND table_schema = 'public') THEN
            RAISE NOTICE 'Skipping non-existent table: %', tbl;
            CONTINUE;
        END IF;

        -- Drop and re-create service_role bypass policy
        EXECUTE format('DROP POLICY IF EXISTS "service_role_bypass_%s" ON public.%I', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY "service_role_bypass_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            tbl, tbl
        );

        RAISE NOTICE 'service_role bypass policy re-applied for table: %', tbl;
    END LOOP;
END $$;

-- Also fix tenants, subscriptions, sms_configurations
DROP POLICY IF EXISTS "tenants_service_role" ON public.tenants;
CREATE POLICY "tenants_service_role" ON public.tenants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions' AND table_schema = 'public') THEN
        EXECUTE 'DROP POLICY IF EXISTS "subscriptions_service_role" ON public.subscriptions';
        EXECUTE 'CREATE POLICY "subscriptions_service_role" ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_configurations' AND table_schema = 'public') THEN
        EXECUTE 'DROP POLICY IF EXISTS "sms_config_service_role" ON public.sms_configurations';
        EXECUTE 'CREATE POLICY "sms_config_service_role" ON public.sms_configurations FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_subscriptions' AND table_schema = 'public') THEN
        EXECUTE 'DROP POLICY IF EXISTS "service_role_bypass_push_subscriptions" ON public.push_subscriptions';
        EXECUTE 'CREATE POLICY "service_role_bypass_push_subscriptions" ON public.push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;
