-- ----------------------------------------------------------------
-- SETUP E-LEARNING STORAGE BUCKET WITH MULTI-TENANT ISOLATION
-- ----------------------------------------------------------------

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('elearning', 'elearning', true)
ON CONFLICT (id) DO NOTHING;

-- Disable any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Delete Access" ON storage.objects;

-- 2. Allow Read Access only to authenticated users belonging to the same tenant as the folder path
CREATE POLICY "Tenant Read Access"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'elearning' 
    AND split_part(name, '/', 1) = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid()::text)
);

-- 3. Allow Upload Access only to authenticated users belonging to the same tenant as the folder path
CREATE POLICY "Tenant Upload Access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'elearning' 
    AND split_part(name, '/', 1) = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid()::text)
);

-- 4. Allow Update Access only to authenticated users belonging to the same tenant as the folder path
CREATE POLICY "Tenant Update Access"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'elearning' 
    AND split_part(name, '/', 1) = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid()::text)
);

-- 5. Allow Delete Access only to authenticated users belonging to the same tenant as the folder path
CREATE POLICY "Tenant Delete Access"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'elearning' 
    AND split_part(name, '/', 1) = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid()::text)
);
