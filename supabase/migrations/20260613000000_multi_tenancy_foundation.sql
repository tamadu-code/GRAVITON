-- Migration: Multi-Tenancy Foundation
-- Description: Creates the tenants, subscriptions, and sms_configurations tables.
-- Adds nullable tenant_id to all existing tables for backward compatibility.
-- Creates a seed tenant for the existing school and backfills all records.

-- ============================================================
-- STEP 1: Create core multi-tenancy tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    student_id_prefix VARCHAR(20) NOT NULL DEFAULT 'NKQMS',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (plan_tier IN ('free', 'standard', 'premium', 'custom')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
    billing_provider VARCHAR(50),
    customer_id VARCHAR(255),
    subscription_id VARCHAR(255),
    max_student_limit INTEGER DEFAULT 500,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sms_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
    provider VARCHAR(50) NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'termii', 'twilio', 'africas_talking', 'custom')),
    api_key TEXT,
    sender_id VARCHAR(20),
    base_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_configurations_tenant_id ON public.sms_configurations(tenant_id);


-- ============================================================
-- STEP 2: Create seed tenant for the existing school
-- ============================================================

-- Insert the default tenant (the current school)
INSERT INTO public.tenants (id, name, slug, student_id_prefix, status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'NKQMS Default School',
    'nkqms-default',
    'NKQMS',
    'active'
) ON CONFLICT (id) DO NOTHING;

-- Give the seed tenant a lifetime custom subscription
INSERT INTO public.subscriptions (tenant_id, plan_tier, status, max_student_limit, expires_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'custom',
    'active',
    99999,
    '2099-12-31T23:59:59Z'
) ON CONFLICT DO NOTHING;


-- ============================================================
-- STEP 3: Add nullable tenant_id column to ALL existing tables
-- ============================================================

-- Identity & Profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.parent_links ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Academic Structure
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.subject_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.form_teachers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Performance & Records
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.student_analytics ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Attendance & Tracking
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- CBT
ALTER TABLE public.cbt_exams ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.cbt_exam_sections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.cbt_question_bank ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.cbt_options ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.cbt_questions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.cbt_results ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Communications
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.duty_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Finance & Inventory
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Admin
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);


-- ============================================================
-- STEP 4: Backfill all existing records with the seed tenant ID
-- ============================================================

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
        'settings', 'audit_logs'
    ]
    LOOP
        BEGIN
            EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', tbl, seed_tenant_id);
            RAISE NOTICE 'Backfilled tenant_id for table: %', tbl;
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Table % does not exist, skipping.', tbl;
        END;
    END LOOP;
END $$;


-- ============================================================
-- STEP 5: Create compound indexes for multi-tenant query performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_tenant ON public.students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_tenant_id ON public.students(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_classes_tenant ON public.classes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subjects_tenant ON public.subjects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scores_tenant ON public.scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON public.attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant ON public.attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_tenant ON public.cbt_exams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cbt_results_tenant ON public.cbt_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notices_tenant ON public.notices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON public.payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON public.settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);


-- ============================================================
-- STEP 6: Grant access to new tables for PostgREST roles
-- ============================================================

GRANT SELECT ON TABLE public.tenants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenants TO service_role;

GRANT SELECT ON TABLE public.subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO service_role;

GRANT SELECT ON TABLE public.sms_configurations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sms_configurations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sms_configurations TO service_role;
