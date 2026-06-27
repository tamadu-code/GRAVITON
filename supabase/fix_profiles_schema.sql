-- ============================================================
-- SQL Script to fix profiles schema mismatch
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Ensure tenant_id column exists on public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 2. Ensure assigned_id column exists on public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_id TEXT;

-- 3. Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
