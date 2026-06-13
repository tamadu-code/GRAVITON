-- Migration: Multi-Tenancy RLS & Auth Claims
-- Description: Enables Row Level Security on all tables with tenant-aware policies.
-- Creates a custom auth hook to inject tenant_id and role into JWT claims.
-- SuperAdmin users bypass tenant restrictions for global management.

-- ============================================================
-- STEP 1: Custom Claims Function
-- This function is called by the auth hook to inject tenant_id
-- and role into the JWT when a user logs in.
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    claims jsonb;
    user_tenant_id uuid;
    user_role text;
    raw_user_id text;
BEGIN
    -- 1. Safety check: if event or claims is null, return event as-is
    IF event IS NULL OR event->'claims' IS NULL THEN
        RETURN event;
    END IF;

    claims := event->'claims';
    raw_user_id := event->>'user_id';

    -- Fallback to nested user id if top-level is null
    IF raw_user_id IS NULL AND event->'user' IS NOT NULL THEN
        raw_user_id := event->'user'->>'id';
    END IF;

    -- 2. Query profiles only if raw_user_id is a valid UUID
    IF raw_user_id IS NOT NULL AND raw_user_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        BEGIN
            SELECT p.tenant_id, p.role INTO user_tenant_id, user_role
            FROM public.profiles p
            WHERE p.id = raw_user_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            user_tenant_id := NULL;
            user_role := NULL;
        END;
    END IF;

    -- 3. Set the claims
    IF user_tenant_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
    END IF;

    IF user_role IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    ELSE
        claims := jsonb_set(claims, '{user_role}', '"Student"');
    END IF;

    -- 4. Update the event with the modified claims
    event := jsonb_set(event, '{claims}', claims);

    RETURN event;
EXCEPTION WHEN OTHERS THEN
    -- Fallback: return the original event object if anything unexpected fails
    RETURN event;
END;
$$;

-- Grant the supabase_auth_admin role permission to call this function
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Grant read access to profiles so the hook can look up tenant_id and role
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;

-- Revoke execution from general authenticated users for security
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;


-- ============================================================
-- STEP 2: Helper function for RLS policy checks
-- Reusable function that returns TRUE if the user is a SuperAdmin
-- or if the row's tenant_id matches the user's JWT claim.
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

    -- Check tenant_id matches (with backward-compat fallback for null tenant_id during migration)
    IF row_tenant_id IS NULL THEN
        RETURN true;  -- Allow access to records that haven't been backfilled yet
    END IF;

    RETURN row_tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_member TO authenticated, service_role;


-- ============================================================
-- STEP 3: Enable RLS and create policies for all tenant-partitioned tables
-- Pattern: SELECT/INSERT/UPDATE/DELETE all use is_tenant_member()
-- ============================================================

-- Helper: macro to apply RLS to a table
-- We use DO blocks since CREATE POLICY doesn't support variables

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
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

        -- Drop existing policies if they exist (idempotent)
        EXECUTE format('DROP POLICY IF EXISTS "tenant_select_%s" ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "service_role_bypass_%s" ON public.%I', tbl, tbl);

        -- SELECT: Users can only read rows belonging to their tenant
        EXECUTE format(
            'CREATE POLICY "tenant_select_%s" ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id))',
            tbl, tbl
        );

        -- INSERT: Users can only insert rows with their own tenant_id
        EXECUTE format(
            'CREATE POLICY "tenant_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id))',
            tbl, tbl
        );

        -- UPDATE: Users can only update rows belonging to their tenant
        EXECUTE format(
            'CREATE POLICY "tenant_update_%s" ON public.%I FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id))',
            tbl, tbl
        );

        -- DELETE: Users can only delete rows belonging to their tenant
        EXECUTE format(
            'CREATE POLICY "tenant_delete_%s" ON public.%I FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id))',
            tbl, tbl
        );

        -- SERVICE ROLE: Full bypass for Edge Functions and server-side operations
        EXECUTE format(
            'CREATE POLICY "service_role_bypass_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            tbl, tbl
        );

        RAISE NOTICE 'RLS enabled and policies created for table: %', tbl;
    END LOOP;
END $$;


-- ============================================================
-- STEP 4: RLS for the new multi-tenancy management tables
-- ============================================================

-- tenants: Only SuperAdmins can manage tenants; authenticated users can read their own
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_select" ON public.tenants;
CREATE POLICY "tenants_select" ON public.tenants
    FOR SELECT TO authenticated
    USING (
        id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin'
    );

DROP POLICY IF EXISTS "tenants_manage" ON public.tenants;
CREATE POLICY "tenants_manage" ON public.tenants
    FOR ALL TO authenticated
    USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin')
    WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin');

DROP POLICY IF EXISTS "tenants_service_role" ON public.tenants;
CREATE POLICY "tenants_service_role" ON public.tenants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subscriptions: Only SuperAdmins and the tenant's own admin can read
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
CREATE POLICY "subscriptions_select" ON public.subscriptions
    FOR SELECT TO authenticated
    USING (
        tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin'
    );

DROP POLICY IF EXISTS "subscriptions_manage" ON public.subscriptions;
CREATE POLICY "subscriptions_manage" ON public.subscriptions
    FOR ALL TO authenticated
    USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin')
    WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin');

DROP POLICY IF EXISTS "subscriptions_service_role" ON public.subscriptions;
CREATE POLICY "subscriptions_service_role" ON public.subscriptions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- sms_configurations: Tenant admins can manage their own; SuperAdmin can manage all
ALTER TABLE public.sms_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_config_select" ON public.sms_configurations;
CREATE POLICY "sms_config_select" ON public.sms_configurations
    FOR SELECT TO authenticated
    USING (
        tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin'
    );

DROP POLICY IF EXISTS "sms_config_manage" ON public.sms_configurations;
CREATE POLICY "sms_config_manage" ON public.sms_configurations
    FOR ALL TO authenticated
    USING (
        (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')
            AND (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') IN ('Admin', 'SuperAdmin'))
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin'
    )
    WITH CHECK (
        (tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')
            AND (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') IN ('Admin', 'SuperAdmin'))
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin'
    );

DROP POLICY IF EXISTS "sms_config_service_role" ON public.sms_configurations;
CREATE POLICY "sms_config_service_role" ON public.sms_configurations
    FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- STEP 5: Allow anon read on push_subscriptions (if it exists)
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_subscriptions' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "tenant_select_push_subscriptions" ON public.push_subscriptions';
        EXECUTE 'CREATE POLICY "tenant_select_push_subscriptions" ON public.push_subscriptions FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id))';
        EXECUTE 'DROP POLICY IF EXISTS "service_role_bypass_push_subscriptions" ON public.push_subscriptions';
        EXECUTE 'CREATE POLICY "service_role_bypass_push_subscriptions" ON public.push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;
