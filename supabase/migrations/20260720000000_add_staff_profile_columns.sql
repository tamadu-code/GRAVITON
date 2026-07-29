-- Migration: Add missing staff profile columns
-- Adds qualification, department, phone, and signature columns to profiles
-- These columns are used by the staff management UI but were never formally migrated

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature TEXT;

-- Force PostgREST to reload its schema cache so the new columns are immediately available
NOTIFY pgrst, 'reload schema';
