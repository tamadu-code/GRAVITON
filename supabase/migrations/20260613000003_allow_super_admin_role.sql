-- Migration: Allow SuperAdmin Role in Profiles
-- Description: Alters the CHECK constraint on public.profiles to allow 'SuperAdmin' role.

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check CHECK (role IN ('Admin', 'Teacher', 'Student', 'Parent', 'Staff', 'Principal', 'SuperAdmin', 'Pending'));
