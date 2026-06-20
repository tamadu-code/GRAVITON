-- Migration: Attendance System Database Sync Triggers
-- Description: Sets up triggers to push newly created/updated tenants (schools) and profiles (teachers/admins) to the Attendance System.

-- Enable pg_net extension if it does not exist
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Trigger Function to sync tenants/schools
CREATE OR REPLACE FUNCTION public.sync_tenant_to_attendance_system()
RETURNS TRIGGER AS $$
DECLARE
  attendance_url TEXT := 'https://wuzliodvddzmhehffqfx.supabase.co/functions/v1/create-tenant';
  secret_token TEXT := 'Tam360Du180';
BEGIN
  PERFORM
    net.http_post(
      url := attendance_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret_token
      ),
      body := jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'slug', NEW.slug,
        'student_id_prefix', NEW.student_id_prefix
      )
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_tenant_to_attendance_system failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger on tenants table
DROP TRIGGER IF EXISTS on_tenant_created ON public.tenants;
CREATE TRIGGER on_tenant_created
  AFTER INSERT OR UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_to_attendance_system();

-- 2. Trigger Function to sync users (Teachers/Admins)
CREATE OR REPLACE FUNCTION public.sync_user_to_attendance_system()
RETURNS TRIGGER AS $$
DECLARE
  attendance_url TEXT := 'https://wuzliodvddzmhehffqfx.supabase.co/functions/v1/create-user';
  secret_token TEXT := 'Tam360Du180';
  mapped_role TEXT;
BEGIN
  -- Determine and map the user role
  IF NEW.role = 'Teacher' THEN
    mapped_role := 'Teacher';
  ELSIF NEW.role = 'Admin' OR NEW.role = 'SuperAdmin' THEN
    mapped_role := 'Admin';
  ELSE
    RETURN NEW; -- Skip students, parents, etc.
  END IF;

  -- Call the Attendance System Edge Function
  PERFORM
    net.http_post(
      url := attendance_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret_token
      ),
      body := jsonb_build_object(
        'email', NEW.email,
        'full_name', NEW.full_name,
        'role', mapped_role,
        'tenant_id', NEW.tenant_id
      )
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_user_to_attendance_system failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger on profiles table
DROP TRIGGER IF EXISTS on_user_created ON public.profiles;
CREATE TRIGGER on_user_created
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_to_attendance_system();
