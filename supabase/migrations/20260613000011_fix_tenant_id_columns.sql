-- Migration: Ensure tenant_id exists on ALL tables and notify PostgREST of schema changes
-- Description: Fixes missing tenant_id columns that silently failed in earlier migrations,
-- and sends NOTIFY to force PostgREST schema cache reload.

-- Ensure tenant_id on profiles (may have failed due to existing constraints)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tenant_id'
    ) THEN
        EXECUTE 'ALTER TABLE public.profiles ADD COLUMN tenant_id UUID REFERENCES public.tenants(id)';
        RAISE NOTICE 'Added tenant_id to profiles';
    END IF;
END $$;

-- Ensure tenant_id on duty_assignments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'duty_assignments' AND column_name = 'tenant_id'
    ) THEN
        EXECUTE 'ALTER TABLE public.duty_assignments ADD COLUMN tenant_id UUID REFERENCES public.tenants(id)';
        RAISE NOTICE 'Added tenant_id to duty_assignments';
    END IF;
END $$;

-- Ensure tenant_id on cbt_exam_questions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cbt_exam_questions' AND column_name = 'tenant_id'
    ) THEN
        EXECUTE 'ALTER TABLE public.cbt_exam_questions ADD COLUMN tenant_id UUID REFERENCES public.tenants(id)';
        RAISE NOTICE 'Added tenant_id to cbt_exam_questions';
    END IF;
END $$;

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
