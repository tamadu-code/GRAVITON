-- Split existing class_name into class_name and sub_class
-- e.g., 'JSS 1A' -> class_name='JSS 1', sub_class='A'
UPDATE students
SET 
    sub_class = UPPER(RIGHT(class_name, 1)),
    class_name = TRIM(LEFT(class_name, LENGTH(class_name) - 1))
WHERE 
    sub_class IS NULL 
    AND class_name ~ '.*[A-Z]$';

-- Ensure all students have is_active = true if null
UPDATE students SET is_active = true WHERE is_active IS NULL;
