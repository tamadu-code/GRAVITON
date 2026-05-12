-- Fix foreign key constraint to allow cascading deletes
-- This prevents the "foreign key constraint" error when deleting a class

ALTER TABLE subject_assignments
DROP CONSTRAINT IF EXISTS subject_assignments_class_name_fkey;

ALTER TABLE subject_assignments
ADD CONSTRAINT subject_assignments_class_name_fkey
FOREIGN KEY (class_name) REFERENCES classes(name) 
ON DELETE CASCADE 
ON UPDATE CASCADE;
