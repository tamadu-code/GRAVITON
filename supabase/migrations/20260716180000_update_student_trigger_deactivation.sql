-- Migration: Update Student Sync Trigger for Deactivation/Graduation
-- Description: Re-binds the on_student_updated trigger on the public.students table to also fire when is_active or status changes.

DROP TRIGGER IF EXISTS on_student_updated ON public.students;

CREATE TRIGGER on_student_updated
  AFTER UPDATE ON public.students
  FOR EACH ROW
  WHEN (
    (
      NEW.name IS DISTINCT FROM OLD.name 
      OR NEW.class_name IS DISTINCT FROM OLD.class_name 
      OR NEW.sub_class IS DISTINCT FROM OLD.sub_class
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.status IS DISTINCT FROM OLD.status
    )
    AND NEW.attendance_code IS NOT DISTINCT FROM OLD.attendance_code
  )
  EXECUTE FUNCTION public.sync_student_to_attendance_system();
