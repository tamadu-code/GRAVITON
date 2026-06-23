-- Migration: Add Student Sync Trigger
-- Description: Sets up a database trigger on the students table to call the sync-new-student Edge function.

CREATE OR REPLACE FUNCTION public.sync_student_to_attendance_system()
RETURNS TRIGGER AS $$
DECLARE
  sms_sync_url TEXT := 'https://urqygjltionvaxuacfzr.supabase.co/functions/v1/sync-new-student';
BEGIN
  PERFORM
    net.http_post(
      url := sms_sync_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'record', to_jsonb(NEW)
      )
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_student_to_attendance_system failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger on INSERT
DROP TRIGGER IF EXISTS on_student_created ON public.students;
CREATE TRIGGER on_student_created
  AFTER INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_student_to_attendance_system();

-- Bind trigger on UPDATE (only when class/name/sub_class changes, and NOT when attendance_code changes to prevent recursion)
DROP TRIGGER IF EXISTS on_student_updated ON public.students;
CREATE TRIGGER on_student_updated
  AFTER UPDATE ON public.students
  FOR EACH ROW
  WHEN (
    (NEW.name IS DISTINCT FROM OLD.name 
     OR NEW.class_name IS DISTINCT FROM OLD.class_name 
     OR NEW.sub_class IS DISTINCT FROM OLD.sub_class)
    AND NEW.attendance_code IS NOT DISTINCT FROM OLD.attendance_code
  )
  EXECUTE FUNCTION public.sync_student_to_attendance_system();
